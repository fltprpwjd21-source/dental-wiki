import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { buildStoragePath, getStorageObjectInfo } from "@/lib/file-storage";
import { isAllowedExtension, isAllowedMimeType, isOversized, FILE_MAX_SIZE_MB } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";

// 업로드 확정 (메타데이터 등록).
//
// 요청 본문에서 받는 것은 noteId·attachmentId·name 세 개뿐이다.
//
// 예전에는 storagePath·sizeBytes·mimeType 도 함께 받아 그대로 검사하고 저장했다.
// 그 값을 보내는 쪽이 곧 제한을 피하려는 쪽이라, 콘솔에서 sizeBytes: 1 을 보내면
// 50MB 제한이 그냥 통과했다 — '두 번 검사'했지만 두 번 다 같은 거짓말을 검사한
// 셈이었다 (LESSONS §9-3). 이제 셋 다 서버가 직접 구한다.
//   - storagePath : upload-url 이 쓴 것과 같은 규칙(noteId/attachmentId)으로 다시 만든다.
//                   덕분에 다른 노트에 올린 파일을 남의 노트 밑으로 붙일 수도 없다
//                   — 경로가 달라져 오브젝트를 못 찾고 422 로 떨어진다.
//   - sizeBytes   : 스토리지에 실제로 올라간 오브젝트에서 읽는다.
//   - mimeType    : 같은 오브젝트에 기록된 값을 읽는다.
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    const body = await request.json().catch(() => null);
    const noteId = body?.noteId;
    const attachmentId = typeof body?.attachmentId === "string" ? body.attachmentId : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!isUuid(noteId) || !isUuid(attachmentId) || !name) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    // 확장자는 화면에 보이는 이름(name)의 일부라 사용자가 정하는 값이 맞다.
    // 다만 업로드 URL 발급 때와 다른 이름으로 확정 등록할 수 있으므로 여기서 다시 막는다.
    if (!isAllowedExtension(name)) {
      return NextResponse.json(
        { error: "사진(png·jpg·gif·webp)과 PDF만 올릴 수 있습니다." },
        { status: 422 },
      );
    }

    const storagePath = buildStoragePath(noteId, attachmentId);

    // 오브젝트 조회는 "업로드가 실제로 끝났는지" 확인하는 역할도 겸한다.
    const info = await getStorageObjectInfo(storagePath);
    if (!info) {
      return NextResponse.json({ error: "업로드가 확인되지 않았습니다." }, { status: 422 });
    }

    // 아래 두 검사는 이제 스토리지가 알려준 실제 값을 본다.
    // (용량은 버킷의 file_size_limit 이 물리적으로도 막지만, 한도를 한 곳에서만
    //  강제하면 그 한 곳이 어긋났을 때 조용히 뚫리므로 여기서도 함께 확인한다)
    if (isOversized(info.sizeBytes)) {
      return NextResponse.json(
        { error: `파일 용량이 너무 큽니다. (최대 ${FILE_MAX_SIZE_MB}MB)` },
        { status: 422 },
      );
    }
    if (!isAllowedMimeType(info.mimeType)) {
      return NextResponse.json(
        { error: "사진(png·jpg·gif·webp)과 PDF만 올릴 수 있습니다." },
        { status: 422 },
      );
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.rpc("register_uploaded_attachment", {
      p_id: attachmentId,
      p_note_id: noteId,
      p_name: name,
      p_storage_path: storagePath,
      p_size_bytes: info.sizeBytes,
      p_mime_type: info.mimeType,
      p_employee_id: session.employeeId,
    });

    if (error || !data?.[0]) {
      return NextResponse.json({ error: "첨부파일 등록에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ node: data[0] }, { status: 201 });
  });
}
