import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { checkFileAccess } from "@/lib/file-access";
import { isUuid } from "@/lib/uuid";

// Design §4.1: 재업로드용 signed URL로 실제 업로드를 마친 뒤, 이 API로 버전을 올린다.
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

    const body = await request.json().catch(() => null);
    const sizeBytes = Number.isFinite(body?.sizeBytes) ? Number(body.sizeBytes) : null;
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : access.file.mime_type;

    if (sizeBytes === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("reupload_file", {
      p_file_id: id,
      p_size_bytes: sizeBytes,
      p_mime_type: mimeType,
      p_employee_id: session.employeeId,
    });

    if (error) {
      if (error.message?.includes("FILE_NOT_FOUND")) {
        return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
      }
      if (error.message?.includes("FILE_TRASHED")) {
        return NextResponse.json(
          { error: "휴지통에 있는 파일은 재업로드할 수 없습니다. 먼저 복구해주세요." },
          { status: 422 },
        );
      }
      return NextResponse.json({ error: "재업로드에 실패했습니다." }, { status: 500 });
    }
    if (!data?.[0]) {
      return NextResponse.json({ error: "재업로드에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ file: data[0] });
  });
}
