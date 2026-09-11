import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { approvePatch, canApprove, canFollowup, followupPatch } from "@/lib/tasks";
import { appendUpdate, isResponse, loadTask, snapshotName } from "@/lib/tasks-actions";

// 완료 확인 · 추가 요청 (PLAN 8차 37번, 2026-09-11 개편).
//
// 완료 보고를 받은 사람의 선택지 한 벌이다. 둘 다 같은 순간에 고르고, 누를 수 있는
// 조건도 같다(그 건의 assigner_id 이고 상태가 submitted 일 때).
//
//   approve  → done. 종결한다
//   followup → in_progress. 코멘트를 남겨 같은 건을 다시 돌린다
//
// 예전에는 followup 과 reject 가 따로 있었는데 하는 일이 똑같아서 「추가 요청」 하나로
// 합쳤다. reject 는 더 이상 받지 않는다 — 합치기 전에 쌓인 기록만 그 이름으로 남는다.
//
// 별건을 새로 만들지 않으므로 한 업무의 이력이 한 건에 모인다.
//
// PRD 비범위의 "승인/결재 절차"에 해당하지 않는다 — 문서 내용을 승인받는 절차가 아니라
// 업무를 종결하거나 이어가는 처리다 (PRD ⑨).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (session) => {
    const { id } = await params;
    const loaded = await loadTask(id);
    if (isResponse(loaded)) return loaded;
    const { task } = loaded;

    const payload = await request.json().catch(() => null);
    const decision = payload?.decision;
    const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";

    if (decision !== "approve" && decision !== "followup") {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const authorName = await snapshotName(session.employeeId);

    if (decision === "approve") {
      if (!canApprove(task, session.employeeId)) {
        return NextResponse.json({ error: "완료 확인을 할 수 없습니다." }, { status: 403 });
      }

      const result = await appendUpdate({
        taskId: id,
        authorId: session.employeeId,
        authorName,
        kind: "note",
        // 업무보고를 컨펌한 것이면 "완료를 확인했습니다"가 어색하다. 같은 동작이지만
        // 받은 사람 입장에서 읽히는 문장이 달라야 한다.
        body: task.kind === "report" ? "보고를 확인했습니다." : "완료를 확인했습니다.",
        taskPatch: approvePatch(new Date().toISOString()),
      });
      if (isResponse(result)) return result;
      return NextResponse.json({ ok: true });
    }

    if (!canFollowup(task, session.employeeId)) {
      return NextResponse.json({ error: "추가 요청을 할 수 없습니다." }, { status: 403 });
    }
    // 코멘트가 곧 다음 할 일이다. 비어 있으면 담당자는 무엇을 해야 할지 알 수 없다.
    // DB 도 빈 본문을 막지만 여기서 먼저 걸러 사람이 읽을 수 있는 메시지를 준다.
    if (!reason) {
      return NextResponse.json({ error: "추가로 요청할 내용을 입력해주세요." }, { status: 400 });
    }

    const result = await appendUpdate({
      taskId: id,
      authorId: session.employeeId,
      authorName,
      kind: "followup",
      body: reason,
      taskPatch: followupPatch(),
    });
    if (isResponse(result)) return result;
    return NextResponse.json({ ok: true });
  });
}
