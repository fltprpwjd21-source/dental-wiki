import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { buildStoragePath, deleteStorageObject, getStorageObjectInfo } from "@/lib/file-storage";
import { isAllowedMimeType, isOversized, FILE_MAX_SIZE_MB } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";
import { canAddUpdate, type Task, type TaskAssignee } from "@/lib/tasks";

// 업무지시 첨부 — 2단계: 스토리지에 올라간 파일을 확정해 표에 등록한다.
//
// 크기·형식을 요청 본문에서 받지 않는다. 그 값을 만들어 보내는 쪽이 곧 제한을 피하려는
// 쪽이라, 서버가 스스로 알아낼 수 있는 값은 스토리지에서 직접 읽는다 (LESSONS §9-3).
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    const body = await request.json().catch(() => null);
    const taskId = body?.taskId;
    const attachmentId = body?.attachmentId;
    const updateId = body?.updateId ?? null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!isUuid(taskId) || !isUuid(attachmentId) || !name) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (updateId !== null && !isUuid(updateId)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
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
    if (!canAddUpdate(task, (assigneeResult.data ?? []) as TaskAssignee[], session.employeeId)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const storagePath = buildStoragePath(taskId, attachmentId);
    const info = await getStorageObjectInfo(storagePath);

    // 크기를 못 읽으면 올라가지 않은 것으로 본다. 모르는 채로 통과시키면 용량·형식
    // 제한이 다시 무의미해진다 (fail-closed).
    if (!info) {
      return NextResponse.json({ error: "업로드된 파일을 찾을 수 없습니다." }, { status: 422 });
    }

    // 실제 크기·형식이 규칙을 벗어나면 등록하지 않고 올라간 실물도 지운다 —
    // 그냥 두면 아무도 못 보는 파일이 스토리지에만 쌓인다.
    if (isOversized(info.sizeBytes) || !isAllowedMimeType(info.mimeType)) {
      await deleteStorageObject(storagePath).catch(() => {});
      return NextResponse.json(
        { error: `올릴 수 없는 파일입니다. (최대 ${FILE_MAX_SIZE_MB}MB, 사진·PDF·PPTX)` },
        { status: 422 },
      );
    }

    const { error } = await supabase.from("task_attachments").insert({
      id: attachmentId,
      task_id: taskId,
      update_id: updateId,
      name,
      size_bytes: info.sizeBytes,
      mime_type: info.mimeType,
      storage_path: storagePath,
      uploaded_by: session.employeeId,
    });

    if (error) {
      await deleteStorageObject(storagePath).catch(() => {});
      console.error("[tasks] 첨부 등록 실패", error);
      return NextResponse.json({ error: "첨부 등록에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ id: attachmentId }, { status: 201 });
  });
}
