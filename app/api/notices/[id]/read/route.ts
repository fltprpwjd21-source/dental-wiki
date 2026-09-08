import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

// 「읽음 확인」을 직접 눌렀을 때. needs_ack 를 켠 공지에만 화면에 버튼이 뜬다.
//
// 여는 것만으로 생기는 줄(read_at)과 다르다 — 여기서는 acked_at 을 채운다.
// 예전에는 ignoreDuplicates 로 넣기만 해서, 이미 열어본 사람이 버튼을 눌러도
// 아무 일도 일어나지 않았다 (새로고침하면 버튼이 그대로 살아 있었다).
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
    const { error } = await supabase
      .from("notice_reads")
      .upsert(
        { notice_id: id, employee_id: session.employeeId, acked_at: new Date().toISOString() },
        { onConflict: "notice_id,employee_id" },
      );

    if (error) {
      console.error("[notices] 읽음 확인 실패", error);
      return NextResponse.json({ error: "확인 처리에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  });
}
