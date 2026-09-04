import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createDownloadUrl } from "@/lib/file-storage";
import { isForbiddenExtension, isOversized, FILE_MAX_SIZE_MB } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";

// 업로드 확정 (메타데이터 등록). parentId는 upload-url 때와 동일하게 body로 받는다.
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    const body = await request.json().catch(() => null);
    const parentId = body?.parentId;
    const imageId = typeof body?.imageId === "string" ? body.imageId : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
    const sizeBytes = Number.isFinite(body?.sizeBytes) ? Number(body.sizeBytes) : null;
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "application/octet-stream";

    if (parentId !== null && parentId !== undefined && !isUuid(parentId)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (!isUuid(imageId) || !name || !storagePath || sizeBytes === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (isForbiddenExtension(name)) {
      return NextResponse.json({ error: "업로드할 수 없는 파일 형식입니다." }, { status: 422 });
    }
    if (isOversized(sizeBytes)) {
      return NextResponse.json(
        { error: `파일 용량이 너무 큽니다. (최대 ${FILE_MAX_SIZE_MB}MB)` },
        { status: 422 },
      );
    }

    try {
      await createDownloadUrl(storagePath);
    } catch {
      return NextResponse.json({ error: "업로드가 확인되지 않았습니다." }, { status: 422 });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.rpc("register_uploaded_image", {
      p_id: imageId,
      p_parent_id: parentId ?? null,
      p_name: name,
      p_storage_path: storagePath,
      p_size_bytes: sizeBytes,
      p_mime_type: mimeType,
      p_employee_id: session.employeeId,
    });

    if (error || !data?.[0]) {
      return NextResponse.json({ error: "이미지 등록에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ node: data[0] }, { status: 201 });
  });
}
