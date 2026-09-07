import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { TRASH_RETENTION_DAYS } from "@/lib/file-rules";

// 노트 화면의 "최근 삭제된 항목"은 **본인이 버린 것만** 보여준다 (2026-09-07).
//
// 전에는 전 스탭이 버린 것이 모두 한 목록에 섞여 나왔다. 노트는 공유 공간이라
// 그래도 되긴 하지만, 실제로 여기서 하는 일은 "방금 내가 잘못 지운 걸 되돌리기"다.
// 남이 버린 것까지 섞이면 정작 내가 찾는 항목이 밀려 안 보이고, 남이 정리한 것을
// 무심코 되살릴 수도 있다.
//
// 전체를 봐야 하는 관리는 /settings/trash 에서 한다.
export async function GET() {
  return withSession(async (session) => {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("nodes")
      .select("id, parent_id, type, name, size_bytes, created_by, trashed_at")
      .eq("status", "trashed")
      .eq("trashed_by", session.employeeId)
      .order("trashed_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "휴지통 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    const nodes = (data ?? []).map((row) => {
      const trashedAt = new Date(row.trashed_at as string);
      const purgeAt = new Date(trashedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      return { ...row, purgeAt: purgeAt.toISOString() };
    });

    return NextResponse.json({ nodes, retentionDays: TRASH_RETENTION_DAYS });
  });
}
