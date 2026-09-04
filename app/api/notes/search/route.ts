import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  return withSession(async () => {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q) {
      return NextResponse.json({ nodes: [] });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("nodes")
      .select("id, parent_id, type, name")
      .eq("status", "active")
      .ilike("name", `%${q}%`);

    if (error) {
      return NextResponse.json({ error: "검색에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ nodes: data });
  });
}
