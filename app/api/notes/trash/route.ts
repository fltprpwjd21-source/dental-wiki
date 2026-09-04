import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { TRASH_RETENTION_DAYS } from "@/lib/file-rules";

export async function GET() {
  return withSession(async () => {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("nodes")
      .select("id, parent_id, type, name, size_bytes, created_by, trashed_at")
      .eq("status", "trashed")
      .order("trashed_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "휴지통 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    const nodes = (data ?? []).map((row) => {
      const trashedAt = new Date(row.trashed_at as string);
      const purgeAt = new Date(trashedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      return { ...row, purgeAt: purgeAt.toISOString() };
    });

    return NextResponse.json({ nodes });
  });
}
