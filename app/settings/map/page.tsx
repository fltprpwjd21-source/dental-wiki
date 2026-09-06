import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getKnowledgeMap } from "@/lib/knowledge-map";
import KnowledgeMapExplorer from "@/components/KnowledgeMapExplorer";

// PRD 6장(범위): 지도 조작·분석은 관리자 전용. 메인 배너는 전 스탭 보기 전용이다.
//
// 인가는 화면과 데이터 양쪽에서 각각 막아야 한다는 게 이 프로젝트의 규칙인데,
// 여기서는 별도 API 라우트 없이 서버 컴포넌트가 직접 조회하므로 이 redirect 하나가
// 곧 데이터 접근 관문이다 — 이 검사를 통과하지 못하면 조회 자체가 일어나지 않는다.
export default async function KnowledgeMapPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!session.isAdmin) {
    redirect("/");
  }

  const map = await getKnowledgeMap();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-8">
      <div>
        <Link href="/settings" className="text-xs text-gray-500 underline hover:text-brand">
          ← 설정
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-brand">지식 지도</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-gray-500">
          Q&amp;A 검색에 쓰는 것과 같은 의미 정보로 문서끼리의 거리를 계산했습니다. 사람이 링크를
          달지 않아도 관계가 그려지며, 문서를 고치면 다음에 열 때 자동으로 다시 계산됩니다.
        </p>
      </div>

      {map.nodes.length === 0 ? (
        <p className="text-sm text-gray-400">
          아직 지도를 그릴 문서가 없습니다. 문서를 등록하면 여기에 나타납니다.
        </p>
      ) : (
        <KnowledgeMapExplorer map={map} />
      )}
    </main>
  );
}
