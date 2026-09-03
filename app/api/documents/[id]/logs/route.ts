import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";

// PLAN 10번: "수정 로그 보기"를 펼쳤을 때 보여줄 이력 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getServerSupabaseClient();

  const { data: logs, error } = await supabase
    .from("document_logs")
    .select("id, action, previous_content, new_content, edited_by, edited_at")
    .eq("document_id", id)
    .order("edited_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "로그를 불러오지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ logs });
}
