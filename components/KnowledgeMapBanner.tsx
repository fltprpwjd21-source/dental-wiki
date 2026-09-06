"use client";

import Link from "next/link";
import KnowledgeMapCanvas from "@/components/KnowledgeMapCanvas";
import type { KnowledgeMap } from "@/lib/knowledge-map";

// 메인 화면 상단 배너. 위키에 쌓인 문서들이 서로 어떻게 얽혀 있는지를
// 배경 그래픽으로 깔고, 그 위에 안내 문구를 얹는다.
//
// 보기 전용이다 — 클릭·호버·조작이 없다. 실제로 들여다보고 조작하는 화면은
// 설정 탭 안 관리자 전용(/settings/map)에 따로 있다.
//
// 장식이지만 가짜 데이터는 쓰지 않는다. 실제 문서와 실제 계산된 관계를 그린다.
export default function KnowledgeMapBanner({
  map,
  isAdmin,
}: {
  map: KnowledgeMap;
  isAdmin: boolean;
}) {
  if (map.nodes.length === 0) return null;

  return (
    <section className="relative -mx-4 mb-2 overflow-hidden border-b border-gray-100 bg-surface/60 px-4 py-7 sm:rounded-lg sm:border sm:px-6">
      {/* 배경 그래픽. 텍스트 뒤에 깔리므로 스크린리더에서는 감춘다(aria-hidden). */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <KnowledgeMapCanvas map={map} mode="ambient" className="h-full w-full" />
      </div>
      {/* 글자가 선 위에 겹쳐도 읽히도록 왼쪽에서 오른쪽으로 옅어지는 막을 덧댄다 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/30" />

      <div className="relative max-w-md">
        <p className="text-[11px] font-medium uppercase tracking-widest text-brand-muted">
          지식 지도
        </p>
        <h2 className="mt-1.5 text-base font-semibold text-ink">
          위키 문서 {map.nodes.length}건이 서로 이어져 있습니다
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
          질문에 답할 때 쓰는 것과 같은 의미 정보로, 문서끼리 얼마나 가까운지를 계산해 그렸습니다.
          가까운 문서일수록 짧은 선으로 묶입니다.
        </p>
        {isAdmin && (
          <Link
            href="/settings/map"
            className="mt-3 inline-block text-sm text-accent underline underline-offset-2 hover:text-brand"
          >
            지도 자세히 보기
          </Link>
        )}
      </div>
    </section>
  );
}
