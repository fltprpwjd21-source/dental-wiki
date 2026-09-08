import { getServerSupabaseClient } from "@/lib/supabase/server";
import { HOME_NOTICE_LIMIT, isoDate, todayIso, type Notice } from "@/lib/notices";
import type { DocumentCategory } from "@/lib/categories";

// 홈 한 화면에 필요한 것들을 한 번에 읽는다.
//
// 조회에 실패해도 화면 전체가 죽지 않게 빈 값을 돌려준다 — 공지가 안 보이는 것보다
// 홈이 통째로 500 이 되는 게 훨씬 나쁘다 (지식 지도 때 쓰던 방식과 같다).
export type HomeData = {
  cards: Notice[];
  events: Notice[];
  /** 한 번도 열어보지 않은 공지 — 카드의 주황 점 */
  unreadIds: Set<string>;
  documents: { id: string; title: string; category: DocumentCategory; updated_at: string }[];
};

export async function getHomeData(employeeId: string): Promise<HomeData> {
  const empty: HomeData = {
    cards: [], events: [], unreadIds: new Set(), documents: [],
  };

  try {
    const supabase = getServerSupabaseClient();
    const today = todayIso();

    // 이번 달 캘린더에 찍을 범위.
    //   "01"~"31" 로 만들면 9월·4월 같은 30일 달에서 2026-09-31 이라는 없는 날짜가 되고,
    //   Postgres 가 date 로 못 바꿔 조회 전체가 실패한다 — 그러면 점이 하나도 안 찍힌다.
    //   달의 마지막 날을 실제로 계산해서 넘긴다.
    const now = new Date();
    const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const [live, events, reads, documents] = await Promise.all([
      supabase
        .from("notices")
        .select("*")
        .is("deleted_at", null)
        .lte("starts_on", today)
        .gte("ends_on", today)
        .order("created_at", { ascending: false })
        .limit(HOME_NOTICE_LIMIT),
      supabase
        .from("notices")
        .select("*")
        .is("deleted_at", null)
        .not("event_on", "is", null)
        .gte("event_on", monthStart)
        .lte("event_on", monthEnd),
      supabase.from("notice_reads").select("notice_id").eq("employee_id", employeeId),
      supabase
        .from("documents")
        .select("id, title, category, updated_at")
        .order("updated_at", { ascending: false })
        .limit(3),
    ]);

    for (const [name, result] of [["공지", live], ["일정", events], ["읽음", reads], ["문서", documents]] as const) {
      if (result.error) console.error(`[home] ${name} 조회 실패`, result.error);
    }

    // 공지를 한 번이라도 연 사람은 읽은 것으로 친다.
    const openedSet = new Set((reads.data ?? []).map((r) => r.notice_id as string));
    const cards = (live.data ?? []) as Notice[];

    return {
      cards,
      events: (events.data ?? []) as Notice[],
      unreadIds: new Set(cards.filter((n) => !openedSet.has(n.id)).map((n) => n.id)),
      documents: (documents.data ?? []) as HomeData["documents"],
    };
  } catch (error) {
    console.error("[home] 데이터 조회 실패", error);
    return empty;
  }
}

// 공지를 열어본 것만으로 "읽음"으로 친다 (카드의 주황 점이 사라진다).
// 「읽음 확인」을 눌렀는지(acked_at)는 건드리지 않는다 — ignoreDuplicates 라
// 이미 있는 줄은 그대로 둔다.
//
// 실패해도 화면을 막지 않는다 — 읽음 기록이 안 남는 것보다 공지가 안 열리는 게 나쁘다.
export async function markNoticeRead(noticeId: string, employeeId: string): Promise<void> {
  try {
    const supabase = getServerSupabaseClient();
    await supabase
      .from("notice_reads")
      .upsert({ notice_id: noticeId, employee_id: employeeId }, { ignoreDuplicates: true });
  } catch (error) {
    console.error("[notices] 읽음 기록 실패", error);
  }
}
