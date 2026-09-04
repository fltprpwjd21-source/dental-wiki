import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { checkFileAccess } from "@/lib/file-access";
import { createDownloadUrl } from "@/lib/file-storage";
import { isUuid } from "@/lib/uuid";

export async function GET(
  _request: Request,
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
    // 휴지통에 있는 파일은 다운로드할 수 없다 (Design §4.2).
    if (access.file.status !== "active") {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }

    try {
      const downloadUrl = await createDownloadUrl(access.file.storage_path);
      return NextResponse.json({ downloadUrl, fileName: access.file.name, expiresIn: 60 });
    } catch {
      return NextResponse.json({ error: "다운로드 URL 발급에 실패했습니다." }, { status: 500 });
    }
  });
}
