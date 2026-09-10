import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { canAck } from "@/lib/tasks";
import { isResponse, loadTask } from "@/lib/tasks-actions";

// 「확인」 체크 (PLAN 8차 37번).
//
// 진행 기록을 남기지 않는다 — 담당자가 셋이면 대화창이 확인 세 줄로 시작해서
// 정작 작업 이야기가 밀린다. 누가 확인했는지는 담당자 칸에 이미 보인다.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (session) => {
    const { id } = await params;
    const loaded = await loadTask(id);
    if (isResponse(loaded)) return loaded;

    if (!canAck(loaded.assignees, session.employeeId)) {
      return NextResponse.json({ error: "확인할 수 없습니다." }, { status: 403 });
    }

    const supabase = getServerSupabaseClient();
    const { error } = await supabase
      .from("task_assignees")
      .update({ acked_at: new Date().toISOString() })
      .eq("task_id", id)
      .eq("employee_id", session.employeeId);

    if (error) {
      return NextResponse.json({ error: "확인 처리에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  });
}
