import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { buildStoragePath, createUploadUrl } from "@/lib/file-storage";
import { isAllowedExtension, isOversized, FILE_MAX_SIZE_MB } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";
import { canAddUpdate, type Task, type TaskAssignee } from "@/lib/tasks";

// 업무지시 첨부 — 1단계: 브라우저가 스토리지에 직접 올릴 서명 URL 을 발급한다.
// 보관함 첨부(app/api/notes/attachments/upload-url)와 같은 2단계 방식이다.
//
// 지시문 첨부는 지시를 만든 뒤에 올린다 — 첨부는 task_id 아래에 놓이는데 지시를
// 만들기 전에는 그 id 가 없기 때문이다. 화면은 「지시하기」를 누르면 지시를 먼저
// 만들고, 돌아온 id 로 첨부를 올린다.
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    const body = await request.json().catch(() => null);
    const taskId = body?.taskId;
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const sizeBytes = Number.isFinite(body?.sizeBytes) ? Number(body.sizeBytes) : null;

    if (!isUuid(taskId) || !fileName || sizeBytes === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (!isAllowedExtension(fileName)) {
      return NextResponse.json(
        { error: "사진(png·jpg·gif·webp)과 PDF·PPTX만 올릴 수 있습니다." },
        { status: 422 },
      );
    }
    // 브라우저가 신고한 크기라 제한의 근거가 못 된다 — 큰 파일을 올리기 전에 미리
    // 알려주려는 편의 검사일 뿐이고, 실제 강제는 버킷의 file_size_limit 과
    // 확정 단계에서 스토리지가 알려준 실제 크기가 한다 (LESSONS §9-3).
    if (isOversized(sizeBytes)) {
      return NextResponse.json(
        { error: `파일 용량이 너무 큽니다. (최대 ${FILE_MAX_SIZE_MB}MB)` },
        { status: 422 },
      );
    }

    const supabase = getServerSupabaseClient();
    const [taskResult, assigneeResult] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).is("deleted_at", null).maybeSingle(),
      supabase.from("task_assignees").select("*").eq("task_id", taskId),
    ]);

    const task = taskResult.data as Task | null;
    if (!task) {
      return NextResponse.json({ error: "업무지시를 찾을 수 없습니다." }, { status: 404 });
    }
    // 첨부를 붙일 수 있는 사람은 진행 기록을 쓸 수 있는 사람과 같다.
    if (!canAddUpdate(task, (assigneeResult.data ?? []) as TaskAssignee[], session.employeeId)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const attachmentId = randomUUID();
    const storagePath = buildStoragePath(taskId, attachmentId);

    try {
      const { signedUrl, token } = await createUploadUrl(storagePath);
      return NextResponse.json({ attachmentId, storagePath, uploadUrl: signedUrl, token });
    } catch {
      return NextResponse.json({ error: "업로드 URL 발급에 실패했습니다." }, { status: 500 });
    }
  });
}
