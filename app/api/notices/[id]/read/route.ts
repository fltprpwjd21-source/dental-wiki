import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

// 읽음 확인. needs_ack 를 켠 공지에만 화면에 버튼이 뜬다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "없는 공지입니다." }, { status: 404 });
    }

    const supabase = getServerSupabaseClient();
    // 이미 눌렀던 사람이 다시 눌러도 오류가 나면 안 된다 (기본키 중복).
    const { error } = await supabase
      .from("notice_reads")
      .upsert({ notice_id: id, employee_id: session.employeeId }, { ignoreDuplicates: true });

    if (error) {
      return NextResponse.json({ error: "확인 처리에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  });
}
