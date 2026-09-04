import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { checkFileAccess } from "@/lib/file-access";
import { isUuid } from "@/lib/uuid";

// Design §4.1·Plan FR-05: 휴지통(30일 이내)에서 파일을 복구한다.
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

    const { data, error } = await supabase.rpc("restore_file", {
      p_file_id: id,
      p_employee_id: session.employeeId,
    });

    if (error) {
      if (error.message?.includes("FILE_NOT_FOUND")) {
        return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
      }
      if (error.message?.includes("NOT_TRASHED")) {
        return NextResponse.json({ error: "휴지통에 있는 파일이 아닙니다." }, { status: 400 });
      }
      return NextResponse.json({ error: "복구에 실패했습니다." }, { status: 500 });
    }
    if (!data?.[0]) {
      return NextResponse.json({ error: "복구에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ file: data[0] });
  });
}
