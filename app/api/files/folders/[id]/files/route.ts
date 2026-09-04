import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { checkFolderAccess } from "@/lib/file-access";
import { createDownloadUrl } from "@/lib/file-storage";
import { isForbiddenExtension, isOversized, FILE_MAX_SIZE_MB } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";

// Design §4.1: 폴더 내 활성 파일 목록. ?q= 로 파일명 부분 일치 검색.
export async function GET(
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

    const q = request.nextUrl.searchParams.get("q")?.trim();
    let query = supabase
      .from("files")
      .select("id, folder_id, name, size_bytes, mime_type, version, uploaded_by, created_at, updated_at")
      .eq("folder_id", folderId)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (q) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "파일 목록을 불러오지 못했습니다." }, { status: 500 });
    }
    return NextResponse.json({ files: data });
  });
}

// Design §4.1·§2.2: 브라우저가 signed URL로 업로드를 마친 뒤, 이 API로 메타데이터를 확정한다.
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
    const fileId = typeof body?.fileId === "string" ? body.fileId : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
    const sizeBytes = Number.isFinite(body?.sizeBytes) ? Number(body.sizeBytes) : null;
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "application/octet-stream";

    if (!isUuid(fileId) || !name || !storagePath || sizeBytes === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    // 업로드 URL 발급 때와 마찬가지로 서버에서 다시 한번 검증한다(방어적 이중 검사).
    if (isForbiddenExtension(name)) {
      return NextResponse.json({ error: "업로드할 수 없는 파일 형식입니다." }, { status: 422 });
    }
    if (isOversized(sizeBytes)) {
      return NextResponse.json(
        { error: `파일 용량이 너무 큽니다. (최대 ${FILE_MAX_SIZE_MB}MB)` },
        { status: 422 },
      );
    }

    // 실제로 Storage에 업로드가 됐는지 확인한다 (DB 메타데이터만 있고 실물이
    // 없는 상태를 방지 — 클라이언트가 업로드를 건너뛰고 확정만 호출하는 경우 등).
    try {
      await createDownloadUrl(storagePath);
    } catch {
      return NextResponse.json({ error: "업로드가 확인되지 않았습니다." }, { status: 422 });
    }

    const { data, error } = await supabase.rpc("register_uploaded_file", {
      p_file_id: fileId,
      p_folder_id: folderId,
      p_name: name,
      p_storage_path: storagePath,
      p_size_bytes: sizeBytes,
      p_mime_type: mimeType,
      p_employee_id: session.employeeId,
    });

    if (error || !data?.[0]) {
      return NextResponse.json({ error: "파일 등록에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ file: data[0] }, { status: 201 });
  });
}
