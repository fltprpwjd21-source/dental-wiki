import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { checkFileAccess } from "@/lib/file-access";
import { isUuid } from "@/lib/uuid";

// Design §4.1·Plan FR-05: 파일을 휴지통으로 이동한다 (즉시 삭제하지 않음).
export async function POST(
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

    const { data, error } = await supabase.rpc("trash_file", {
      p_file_id: id,
      p_employee_id: session.employeeId,
    });

    if (error) {
      if (error.message?.includes("FILE_NOT_FOUND")) {
        return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
      }
      if (error.message?.includes("ALREADY_TRASHED")) {
        return NextResponse.json({ error: "이미 휴지통에 있는 파일입니다." }, { status: 400 });
      }
      return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
    }
    if (!data?.[0]) {
      return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ file: data[0] });
  });
}
