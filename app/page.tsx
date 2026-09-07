import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getHomeData } from "@/lib/notices-server";
import NoticeCards from "@/components/notices/NoticeCards";
import HomeCalendar from "@/components/home/HomeCalendar";
import RecentDocuments from "@/components/home/RecentDocuments";
import QaScreen from "@/components/QaScreen";

// 홈은 세 덩어리다 — 공지 카드(흰 창) · 캘린더(옅은 창) · 최근 바뀐 문서(진한 종이).
//
// 질문 칸은 없다. 헤더 검색창이 받아서 ?q= 로 넘어오고, 그때만 답이 이 위에 붙는다.
// 지식 지도 배너도 내렸다 — 문서를 올려야 바뀌고, 봐도 오늘 할 일이 달라지지 않았다.
export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { cards, events, unreadIds, documents } = await getHomeData(session.employeeId);

  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <QaScreen />
      </Suspense>
      <NoticeCards notices={cards} unreadIds={unreadIds} />
      <HomeCalendar events={events} />
      <RecentDocuments documents={documents} />
    </main>
  );
}
