"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CATEGORY_LABELS, CATEGORY_TAB_LABELS, type DocumentCategory } from "@/lib/categories";

type Source = { id: string; title: string; category: DocumentCategory };

// 헤더 검색창에서 넘어온 ?q= 가 있을 때만 나타난다.
// 질문 칸이 따로 없으므로, 질문이 없으면 이 덩어리는 아예 그려지지 않는다.
//
// ?category= 가 함께 오면 그 탭 안에서만 찾는다.
//   상단 검색칸은 이 값을 안 붙인다 — 어디 있는지 모를 때 쓰는 길이고,
//   그게 이 위키를 만든 이유이기 때문이다.
//   좁히는 길은 두 군데서 들어온다: 각 탭 안의 검색칸, 그리고 답변 아래 좁히기 버튼.
function isCategory(value: string | null): value is DocumentCategory {
  return value !== null && value in CATEGORY_LABELS;
}

export default function QaScreen() {
  const searchParams = useSearchParams();
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastRun = useRef<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);

  const q = searchParams.get("q");
  const rawCategory = searchParams.get("category");
  const category = isCategory(rawCategory) ? rawCategory : null;

  async function runSearch(text: string, scope: DocumentCategory | null) {
    setQuestion(text);
    setError(null);
    setAnswer(null);
    setSources([]);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, category: scope }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "답변을 가져오지 못했습니다.");
        return;
      }
      setAnswer(data.answer);
      setSources(data.sources ?? []);
    } catch {
      setError("질문 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // 이 화면은 홈이라 헤더에서 다시 검색해도 컴포넌트가 새로 만들어지지 않는다.
  // "한 번 실행했는가"로 막으면 두 번째 질문이 무시되므로, 무엇을 실행했는지 기억한다.
  //
  // 기억하는 것은 질문만이 아니라 질문 + 범위다. 같은 질문을 범위만 바꿔 다시
  // 던지는 게 좁히기 버튼이 하는 일이라, 질문만 보면 그 클릭이 무시된다.
  useEffect(() => {
    // 구분자를 직접 고르지 않는다 — 분류 이름에 없는 문자를 고르는 판단이
    // 끼면 나중에 분류가 늘 때 조용히 어긋날 수 있다. JSON 이 알아서 나눈다.
    const key = JSON.stringify([category, q]);
    if (q && key !== lastRun.current) {
      lastRun.current = key;
      runSearch(q, category);
    }
  }, [q, category]);

  if (!q) return null;

  // 답이 어느 탭에서 왔는지 모아 좁히기 버튼을 만든다.
  // 전체에서 찾았을 때만 의미가 있다 — 이미 좁혀 놓은 상태에서는 되돌아갈 길만 준다.
  const foundIn = [...new Set(sources.map((s) => s.category))];

  return (
    <section className="border-b border-hair bg-l-body">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] tracking-[.14em] text-ink-2">
          질문
          {category && (
            <span className="rounded-sm bg-navy px-1.5 py-0.5 text-[9.5px] font-medium tracking-normal text-white">
              {CATEGORY_TAB_LABELS[category]} 안에서만
            </span>
          )}
        </p>
        <h1 className="mb-4 font-display text-xl font-extrabold tracking-tight text-ink text-balance md:text-2xl">
          {question ?? q}
        </h1>

        {isSubmitting && <p className="text-sm text-ink-2">찾는 중…</p>}

        {error && (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-late">{error}</p>
            {question && (
              <button
                type="button"
                onClick={() => runSearch(question, category)}
                disabled={isSubmitting}
                className="border border-navy px-3 py-1.5 text-xs text-navy hover:bg-white disabled:opacity-50"
              >
                다시 시도
              </button>
            )}
          </div>
        )}

        {answer && (
          <div className="border-l-2 border-hair-2 pl-4">
            <p className="whitespace-pre-wrap text-[13px] leading-[1.95] text-[#2c3648]">{answer}</p>

            {sources.length > 0 && (
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-hair pt-2.5 text-[11px]">
                <span className="text-ink-2">출처</span>
                {sources.map((source) => (
                  <Link
                    key={source.id}
                    href={`/documents/${source.id}`}
                    className="border-b border-meet-d/30 text-meet-d hover:border-meet-d"
                  >
                    {CATEGORY_LABELS[source.category]} · {source.title}
                  </Link>
                ))}
              </div>
            )}

            {/* 답이 엉뚱할 때 되찾을 길.
                이게 없으면 틀린 답은 조용히 틀린 답으로 남는다. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px]">
              {category ? (
                <>
                  <span className="text-ink-3">
                    {sources.length === 0
                      ? `${CATEGORY_TAB_LABELS[category]} 안에는 없습니다.`
                      : "범위를 넓혀 볼까요?"}
                  </span>
                  <Link
                    href={`/?q=${encodeURIComponent(q)}`}
                    className="border border-hair-2 px-2 py-1 text-ink-2 transition-colors hover:border-navy hover:text-navy"
                  >
                    전체에서 다시 찾기
                  </Link>
                </>
              ) : (
                foundIn.length > 0 && (
                  <>
                    <span className="text-ink-3">좁혀서 다시 찾기</span>
                    {foundIn.map((c) => (
                      <Link
                        key={c}
                        href={`/?q=${encodeURIComponent(q)}&category=${c}`}
                        className="border border-hair-2 px-2 py-1 text-ink-2 transition-colors hover:border-navy hover:text-navy"
                      >
                        {CATEGORY_TAB_LABELS[c]} 안에서만
                      </Link>
                    ))}
                  </>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
