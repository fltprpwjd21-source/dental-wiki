"use client";

import { useEffect, useRef } from "react";
import type { KnowledgeMap, MapNode } from "@/lib/knowledge-map";
import type { DocumentCategory } from "@/lib/categories";

// 문서 간 의미 관계를 힘-기반 배치로 그린다. 두 가지 모드를 한 컴포넌트가 맡는다.
//
//   ambient  — 메인 화면 배너. 보기 전용(클릭·호버 없음)이지만 배경 장식이 아니라
//              읽으라고 놓는 것이므로 선과 점을 또렷하게 그린다. 큰 문서에는 이름도 붙인다.
//   explorer — 설정 탭 안 관리자 화면. 호버·클릭·문턱값 조절이 붙는다.
//
// 캔버스로 그리는 이유: 노드마다 DOM 을 만들면 문서가 몇백 건이 됐을 때 그대로 무너진다.
// (SVG 경로를 손으로 쓰는 대신 캔버스를 쓰라는 프로젝트 방침과도 맞다)
type Mode = "ambient" | "explorer";

// 카테고리는 서로 구분돼야 하므로 색상(hue)을 나눠 쓴다.
// 선 색은 여기 박지 않고 app/globals.css 의 --brand 를 읽어 쓴다 — 디자인 톤을
// 바꿀 때 캔버스만 따로 남아 어긋나는 일이 없게 하려는 것이다.
const CATEGORY_COLOR: Record<DocumentCategory, string> = {
  handover: "#c2701c",
  insurance: "#0f9b7a",
  policy: "#6d55d0",
};

// "#143074" → "20, 48, 116" (canvas 의 rgba() 에 넣기 위해)
function brandRgb(): string {
  const hex = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "20, 48, 116";
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

type Placed = MapNode & { x: number; y: number; vx: number; vy: number; r: number };

export default function KnowledgeMapCanvas({
  map,
  mode,
  minSimilarity = 0,
  onSelect,
  selectedId = null,
  className = "",
}: {
  map: KnowledgeMap;
  mode: Mode;
  minSimilarity?: number;
  onSelect?: (node: MapNode | null) => void;
  selectedId?: string | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{ nodes: Placed[]; w: number; h: number }>({ nodes: [], w: 0, h: 0 });

  // 강조 대상(호버·선택)은 state 가 아니라 ref 로 들고 있다.
  //
  // 전에는 hoverId 를 state 로 두고 아래 useEffect 의존성에 넣었는데, 그러면 점 위에
  // 마우스를 올릴 때마다 이펙트가 통째로 다시 돌았다. 이펙트 본문은 layout() 으로
  // 시작하므로 노드가 원형 초기 위치로 되돌아가 240스텝을 다시 밟고, 애니메이션도
  // 0프레임부터 다시 시작한다 — 즉 **호버할 때마다 지도가 제자리로 튀었다.**
  // 계산량도 만만치 않다(노드쌍 O(n²) × 330스텝을 마우스 움직임마다).
  //
  // 강조는 배치를 바꾸지 않고 "다시 그리기"만 하면 되는 일이라, 값은 ref 에 넣고
  // redrawRef 로 그리기만 다시 부른다. 그래서 지도는 자리를 지킨 채 색만 바뀐다.
  const hoverIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  const redrawRef = useRef<(() => void) | null>(null);

  // 선택은 부모가 들고 있으므로(상세 패널에서 쓴다) props 로 내려온다.
  // 바뀌면 배치는 그대로 두고 다시 그리기만 한다.
  useEffect(() => {
    selectedIdRef.current = selectedId;
    redrawRef.current?.();
  }, [selectedId]);

  // 배치 계산과 그리기는 렌더 사이클 밖에서 돈다 — 매 프레임 setState 하면
  // 리액트가 초당 60번 리렌더하게 되어 프로젝트가 이미 겪은 cascading render 문제가 된다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let raf: number | null = null;

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const nodes: Placed[] = map.nodes.map((node, i) => {
        const angle = (i / Math.max(1, map.nodes.length)) * Math.PI * 2;
        const radius = Math.min(w, h) * 0.3;
        return {
          ...node,
          x: w / 2 + Math.cos(angle) * radius,
          y: h / 2 + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          r: (mode === "ambient" ? 4.5 : 6) + Math.sqrt(node.weight) * (mode === "ambient" ? 1.7 : 2.2),
        };
      });
      stateRef.current = { nodes, w, h };
      // 처음부터 자리를 잡은 모습이 보이게 미리 돌려둔다 (빈 화면에서 시작하지 않는다)
      for (let i = 0; i < 240; i += 1) step();
      draw();
    };

    // 한 번만 걸러 둔다 — 전에는 함수라 매 프레임·매 그리기마다 전체 배열을 다시 훑었다.
    // (map 과 minSimilarity 는 이 이펙트의 의존성이므로 바뀌면 어차피 다시 계산된다)
    const activeEdgeList = map.edges.filter((e) => e.similarity >= minSimilarity);

    const step = () => {
      const { nodes, w, h } = stateRef.current;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const cx = w / 2;
      const cy = h / 2;

      // 배너는 높이가 200px 남짓이라 힘 균형이 관리자 화면과 달라야 한다.
      // 반발력이 중심 인력을 압도하면 점들이 전부 가장자리로 밀려 직사각형이 된다
      // (실제로 처음 그렇게 나왔다). 배너에서는 중심으로 더 세게 모으고 덜 밀어낸다.
      const pull = mode === "ambient" ? 0.008 : 0.0015;
      const push = mode === "ambient" ? 900 : 5200;

      for (const n of nodes) {
        n.vx += (cx - n.x) * pull;
        n.vy += (cy - n.y) * pull;
      }
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            d2 = 1;
            dx = 0.5;
            dy = 0.5;
          }
          const d = Math.sqrt(d2);
          const rep = push / d2;
          a.vx += (dx / d) * rep;
          a.vy += (dy / d) * rep;
          b.vx -= (dx / d) * rep;
          b.vy -= (dy / d) * rep;
        }
      }
      for (const e of activeEdgeList) {
        const a = byId.get(e.a);
        const b = byId.get(e.b);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        // 가까운 문서일수록 짧은 스프링 — 유사도가 거리로 보이게 한다.
        // 배너는 상자가 작아 같은 길이를 쓰면 전부 벽에 붙으므로 절반 정도로 줄인다.
        const rest =
          mode === "ambient"
            ? 60 + (0.85 - e.similarity) * 90
            : 260 - (e.similarity - 0.3) * 220;
        const k = 0.012 + (e.similarity - 0.3) * 0.03;
        const f = (d - rest) * k;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      // 점 아래에 이름을 쓰므로 그만큼 가장자리를 비워둔다(글자가 잘리지 않게).
      const pad = mode === "ambient" ? 20 : 34;
      for (const n of nodes) {
        n.vx *= 0.84;
        n.vy *= 0.84;
        n.x = Math.max(pad + n.r, Math.min(w - pad - n.r, n.x + n.vx));
        n.y = Math.max(pad + n.r, Math.min(h - pad - n.r, n.y + n.vy));
      }
    };

    const edgeRgb = brandRgb();

    // 배너에서 이름을 붙일 문서: 조각이 가장 많은(=내용이 두꺼운) 3건.
    // 화면 크기와 무관하게 개수를 고정해야 라벨이 서로 겹치지 않는다.
    const labelIds = new Set(
      mode === "ambient"
        ? [...map.nodes].sort((a, b) => b.weight - a.weight).slice(0, 3).map((n) => n.id)
        : [],
    );

    const draw = () => {
      const { nodes, w, h } = stateRef.current;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      ctx.clearRect(0, 0, w, h);

      // ref 에서 읽는다 — 강조 대상이 바뀌어도 이 이펙트를 다시 돌리지 않기 위해서다.
      const focus = selectedIdRef.current ?? hoverIdRef.current;
      const near = new Set<string>();
      if (focus) {
        for (const e of activeEdgeList) {
          if (e.a === focus) near.add(e.b);
          if (e.b === focus) near.add(e.a);
        }
      }

      for (const e of activeEdgeList) {
        const a = byId.get(e.a);
        const b = byId.get(e.b);
        if (!a || !b) continue;
        const strength = Math.max(0, Math.min(1, (e.similarity - 0.3) / 0.55));
        const lit = !focus || e.a === focus || e.b === focus;
        ctx.strokeStyle =
          mode === "ambient"
            ? `rgba(${edgeRgb}, ${0.1 + strength * 0.28})`
            : `rgba(${edgeRgb}, ${lit ? 0.12 + strength * 0.35 : 0.05})`;
        ctx.lineWidth = mode === "ambient" ? 0.7 + strength * 1.6 : 0.7 + strength * 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const n of nodes) {
        const dimmed = focus !== null && n.id !== focus && !near.has(n.id);
        ctx.globalAlpha = mode === "ambient" ? 0.92 : dimmed ? 0.28 : 1;
        if (n.id === focus) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 7, 0, Math.PI * 2);
          ctx.fillStyle = `${CATEGORY_COLOR[n.category]}22`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = CATEGORY_COLOR[n.category];
        ctx.fill();

        // 관리자 화면은 전부, 배너는 가장 굵은 몇 개만 이름을 붙인다 —
        // 좁은 배너에 11개를 다 쓰면 글자가 서로 겹쳐 오히려 못 읽는다(실제로 그랬다).
        const labelled = mode === "explorer" ? !dimmed : labelIds.has(n.id);
        if (labelled) {
          const limit = mode === "ambient" ? 9 : 15;
          const label = n.title.length > limit ? `${n.title.slice(0, limit - 1)}…` : n.title;
          const size = mode === "ambient" ? 10 : 11;
          ctx.font = `${n.id === focus ? 500 : 400} ${size}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = "center";
          // 가장자리 점의 이름이 캔버스 밖으로 잘리지 않게 안쪽으로 당긴다
          const half = ctx.measureText(label).width / 2;
          const tx = Math.max(half + 2, Math.min(w - half - 2, n.x));
          const ty = n.y + n.r + (mode === "ambient" ? 11 : 13);
          // 글자 뒤에 흰 테두리를 먼저 그린다 — 선이나 다른 점 위에 겹쳐도 읽히게.
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#ffffff";
          ctx.lineJoin = "round";
          ctx.strokeText(label, tx, ty);
          ctx.fillStyle = n.id === focus ? "#0f1a26" : "#5b6b7c";
          ctx.fillText(label, tx, ty);
        }
        ctx.globalAlpha = 1;
      }
    };

    const animate = () => {
      frame += 1;
      step();
      draw();
      // 안정될 때까지만 돌린다. 배너가 계속 움직이면 읽는 데 방해가 되고
      // 배터리도 먹는다 (reduced-motion 이면 애초에 애니메이션을 건너뛴다).
      if (frame < 90) raf = requestAnimationFrame(animate);
    };

    // 강조만 바뀌었을 때 배치를 건드리지 않고 다시 그리기 위한 통로.
    redrawRef.current = draw;

    layout();
    if (!reduced) {
      frame = 0;
      raf = requestAnimationFrame(animate);
    }

    const onResize = () => layout();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
      redrawRef.current = null;
    };
  }, [map, mode, minSimilarity]);

  function pick(event: React.MouseEvent<HTMLCanvasElement>): MapNode | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: Placed | null = null;
    let bestDistance = Infinity;
    for (const n of stateRef.current.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < n.r + 9 && d < bestDistance) {
        bestDistance = d;
        best = n;
      }
    }
    return best;
  }

  if (map.nodes.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={
        mode === "explorer"
          ? `문서 ${map.nodes.length}건의 의미 관계 지도. 아래 목록에서 같은 내용을 표로 볼 수 있습니다.`
          : `문서 ${map.nodes.length}건이 내용의 가까운 정도에 따라 ${map.edges.length}개의 선으로 이어진 지도입니다.`
      }
      onMouseMove={
        mode === "explorer"
          ? (event) => {
              const hit = pick(event);
              event.currentTarget.style.cursor = hit ? "pointer" : "default";
              const next = hit?.id ?? null;
              // 같은 점 위에서 움직이는 동안은 아무 일도 하지 않는다 —
              // 마우스 이동마다 다시 그리면 초당 수십 번 캔버스를 지우게 된다.
              if (next === hoverIdRef.current) return;
              hoverIdRef.current = next;
              redrawRef.current?.();
            }
          : undefined
      }
      onMouseLeave={
        mode === "explorer"
          ? () => {
              if (hoverIdRef.current === null) return;
              hoverIdRef.current = null;
              redrawRef.current?.();
            }
          : undefined
      }
      onClick={mode === "explorer" ? (event) => onSelect?.(pick(event)) : undefined}
    />
  );
}
