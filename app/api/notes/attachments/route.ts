import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createDownloadUrl } from "@/lib/file-storage";
import { isAllowedExtension, isAllowedMimeType, isOversized, FILE_MAX_SIZE_MB } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";

// 업로드 확정 (메타데이터 등록). noteId는 upload-url 때와 동일하게 body로 받는다.
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    const body = await request.json().catch(() => null);
    const noteId = body?.noteId;
    const attachmentId = typeof body?.attachmentId === "string" ? body.attachmentId : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
    const sizeBytes = Number.isFinite(body?.sizeBytes) ? Number(body.sizeBytes) : null;
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "application/octet-stream";

    if (!isUuid(noteId) || !isUuid(attachmentId) || !name || !storagePath || sizeBytes === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    // 업로드 URL 발급 때 이미 검사했지만, 그 뒤에 이름만 바꿔 확정 등록할 수 있으므로
    // 같은 규칙을 여기서 한 번 더 강제한다 (심층 방어).
    if (!isAllowedExtension(name) || !isAllowedMimeType(mimeType)) {
      return NextResponse.json(
        { error: "사진(png·jpg·gif·webp)과 PDF만 올릴 수 있습니다." },
        { status: 422 },
      );
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
    const { data, error } = await supabase.rpc("register_uploaded_attachment", {
      p_id: attachmentId,
      p_note_id: noteId,
      p_name: name,
      p_storage_path: storagePath,
      p_size_bytes: sizeBytes,
      p_mime_type: mimeType,
      p_employee_id: session.employeeId,
    });

    if (error || !data?.[0]) {
      return NextResponse.json({ error: "첨부파일 등록에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ node: data[0] }, { status: 201 });
  });
}
