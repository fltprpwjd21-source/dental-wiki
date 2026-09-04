import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";

// Design §4.1: 활성 노드 전체를 평면 배열로 돌려주고, 화면에서 트리로 조립한다.
export async function GET() {
  return withSession(async () => {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("nodes")
      .select("id, parent_id, type, name, version, created_by, created_at, updated_at")
      .eq("status", "active");

    if (error) {
      return NextResponse.json({ error: "노트 목록을 불러오지 못했습니다." }, { status: 500 });
    }
    return NextResponse.json({ nodes: data });
  });
}
