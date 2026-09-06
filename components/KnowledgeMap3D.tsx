"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Object3D } from "three";
import SpriteText from "three-spritetext";
import type ForceGraph3DComponent from "react-force-graph-3d";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-3d";
import { CATEGORY_LABELS } from "@/lib/categories";
import type { DocumentCategory } from "@/lib/categories";
import type { KnowledgeMap, MapNode } from "@/lib/knowledge-map";

// 3차원 지식 지도.
//
// 왜 3D 인가
//   2D 캔버스에서는 문서 11건에 선 44개가 한 상자에 들어가 겹쳐 읽기 어려웠다.
//   차원이 하나 늘면 점이 퍼질 자리가 생기고, 무엇보다 이름표를 상시로 그리지 않아도 된다.
//   (2D 에서는 라벨을 상위 3개로 제한해야 겨우 읽혔다)
//
// 왜 여기만 3D 이고 메인 배너는 2D 인가
//   Three.js(WebGL)는 클라이언트 번들에 1.4MB 청크를 더한다. 배너는 보기 전용이고
//   회전할 일도 없어서 전 스탭이 그 비용을 낼 이유가 없다. 이 화면만 3D 로 둔다.
//
// 왜 next/dynamic 이 아니라 직접 import 하는가
//   간격을 벌리려면 charge·link distance 를 만져야 하는데, 이 둘은 프롭이 없고
//   인스턴스 메서드(d3Force)로만 접근된다. 즉 ref 가 반드시 살아 있어야 한다.
//   next/dynamic 이 만든 래퍼를 거치면 ref 가 전달되지 않을 수 있고, 그러면 힘 조절이
//   **조용히 무시되어** 간격이 그대로인 채 아무 오류도 안 난다.
//   useEffect 안에서 직접 import 하면 라이브러리 컴포넌트를 그대로 렌더하므로 ref 가
//   확실히 닿고, 코드 분리(별도 청크)와 서버 렌더 회피는 그대로 얻는다.
type ForceGraph3DType = typeof ForceGraph3DComponent;

// 2D 배너와 같은 색을 쓴다 — 같은 데이터를 두 화면에서 다른 색으로 보여주지 않는다.
const CATEGORY_COLOR: Record<DocumentCategory, string> = {
  handover: "#c2701c",
  insurance: "#0f9b7a",
  policy: "#6d55d0",
};

// 배치 상수. "점 크기에 비해 간격이 너무 가깝다"는 지적을 받아 조정한 값들이다.
//   - 서로 밀어내는 힘을 키워(CHARGE) 사이를 벌린다.
//   - 선의 자연 길이도 늘리되, 가까운 문서일수록 짧게 유지해 "유사도 = 거리"는 지킨다.
//
// NODE_REL_SIZE 는 5 → 2.6 까지 줄였다가 4.2 로 되돌렸다. 2.6 에서는 구체가 너무 작아
// 마우스를 올려도 레이캐스트에 걸리지 않아 이름표가 안 떴다 — 간격은 힘으로 벌리고
// 점 크기는 "짚을 수 있는" 크기를 지키는 쪽이 맞다.
const NODE_REL_SIZE = 4.2;
const CHARGE_STRENGTH = -320;
const LINK_DISTANCE_BASE = 60;
const LINK_DISTANCE_SPREAD = 240;

type Graph3DNode = {
  id: string;
  title: string;
  category: DocumentCategory;
  weight: number;
  val: number;
};

type Graph3DLink = {
  source: string | Graph3DNode;
  target: string | Graph3DNode;
  similarity: number;
};

// link.source 는 시뮬레이션이 시작되면 문자열 id 에서 노드 객체로 바뀐다.
// 양쪽 다 처리해야 선택 강조가 첫 프레임부터 어긋나지 않는다.
function endId(end: string | Graph3DNode): string {
  return typeof end === "string" ? end : end.id;
}

export default function KnowledgeMap3D({
  map,
  minSimilarity,
  onSelect,
  selectedId,
}: {
  map: KnowledgeMap;
  minSimilarity: number;
  onSelect: (node: MapNode | null) => void;
  selectedId: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<Graph3DNode, Graph3DLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ForceGraph3D, setForceGraph3D] = useState<ForceGraph3DType | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // 브라우저에서만 불러온다 — 이 라이브러리는 모듈을 읽는 시점에 window/WebGL 을 건드려서
  // 서버에서 평가되면 "window is not defined" 로 죽는다.
  useEffect(() => {
    let cancelled = false;
    import("react-force-graph-3d")
      .then((mod) => {
        if (!cancelled) setForceGraph3D(() => mod.default);
      })
      .catch(() => {
        // 지도를 못 그려도 아래 목록·표는 그대로 쓸 수 있어야 한다.
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 라이브러리가 width/height 를 숫자로 요구한다(부모 크기를 스스로 읽지 않는다).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const nodes: Graph3DNode[] = map.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      weight: n.weight,
      // val 은 구체의 부피에 해당한다. 조각 수를 그대로 넣으면 두꺼운 문서만 커지므로
      // 제곱근을 써서 차이를 눌러준다.
      val: Math.sqrt(n.weight),
    }));
    const links: Graph3DLink[] = map.edges
      .filter((e) => e.similarity >= minSimilarity)
      .map((e) => ({ source: e.a, target: e.b, similarity: e.similarity }));
    return { nodes, links };
  }, [map, minSimilarity]);

  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map.nodes]);

  // 선택한 문서와 "선으로 이어진" 문서들. 이 집합에만 이름표를 띄운다.
  const highlighted = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId) return set;
    set.add(selectedId);
    for (const link of graphData.links) {
      const a = endId(link.source);
      const b = endId(link.target);
      if (a === selectedId) set.add(b);
      if (b === selectedId) set.add(a);
    }
    return set;
  }, [selectedId, graphData.links]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const neighborCount = Math.max(0, highlighted.size - 1);

  // 점 크기 대비 간격을 벌린다. 기본값(charge -30, 거리 30)으로는 점들이 서로 붙어
  // 뭉쳐 보였다. graphData 가 바뀌면 라이브러리가 힘을 다시 만들므로 그때마다 다시 건다.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(CHARGE_STRENGTH);
    fg.d3Force("link")?.distance((edge: Graph3DLink) => {
      // 가까운 문서일수록 짧은 선 — 유사도가 거리로 보이게 한다.
      const closeness = Math.max(0, Math.min(1, (edge.similarity - 0.3) / 0.55));
      return LINK_DISTANCE_BASE + (1 - closeness) * LINK_DISTANCE_SPREAD;
    });
    fg.d3ReheatSimulation();
  }, [graphData, ForceGraph3D]);

  // 선택이 바뀌면 색과 이름표가 달라져야 하는데 라이브러리는 노드 객체를 캐싱한다.
  // refresh() 로 접근자를 다시 태워야 화면에 반영된다.
  useEffect(() => {
    fgRef.current?.refresh();
  }, [selectedId]);

  // 선택한 문서와 그 이웃에만 이름표를 붙인다. 나머지는 점만 보인다.
  // (상시 표시하면 2D 에서 겪은 글자 겹침이 3D 에서도 그대로 재현된다)
  const nodeThreeObject = useCallback(
    (node: NodeObject<Graph3DNode>) => {
      // nodeThreeObjectExtend 라 여기서 돌려준 것이 기본 구체에 "덧붙는다".
      // 이름표를 붙이지 않을 노드에는 빈 객체를 준다(아무것도 안 붙는 것과 같다).
      if (!node.id || !highlighted.has(String(node.id))) return new Object3D();

      const title = node.title;
      const sprite = new SpriteText(title.length > 22 ? `${title.slice(0, 21)}…` : title);
      const isSelected = String(node.id) === selectedId;
      sprite.color = isSelected ? "#0f1a26" : "#5b6b7c";
      sprite.textHeight = isSelected ? 5 : 4;
      sprite.backgroundColor = "rgba(255,255,255,0.85)";
      sprite.padding = 2;
      sprite.borderRadius = 2;
      // 점 위로 띄워 구체와 겹치지 않게 한다.
      sprite.position.set(0, NODE_REL_SIZE * Math.cbrt(node.val) + 6, 0);
      return sprite;
    },
    [highlighted, selectedId],
  );

  return (
    <div className="relative h-full w-full">
      <div ref={wrapRef} className="h-full w-full">
        {loadFailed ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">
            지도를 불러오지 못했습니다. 아래 &quot;연결 목록으로 보기&quot;에서 같은 내용을 확인하실
            수 있습니다.
          </div>
        ) : !ForceGraph3D || size.width === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            지도를 불러오는 중…
          </div>
        ) : (
          <ForceGraph3D
            ref={fgRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="#ffffff"
            showNavInfo={false}
            nodeRelSize={NODE_REL_SIZE}
            nodeOpacity={0.95}
            // 이름표는 기본 구체에 덧붙인다(구체를 대체하지 않는다).
            nodeThreeObjectExtend={true}
            nodeThreeObject={nodeThreeObject}
            // 마우스를 올리면 선택하지 않아도 무엇인지 알 수 있게 한다.
            nodeLabel={(node: NodeObject<Graph3DNode>) =>
              `<div style="background:rgba(15,26,38,.92);color:#fff;padding:6px 9px;border-radius:6px;font-size:12px;font-family:system-ui,-apple-system,sans-serif;max-width:260px">
                <div style="opacity:.7;font-size:11px">${CATEGORY_LABELS[node.category]}</div>
                <div style="margin-top:2px">${escapeHtml(node.title)}</div>
                <div style="opacity:.6;font-size:11px;margin-top:3px">조각 ${node.weight}개</div>
              </div>`
            }
            nodeColor={(node: NodeObject<Graph3DNode>) => {
              if (!selectedId) return CATEGORY_COLOR[node.category];
              // 선택했으면 그 문서와 이어진 것만 또렷하게, 나머지는 흐리게.
              return highlighted.has(String(node.id)) ? CATEGORY_COLOR[node.category] : "#d3d9e0";
            }}
            linkColor={(link: Graph3DLink) => {
              if (!selectedId) return "#143074";
              const touches = endId(link.source) === selectedId || endId(link.target) === selectedId;
              return touches ? "#143074" : "#dfe4ea";
            }}
            linkOpacity={0.4}
            linkWidth={(link: Graph3DLink) => {
              const strength = Math.max(0, Math.min(1, (link.similarity - 0.3) / 0.55));
              return 0.3 + strength * 1.5;
            }}
            enableNodeDrag={false}
            onNodeClick={(node: NodeObject<Graph3DNode>) => {
              onSelect(byId.get(String(node.id)) ?? null);
            }}
            onBackgroundClick={() => onSelect(null)}
            warmupTicks={60}
            cooldownTicks={180}
          />
        )}
      </div>

      {/* 선택한 문서를 지도 위에서 바로 열 수 있는 막대. 아래 목록까지 내려가지 않아도 된다. */}
      {selected && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
          <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full border border-gray-200 bg-white/95 py-1.5 pl-4 pr-1.5 shadow-sm backdrop-blur">
            <span className="min-w-0 truncate text-xs text-gray-600">
              <span className="text-gray-400">{CATEGORY_LABELS[selected.category]}</span>
              <span className="mx-1.5 text-gray-300">·</span>
              <span className="font-medium text-ink">{selected.title}</span>
              {neighborCount > 0 && (
                <span className="ml-1.5 text-gray-400">가까운 문서 {neighborCount}건</span>
              )}
            </span>
            <Link
              href={`/documents/${selected.id}`}
              className="shrink-0 rounded-full bg-brand px-3 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              열기
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// nodeLabel 은 HTML 문자열을 그대로 넣으므로, 문서 제목에 <, & 가 있으면 깨지거나
// 태그로 해석된다. 제목은 스탭이 자유롭게 쓰는 값이라 반드시 이스케이프한다.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
