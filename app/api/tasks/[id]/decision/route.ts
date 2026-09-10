import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { approvePatch, canApprove, canReject, rejectPatch } from "@/lib/tasks";
import { appendUpdate, isResponse, loadTask, snapshotName } from "@/lib/tasks-actions";

// 완료 확인과 반려 (PLAN 8차 37번).
//
// 지시자가 자기가 낸 업무를 종결하거나 되돌린다. PRD 비범위의 "승인/결재 절차"에
// 해당하지 않는다 — 문서 내용을 승인받는 절차가 아니라 종결 처리다 (PRD ⑨).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (session) => {
    const { id } = await params;
    const loaded = await loadTask(id);
    if (isResponse(loaded)) return loaded;
    const { task } = loaded;

    const payload = await request.json().catch(() => null);
    const decision = payload?.decision;
    const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";

    if (decision !== "approve" && decision !== "reject") {
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
        body: "완료를 확인했습니다.",
        taskPatch: approvePatch(new Date().toISOString()),
      });
      if (isResponse(result)) return result;
      return NextResponse.json({ ok: true });
    }

    if (!canReject(task, session.employeeId)) {
      return NextResponse.json({ error: "반려할 수 없습니다." }, { status: 403 });
    }
    // 사유 없이 되돌리면 담당자는 무엇을 고쳐야 할지 알 수 없다. DB 도 빈 본문을 막지만
    // 여기서 먼저 걸러 사람이 읽을 수 있는 메시지를 준다.
    if (!reason) {
      return NextResponse.json({ error: "반려 사유를 입력해주세요." }, { status: 400 });
    }

    const result = await appendUpdate({
      taskId: id,
      authorId: session.employeeId,
      authorName,
      kind: "reject",
      body: reason,
      taskPatch: rejectPatch(),
    });
    if (isResponse(result)) return result;
    return NextResponse.json({ ok: true });
  });
}
