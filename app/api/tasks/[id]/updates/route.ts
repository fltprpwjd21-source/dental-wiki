import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import {
  canAddUpdate,
  canSubmit,
  isValidProgress,
  progressChangeBody,
  statusAfterNote,
  submitPatch,
} from "@/lib/tasks";
import { appendUpdate, isResponse, loadTask, snapshotName } from "@/lib/tasks-actions";

// 진행 기록 등록과 완료 보고 (PLAN 8차 37번).
//
// 둘을 한 라우트에 둔다 — 화면에서는 같은 칸에 쓰고 어느 버튼을 누르느냐만 다르다.
// 나누면 본문·진행률·첨부를 다루는 코드가 그대로 두 벌이 된다.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withSession(async (session) => {
    const { id } = await params;
    const loaded = await loadTask(id);
    if (isResponse(loaded)) return loaded;
    const { task, assignees } = loaded;

    const payload = await request.json().catch(() => null);
    const submit = payload?.submit === true;
    const body = typeof payload?.body === "string" ? payload.body.trim() : "";
    const rawProgress = payload?.progress;
    const wantsProgress = rawProgress !== undefined && rawProgress !== null;

    if (submit) {
      if (!canSubmit(task, assignees, session.employeeId)) {
        return NextResponse.json({ error: "완료 보고를 할 수 없습니다." }, { status: 403 });
      }
    } else if (!canAddUpdate(task, assignees, session.employeeId)) {
      return NextResponse.json({ error: "기록을 남길 수 없습니다." }, { status: 403 });
    }

    if (wantsProgress && !isValidProgress(rawProgress)) {
      return NextResponse.json({ error: "진행률은 20% 단위로만 정할 수 있습니다." }, { status: 400 });
    }
    // 진행률은 장기 업무에만 있다. 단기 업무에 값이 오면 화면과 DB 가 어긋난 것이므로 막는다.
    if (wantsProgress && !task.is_longterm) {
      return NextResponse.json({ error: "장기 업무가 아닙니다." }, { status: 400 });
    }

    const progress = wantsProgress ? (rawProgress as number) : null;
    const progressChanged = progress !== null && progress !== task.progress;

    // 글 없이 진행률만 바꿔도 기록으로 남긴다 — 빈 본문은 DB 가 막으므로 문장을 만들어 채운다.
    const finalBody = body || (progressChanged ? progressChangeBody(task.progress, progress) : "");
    if (!finalBody) {
      return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
    }

    const authorName = await snapshotName(session.employeeId);

    const patch: Record<string, unknown> = submit
      ? { ...submitPatch(session.employeeId, new Date().toISOString()) }
      : { ...statusAfterNote(task) };
    if (progressChanged) patch.progress = progress;

    const result = await appendUpdate({
      taskId: id,
      authorId: session.employeeId,
      authorName,
      kind: submit ? "submit" : "note",
      body: finalBody,
      progress: progressChanged ? progress : null,
      taskPatch: patch,
    });
    if (isResponse(result)) return result;

    return NextResponse.json({ id: result.id }, { status: 201 });
  });
}
