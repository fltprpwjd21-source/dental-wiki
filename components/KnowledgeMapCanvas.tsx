"use client";

import { useEffect, useRef, useState } from "react";
import type { KnowledgeMap, MapNode } from "@/lib/knowledge-map";
import type { DocumentCategory } from "@/lib/categories";

// 문서 간 의미 관계를 힘-기반 배치로 그린다. 두 가지 모드를 한 컴포넌트가 맡는다.
//
//   ambient  — 메인 화면 배너. 보기 전용이고 아주 옅게 깔린다. 클릭·호버 없음.
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
  const [hoverId, setHoverId] = useState<string | null>(null);

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
          r: (mode === "ambient" ? 3 : 6) + Math.sqrt(node.weight) * (mode === "ambient" ? 1.1 : 2.2),
        };
      });
      stateRef.current = { nodes, w, h };
      // 처음부터 자리를 잡은 모습이 보이게 미리 돌려둔다 (빈 화면에서 시작하지 않는다)
      for (let i = 0; i < 240; i += 1) step();
      draw();
    };

    const activeEdges = () => map.edges.filter((e) => e.similarity >= minSimilarity);

    const step = () => {
      const { nodes, w, h } = stateRef.current;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const cx = w / 2;
      const cy = h / 2;

      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.0015;
        n.vy += (cy - n.y) * 0.0015;
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
          const rep = (mode === "ambient" ? 3200 : 5200) / d2;
          a.vx += (dx / d) * rep;
          a.vy += (dy / d) * rep;
          b.vx -= (dx / d) * rep;
          b.vy -= (dy / d) * rep;
        }
      }
      for (const e of activeEdges()) {
        const a = byId.get(e.a);
        const b = byId.get(e.b);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        // 가까운 문서일수록 짧은 스프링 — 유사도가 거리로 보이게 한다
        const rest = 260 - (e.similarity - 0.3) * 220;
        const k = 0.012 + (e.similarity - 0.3) * 0.03;
        const f = (d - rest) * k;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      const pad = mode === "ambient" ? 6 : 34;
      for (const n of nodes) {
        n.vx *= 0.84;
        n.vy *= 0.84;
        n.x = Math.max(pad + n.r, Math.min(w - pad - n.r, n.x + n.vx));
        n.y = Math.max(pad + n.r, Math.min(h - pad - n.r, n.y + n.vy));
      }
    };

    const edgeRgb = brandRgb();

    const draw = () => {
      const { nodes, w, h } = stateRef.current;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      ctx.clearRect(0, 0, w, h);

      const focus = selectedId ?? hoverId;
      const near = new Set<string>();
      if (focus) {
        for (const e of activeEdges()) {
          if (e.a === focus) near.add(e.b);
          if (e.b === focus) near.add(e.a);
        }
      }

      for (const e of activeEdges()) {
        const a = byId.get(e.a);
        const b = byId.get(e.b);
        if (!a || !b) continue;
        const strength = Math.max(0, Math.min(1, (e.similarity - 0.3) / 0.55));
        const lit = !focus || e.a === focus || e.b === focus;
        ctx.strokeStyle =
          mode === "ambient"
            ? `rgba(${edgeRgb}, ${0.05 + strength * 0.1})`
            : `rgba(${edgeRgb}, ${lit ? 0.12 + strength * 0.35 : 0.05})`;
        ctx.lineWidth = mode === "ambient" ? 0.6 + strength : 0.7 + strength * 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const n of nodes) {
        const dimmed = focus !== null && n.id !== focus && !near.has(n.id);
        ctx.globalAlpha = mode === "ambient" ? 0.5 : dimmed ? 0.28 : 1;
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

        if (mode === "explorer" && !dimmed) {
          const label = n.title.length > 15 ? `${n.title.slice(0, 14)}…` : n.title;
          ctx.font = `${n.id === focus ? 500 : 400} 11px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = n.id === focus ? "#0f1a26" : "#6b7c8d";
          ctx.fillText(label, n.x, n.y + n.r + 13);
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
    };
  }, [map, mode, minSimilarity, hoverId, selectedId]);

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
      aria-hidden={mode === "ambient"}
      role={mode === "explorer" ? "img" : undefined}
      aria-label={
        mode === "explorer"
          ? `문서 ${map.nodes.length}건의 의미 관계 지도. 아래 목록에서 같은 내용을 표로 볼 수 있습니다.`
          : undefined
      }
      onMouseMove={
        mode === "explorer"
          ? (event) => {
              const hit = pick(event);
              event.currentTarget.style.cursor = hit ? "pointer" : "default";
              setHoverId(hit?.id ?? null);
            }
          : undefined
      }
      onMouseLeave={mode === "explorer" ? () => setHoverId(null) : undefined}
      onClick={mode === "explorer" ? (event) => onSelect?.(pick(event)) : undefined}
    />
  );
}
