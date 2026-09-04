import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { buildStoragePath, createUploadUrl } from "@/lib/file-storage";
import { isForbiddenExtension, isOversized, FILE_MAX_SIZE_MB } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";

// 사진·PDF는 노트에 속한 첨부파일이다 — noteId는 반드시 type='note'인 노드여야 한다
// (2026-09-04: 폴더에 직접 붙는 독립 이미지 노드 방식에서 변경).
export async function POST(request: NextRequest) {
  return withSession(async () => {
    const body = await request.json().catch(() => null);
    const noteId = body?.noteId;
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const sizeBytes = Number.isFinite(body?.sizeBytes) ? Number(body.sizeBytes) : null;

    if (!isUuid(noteId)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (!fileName || sizeBytes === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (isForbiddenExtension(fileName)) {
      return NextResponse.json({ error: "업로드할 수 없는 파일 형식입니다." }, { status: 422 });
    }
    if (isOversized(sizeBytes)) {
      return NextResponse.json(
        { error: `파일 용량이 너무 큽니다. (최대 ${FILE_MAX_SIZE_MB}MB)` },
        { status: 422 },
      );
    }

    const supabase = getServerSupabaseClient();
    const { data: note } = await supabase
      .from("nodes")
      .select("id, type, status")
      .eq("id", noteId)
      .maybeSingle();
    if (!note || note.type !== "note" || note.status !== "active") {
      return NextResponse.json({ error: "노트를 찾을 수 없습니다." }, { status: 404 });
    }

    const attachmentId = randomUUID();
    const storagePath = buildStoragePath(noteId, attachmentId);

    try {
      const { signedUrl, token } = await createUploadUrl(storagePath);
      return NextResponse.json({ attachmentId, storagePath, uploadUrl: signedUrl, token });
    } catch {
      return NextResponse.json({ error: "업로드 URL 발급에 실패했습니다." }, { status: 500 });
    }
  });
}
