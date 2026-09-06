import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getKnowledgeMap } from "@/lib/knowledge-map";
import KnowledgeMapExplorer from "@/components/KnowledgeMapExplorer";

// 지식 지도 화면.
//
// 접근 범위 (2026-09-07 변경)
//   처음에는 /settings/map 에 두고 관리자만 볼 수 있게 했다. 설정 탭이 관리자
//   전용이라 그 아래 있으면 자동으로 그렇게 된다.
//   그런데 지도는 "내가 찾는 내용이 어느 문서 근처에 있나"를 보는 물건이라
//   전 스탭에게 쓸모가 있다. 그래서 설정 밖으로 꺼내 로그인한 사람이면 누구나
//   들어올 수 있게 했다. PRD 6장의 "조작·분석은 관리자 전용" 조항도 함께 고쳤다.
//
//   여기서 보여주는 것은 문서 제목·분류·연결 세기뿐이고, 문서 자체는 원래
//   전 스탭이 읽고 고칠 수 있다(PRD 6장 비범위: 역할별 권한 세분화 없음).
//   그래서 권한을 여는 것이 새로 드러내는 정보는 없다.
export default async function KnowledgeMapPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const map = await getKnowledgeMap();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-8">
      <div>
        <Link href="/" className="text-xs text-gray-500 underline hover:text-brand">
          ← 홈
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
