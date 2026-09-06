"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import KnowledgeMapCanvas from "@/components/KnowledgeMapCanvas";
import { CATEGORY_LABELS } from "@/lib/categories";
import type { KnowledgeMap, MapNode } from "@/lib/knowledge-map";

// 관리자 전용 지도 화면. 배너와 달리 여기서는 실제로 들여다보고 조작한다.
//
// 캔버스만 두면 키보드·스크린리더로는 아무것도 알 수 없으므로, 같은 내용을
// 아래 표로도 내려둔다 (노트 트리에서 겪은 접근성 문제를 반복하지 않으려는 것).
export default function KnowledgeMapExplorer({ map }: { map: KnowledgeMap }) {
  const [minSimilarity, setMinSimilarity] = useState(0.6);
  const [selected, setSelected] = useState<MapNode | null>(null);

  const visibleEdges = useMemo(
    () => map.edges.filter((e) => e.similarity >= minSimilarity),
    [map.edges, minSimilarity],
  );

  // 어느 선에도 걸리지 않은 문서 — 검색에서 홀로 떠 있다는 뜻이라
  // 관리자가 가장 먼저 봐야 하는 정보다.
  const isolated = useMemo(() => {
    const linked = new Set(visibleEdges.flatMap((e) => [e.a, e.b]));
    return map.nodes.filter((n) => !linked.has(n.id));
  }, [map.nodes, visibleEdges]);

  const neighborsOf = (id: string) =>
    map.edges
      .filter((e) => e.a === id || e.b === id)
      .map((e) => ({ id: e.a === id ? e.b : e.a, similarity: e.similarity }))
      .sort((x, y) => y.similarity - x.similarity);

  const titleOf = (id: string) => map.nodes.find((n) => n.id === id)?.title ?? "(삭제된 문서)";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <label htmlFor="sim" className="block text-xs text-gray-500">
            연결 문턱값 — 유사도 {minSimilarity.toFixed(2)} 이상만 표시
          </label>
          <input
            id="sim"
            type="range"
            min="0.3"
            max="0.85"
            step="0.01"
            value={minSimilarity}
            onChange={(event) => setMinSimilarity(Number(event.target.value))}
            className="mt-1 w-64 accent-brand"
          />
        </div>
        <p className="text-xs text-gray-500">
          문서 <b className="text-ink">{map.nodes.length}</b>건 · 연결선{" "}
          <b className="text-ink">{visibleEdges.length}</b>개
          {isolated.length > 0 && (
            <>
              {" "}
              · 고립 <b className="text-red-600">{isolated.length}</b>건
            </>
          )}
        </p>
      </div>

      <div className="h-[440px] rounded-lg border border-gray-200 bg-white">
        <KnowledgeMapCanvas
          map={map}
          mode="explorer"
          minSimilarity={minSimilarity}
          onSelect={setSelected}
          selectedId={selected?.id ?? null}
          className="h-full w-full"
        />
      </div>

      {selected ? (
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{CATEGORY_LABELS[selected.category]}</p>
              <h3 className="mt-0.5 truncate text-sm font-semibold text-ink">{selected.title}</h3>
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
              <Link
                href={`/documents/${selected.id}`}
                className="rounded border border-brand px-2.5 py-1 text-brand hover:bg-surface"
              >
                문서 열기
              </Link>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded border border-gray-300 px-2.5 py-1 hover:bg-surface"
              >
                닫기
              </button>
            </div>
          </div>
          <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
            {neighborsOf(selected.id)
              .slice(0, 5)
              .map((n) => (
                <li key={n.id} className="flex gap-3">
                  <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-accent">
                    {n.similarity.toFixed(3)}
                  </span>
                  <span className="truncate text-gray-600">{titleOf(n.id)}</span>
                </li>
              ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-gray-400">
          점을 클릭하면 그 문서와 가장 가까운 문서들을 볼 수 있습니다.
        </p>
      )}

      {isolated.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-700">
            이 문턱값에서 아무 문서와도 이어지지 않은 문서 {isolated.length}건
          </h3>
          <p className="mt-1 text-xs text-red-600">
            내용이 다른 문서와 동떨어져 있다는 뜻입니다. 질문이 이 문서로 잘 도달하지 못할 수
            있으니, 용어를 다른 문서와 맞추거나 내용을 보강할지 검토해보세요.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {isolated.map((n) => (
              <li key={n.id}>
                <Link href={`/documents/${n.id}`} className="underline underline-offset-2">
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 캔버스를 못 보는 경우(키보드·스크린리더)에도 같은 정보를 얻을 수 있게 표로 제공 */}
      <details className="rounded-lg border border-gray-200 p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          연결 목록으로 보기 ({visibleEdges.length}개)
        </summary>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="py-1.5 pr-3 font-medium">유사도</th>
              <th className="py-1.5 pr-3 font-medium">문서</th>
              <th className="py-1.5 font-medium">문서</th>
            </tr>
          </thead>
          <tbody>
            {visibleEdges.map((e) => (
              <tr key={`${e.a}-${e.b}`} className="border-b border-gray-50">
                <td className="py-1.5 pr-3 font-mono text-xs tabular-nums text-accent">
                  {e.similarity.toFixed(3)}
                </td>
                <td className="py-1.5 pr-3 text-gray-600">{titleOf(e.a)}</td>
                <td className="py-1.5 text-gray-600">{titleOf(e.b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
