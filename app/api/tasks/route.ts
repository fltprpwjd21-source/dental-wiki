import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getTaskInbox } from "@/lib/tasks-server";
import { isUuid } from "@/lib/uuid";

// 업무지시 목록·등록 (PLAN 8차 36번, PRD ⑨)

export async function GET() {
  return withSession(async (session) => {
    const inbox = await getTaskInbox(session.employeeId);
    return NextResponse.json(inbox);
  });
}

// 지시는 로그인한 스탭 누구나 낼 수 있다 (관리자 전용이 아니다 — 공지와 같다).
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    const body = await request.json().catch(() => null);

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.body === "string" ? body.body.trim() : "";
    const dueOn = typeof body?.dueOn === "string" && body.dueOn ? body.dueOn : null;
    const isLongterm = body?.isLongterm === true;
    const sourceNodeId = typeof body?.sourceNodeId === "string" && body.sourceNodeId ? body.sourceNodeId : null;
    const assigneeIds: string[] = Array.isArray(body?.assigneeIds)
      ? [
          ...new Set<string>(
            (body.assigneeIds as unknown[]).filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
          ),
        ]
      : [];

    if (!title) {
      return NextResponse.json({ error: "제목을 입력해주세요." }, { status: 400 });
    }
    if (assigneeIds.length === 0) {
      return NextResponse.json({ error: "담당자를 한 명 이상 골라주세요." }, { status: 400 });
    }
    // 날짜는 <input type="date"> 가 보내는 모양만 받는다. 다른 문자열이 오면 Postgres 가
    // 거부하면서 등록 전체가 500 이 되므로 여기서 400 으로 돌려준다.
    if (dueOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) {
      return NextResponse.json({ error: "마감일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (sourceNodeId !== null && !isUuid(sourceNodeId)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();

    // 연결한 보관함 항목이 실제로 있는지 확인한다. 없는 id 를 넣으면 화면에
    // 「삭제된 자료」만 남아 왜 그런지 알 수 없게 된다.
    if (sourceNodeId !== null) {
      const { data: node } = await supabase
        .from("nodes")
        .select("id, type, status")
        .eq("id", sourceNodeId)
        .maybeSingle();
      if (!node || node.status !== "active" || (node.type !== "folder" && node.type !== "note")) {
        return NextResponse.json({ error: "연결할 보관함 자료를 찾을 수 없습니다." }, { status: 422 });
      }
    }

    // 화면에서 목록으로 고르게 해도, 브라우저 콘솔에서는 아무 사원번호나 보낼 수 있다.
    // 실제로 등록된 사람인지 서버가 다시 확인한다 (이름 스냅샷도 여기서 함께 얻는다).
    const { data: people, error: peopleError } = await supabase
      .from("employee_whitelist")
      .select("employee_id, name")
      .in("employee_id", [...assigneeIds, session.employeeId]);

    if (peopleError) {
      return NextResponse.json({ error: "등록에 실패했습니다." }, { status: 500 });
    }

    const nameOf = new Map((people ?? []).map((p) => [p.employee_id as string, p.name as string | null]));
    const unknown = assigneeIds.filter((id) => !nameOf.has(id));
    if (unknown.length > 0) {
      return NextResponse.json({ error: "등록되지 않은 사원번호가 있습니다." }, { status: 422 });
    }

    // 이름은 지시를 만든 시점의 값을 함께 저장한다(스냅샷). 퇴사해서 화이트리스트에서
    // 지워져도 "누가 누구에게 시켰는지"는 남아야 하기 때문이다.
    // 화면은 화이트리스트의 지금 이름을 먼저 쓰고, 없을 때만 이 값으로 떨어진다.
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        title,
        body: content,
        assigner_id: session.employeeId,
        assigner_name: nameOf.get(session.employeeId) ?? null,
        is_longterm: isLongterm,
        due_on: dueOn,
        source_node_id: sourceNodeId,
      })
      .select("id")
      .single();

    if (taskError || !task) {
      console.error("[tasks] 등록 실패", taskError);
      return NextResponse.json({ error: "등록에 실패했습니다." }, { status: 500 });
    }

    const { error: assigneeError } = await supabase.from("task_assignees").insert(
      assigneeIds.map((id) => ({
        task_id: task.id,
        employee_id: id,
        employee_name: nameOf.get(id) ?? null,
      })),
    );

    // 담당자가 한 명도 안 붙은 지시는 아무에게도 안 보이면서 목록만 어지럽힌다.
    // 여기서 실패하면 방금 만든 지시를 도로 지운다 — 진행 기록이 아직 없으므로
    // 삭제 금지 트리거에 걸리지 않는다.
    if (assigneeError) {
      console.error("[tasks] 담당자 등록 실패", assigneeError);
      await supabase.from("tasks").delete().eq("id", task.id);
      return NextResponse.json({ error: "담당자 등록에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ id: task.id }, { status: 201 });
  });
}
