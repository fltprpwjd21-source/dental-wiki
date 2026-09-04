import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

// PLAN 10번: "수정 로그 보기"를 펼쳤을 때 보여줄 이력 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async () => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }

    const supabase = getServerSupabaseClient();

    const { data: logs, error } = await supabase
      .from("document_logs")
      .select("id, action, previous_title, previous_content, new_title, new_content, edited_by, edited_at")
      .eq("document_id", id)
      .order("edited_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "로그를 불러오지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({ logs });
  });
}
