import { getServerSupabaseClient } from "@/lib/supabase/server";
import type { DocumentCategory } from "@/lib/categories";

// Design: 문서끼리의 의미 관계를 그리는 "지식 지도"의 데이터.
//
// 별도 API 라우트를 만들지 않고 서버 컴포넌트에서 직접 부른다.
//   - 메인 배너와 관리자 화면 둘 다 첫 렌더에 데이터가 이미 있어야 해서
//     (클라이언트에서 다시 받아오면 빈 화면이 한 번 깜빡인다)
//   - 새 엔드포인트를 열지 않으니 인가를 새로 설계할 일도 없다
//
// 임베딩 자체는 절대 내보내지 않는다. 브라우저로 가는 건 제목·분류와 선의 굵기뿐이다.

export type MapNode = {
  id: string;
  title: string;
  category: DocumentCategory;
  weight: number; // 조각 수 — 문서의 두께를 점 크기로 보여주는 데 쓴다
};

export type MapEdge = {
  a: string;
  b: string;
  similarity: number;
  // 지금은 임베딩으로 자동 계산한 관계뿐이다. 나중에 사람이 단 링크나
  // 폴더 담김 관계를 그릴 때 이 필드로 구분한다 (그때 API 모양을 안 바꾸려고 미리 둔다).
  kind: "semantic";
};

export type KnowledgeMap = {
  nodes: MapNode[];
  edges: MapEdge[];
};

// p_top_k: 각 문서가 남기는 "가장 가까운 이웃" 수.
// 전역 문턱값으로 자르면 문서가 늘수록 선이 제곱으로 늘어 화면이 털뭉치가 된다.
const DEFAULT_TOP_K = 6;

export async function getKnowledgeMap(topK: number = DEFAULT_TOP_K): Promise<KnowledgeMap> {
  const supabase = getServerSupabaseClient();

  const [docsResult, edgesResult, chunkResult] = await Promise.all([
    supabase.from("documents").select("id, title, category"),
    supabase.rpc("document_graph", { p_top_k: topK }),
    supabase.from("document_chunks").select("document_id"),
  ]);

  if (docsResult.error || edgesResult.error) {
    // 지도는 보조 기능이다. 여기서 예외를 던지면 메인 화면 전체가 죽으므로
    // 빈 지도를 돌려주고 화면 쪽에서 조용히 감춘다.
    return { nodes: [], edges: [] };
  }

  const chunkCount = new Map<string, number>();
  for (const row of chunkResult.data ?? []) {
    chunkCount.set(row.document_id, (chunkCount.get(row.document_id) ?? 0) + 1);
  }

  const nodes: MapNode[] = (docsResult.data ?? []).map((doc) => ({
    id: doc.id,
    title: doc.title,
    category: doc.category as DocumentCategory,
    weight: chunkCount.get(doc.id) ?? 1,
  }));

  const edges: MapEdge[] = (
    (edgesResult.data ?? []) as Array<{ a_id: string; b_id: string; similarity: number }>
  ).map((edge) => ({
    a: edge.a_id,
    b: edge.b_id,
    similarity: edge.similarity,
    kind: "semantic" as const,
  }));

  return { nodes, edges };
}
