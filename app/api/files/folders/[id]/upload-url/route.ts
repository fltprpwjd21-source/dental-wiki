import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { checkFolderAccess } from "@/lib/file-access";
import { buildStoragePath, createUploadUrl } from "@/lib/file-storage";
import { isForbiddenExtension, isOversized, FILE_MAX_SIZE_MB } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";

// Design §4.2: 업로드 전, 확장자·용량을 먼저 검사하고 signed URL을 발급한다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id: folderId } = await params;
    if (!isUuid(folderId)) {
      return NextResponse.json({ error: "폴더를 찾을 수 없습니다." }, { status: 404 });
    }

    const supabase = getServerSupabaseClient();
    const access = await checkFolderAccess(supabase, folderId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = await request.json().catch(() => null);
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const sizeBytes = Number.isFinite(body?.sizeBytes) ? Number(body.sizeBytes) : null;

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

    const fileId = randomUUID();
    const storagePath = buildStoragePath(folderId, fileId);

    try {
      const { signedUrl, token } = await createUploadUrl(storagePath);
      return NextResponse.json({ fileId, storagePath, uploadUrl: signedUrl, token });
    } catch {
      return NextResponse.json({ error: "업로드 URL 발급에 실패했습니다." }, { status: 500 });
    }
  });
}
