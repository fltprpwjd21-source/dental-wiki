import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { checkFileAccess } from "@/lib/file-access";
import { createUploadUrl } from "@/lib/file-storage";
import { isForbiddenExtension, isOversized, FILE_MAX_SIZE_MB } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";

// Design §2.2: 재업로드는 같은 storage_path를 upsert로 덮어쓴다 (새 파일이 아니다).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }

    const supabase = getServerSupabaseClient();
    const access = await checkFileAccess(supabase, id, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (access.file.status !== "active") {
      return NextResponse.json(
        { error: "휴지통에 있는 파일은 재업로드할 수 없습니다. 먼저 복구해주세요." },
        { status: 422 },
      );
    }

    const body = await request.json().catch(() => null);
    const sizeBytes = Number.isFinite(body?.sizeBytes) ? Number(body.sizeBytes) : null;

    if (sizeBytes === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    // 재업로드는 기존 파일명을 그대로 유지하므로, 그 파일명 기준으로 확장자를 검사한다.
    if (isForbiddenExtension(access.file.name)) {
      return NextResponse.json({ error: "업로드할 수 없는 파일 형식입니다." }, { status: 422 });
    }
    if (isOversized(sizeBytes)) {
      return NextResponse.json(
        { error: `파일 용량이 너무 큽니다. (최대 ${FILE_MAX_SIZE_MB}MB)` },
        { status: 422 },
      );
    }

    try {
      const { signedUrl, token } = await createUploadUrl(access.file.storage_path, {
        upsert: true,
      });
      return NextResponse.json({ storagePath: access.file.storage_path, uploadUrl: signedUrl, token });
    } catch {
      return NextResponse.json({ error: "업로드 URL 발급에 실패했습니다." }, { status: 500 });
    }
  });
}
