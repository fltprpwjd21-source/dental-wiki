"use client";

import Link from "next/link";
import KnowledgeMapCanvas from "@/components/KnowledgeMapCanvas";
import { CATEGORY_LABELS } from "@/lib/categories";
import type { DocumentCategory } from "@/lib/categories";
import type { KnowledgeMap } from "@/lib/knowledge-map";

const CATEGORY_COLOR: Record<DocumentCategory, string> = {
  meeting: "#2b66b2",
  insurance: "#0f9b7a",
  policy: "#6d55d0",
};

// 메인 화면 상단 배너.
//
// 처음에는 글자 뒤에 아주 옅게 까는 배경 장식으로 만들었는데, 그러면 정작 지도가
// 안 보이고 "자세히 보기"를 눌러 들어가야만 볼 수 있었다. 지도를 배너의 배경이
// 아니라 본체로 올려, 메인 화면에서 바로 읽히게 한다.
//
// 보기 전용이다. 돌려보기·문턱값 조절·고립 문서 점검은 /map 에 있다.
// (2026-09-07: 그 화면이 관리자 전용에서 전 스탭 공개로 바뀌면서 이 링크의 조건도 없앴다)
export default function KnowledgeMapBanner({ map }: { map: KnowledgeMap }) {
  if (map.nodes.length === 0) return null;

  // 서버는 문서마다 상위 6개까지 내려주는데, 좁은 배너에 그대로 그리면 선이 빽빽해
  // 형태가 안 보인다. 배너에서는 강한 연결만 남긴다(조작·분석 화면에서는 전부 본다).
  const BANNER_MIN_SIMILARITY = 0.72;
  const shownEdges = map.edges.filter((e) => e.similarity >= BANNER_MIN_SIMILARITY);
  const usedCategories = Array.from(new Set(map.nodes.map((n) => n.category)));

  return (
    <section className="-mx-4 mb-1 border-b border-gray-100 bg-surface/50 px-4 py-4 sm:mx-0 sm:rounded-lg sm:border sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-brand">지식 지도</h2>
        <p className="text-xs text-gray-500">
          문서 <b className="font-medium text-ink">{map.nodes.length}</b>건 · 가까운 연결{" "}
          <b className="font-medium text-ink">{shownEdges.length}</b>개
          {" · "}
          <Link href="/map" className="text-accent underline underline-offset-2">
            크게 보기
          </Link>
        </p>
      </div>

      {/* 지도 본체. 배경이 아니라 읽으라고 놓는 것이므로 충분한 높이를 준다. */}
      <div className="mt-2.5 h-52 w-full sm:h-60">
        <KnowledgeMapCanvas
          map={map}
          mode="ambient"
          minSimilarity={BANNER_MIN_SIMILARITY}
          className="h-full w-full"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        {usedCategories.map((category) => (
          <span key={category} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_COLOR[category] }}
            />
            {CATEGORY_LABELS[category]}
          </span>
        ))}
        <span className="text-gray-400">가까운 내용일수록 짧은 선</span>
      </div>
    </section>
  );
}
