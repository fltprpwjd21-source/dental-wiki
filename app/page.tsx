import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getKnowledgeMap } from "@/lib/knowledge-map";
import QaScreen from "@/components/QaScreen";
import KnowledgeMapBanner from "@/components/KnowledgeMapBanner";

export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // 지도는 서버에서 미리 읽어 props 로 내린다 — 클라이언트에서 다시 받아오면
  // 첫 화면이 한 번 비었다가 채워진다. 조회에 실패해도 빈 지도가 와서
  // 배너만 조용히 사라지고 질문 화면은 그대로 뜬다(lib/knowledge-map.ts 참고).
  const map = await getKnowledgeMap();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
      <KnowledgeMapBanner map={map} />
      <Suspense>
        <QaScreen />
      </Suspense>
    </main>
  );
}
