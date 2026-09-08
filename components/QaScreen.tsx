"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CATEGORY_LABELS, CATEGORY_TAB_LABELS, type DocumentCategory } from "@/lib/categories";

type Source = { id: string; title: string; category: DocumentCategory };
type FoundDocument = { id: string; title: string; category: DocumentCategory };

// ?q= 가 있을 때만 나타나는 답변 덩어리. 두 자리에서 같은 것을 쓴다.
//
//   홈 (/?q=…)                  → scope 없음. 전체에서 찾는다.
//   탭 (/categories/수가?q=…)   → scope=insurance. 그 탭 안에서만 찾고, 화면도 그 탭에 머문다.
//
// 범위를 URL 파라미터(?category=)가 아니라 prop 으로 받는 이유
//   탭 안에서 검색했으면 결과도 그 탭에서 봐야 한다. 주소가 곧 화면이므로,
//   /categories/수가?q=… 라는 주소 자체가 "수가 탭에서 찾은 결과"를 뜻하게 두면
//   범위를 따로 실어 보낼 필요가 없다. 새로고침·뒤로가기·링크 공유도 그대로 맞는다.
export default function QaScreen({ scope }: { scope?: DocumentCategory }) {
  const searchParams = useSearchParams();
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [documents, setDocuments] = useState<FoundDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastRun = useRef<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);

  const q = searchParams.get("q");
  const category = scope ?? null;

  // useCallback 으로 감싸는 이유: 아래 useEffect 의 의존성이다.
  //   감싸지 않으면 렌더마다 새 함수가 되어 lint 가 의존성 누락으로 잡고,
  //   의존성에 넣으면 매 렌더마다 이펙트가 다시 돈다.
  const runSearch = useCallback(async (text: string) => {
    setQuestion(text);
    setError(null);
    setAnswer(null);
    setSources([]);
    setDocuments([]);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, category }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "답변을 가져오지 못했습니다.");
        return;
      }
      setAnswer(data.answer);
      setSources(data.sources ?? []);
      setDocuments(data.documents ?? []);
    } catch {
      setError("질문 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }, [category]);

  // 같은 화면에 머문 채 헤더에서 다시 검색해도 컴포넌트가 새로 만들어지지 않는다.
  // "한 번 실행했는가"로 막으면 두 번째 질문이 무시되므로, 무엇을 실행했는지 기억한다.
  useEffect(() => {
    // 구분자를 직접 고르지 않는다 — 분류 이름에 없는 문자를 고르는 판단이
    // 끼면 나중에 분류가 늘 때 조용히 어긋날 수 있다. JSON 이 알아서 나눈다.
    const key = JSON.stringify([category, q]);
    if (q && key !== lastRun.current) {
      lastRun.current = key;
      runSearch(q);
    }
  }, [q, category, runSearch]);

  if (!q) return null;

  // 답이 어느 탭에서 왔는지 모아 좁히기 버튼을 만든다.
  // 전체에서 찾았을 때만 의미가 있다 — 이미 좁혀 놓은 상태에서는 되돌아갈 길만 준다.
  const foundIn = [...new Set([...sources, ...documents].map((s) => s.category))];
  const gotAnswer = sources.length > 0;

  return (
    <section className="border-b border-hair bg-l-body">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] tracking-[.14em] text-ink-2">
          {gotAnswer || isSubmitting ? "질문" : "검색"}
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
                onClick={() => runSearch(question)}
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
            {/* 답을 만들 근거가 있었을 때만 답을 보여준다.
                근거가 없으면 정해진 "없습니다" 문장 대신 아래 문서 목록이 답을 대신한다. */}
            {gotAnswer ? (
              <>
                <p className="whitespace-pre-wrap text-[13px] leading-[1.95] text-[#2c3648]">
                  {answer}
                </p>

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
              </>
            ) : documents.length > 0 ? (
              <>
                <p className="text-[12.5px] leading-relaxed text-ink-2">
                  질문에 바로 답할 만한 내용은 못 찾았습니다. 이 낱말이 든 문서를 찾았습니다.
                </p>
                <ul className="mt-2 border-t border-hair">
                  {documents.map((doc) => (
                    <li key={doc.id} className="border-b border-hair">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="flex flex-wrap items-baseline gap-x-2.5 py-2 text-[12.5px] text-ink hover:text-meet-d"
                      >
                        <span className="font-mono text-[10px] text-ink-3">
                          {CATEGORY_TAB_LABELS[doc.category]}
                        </span>
                        {doc.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[13px] leading-relaxed text-ink-2">{answer}</p>
            )}

            {/* 답이 엉뚱하거나 못 찾았을 때 되찾을 길.
                이게 없으면 틀린 답은 조용히 틀린 답으로 남는다. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px]">
              {category ? (
                <>
                  <span className="text-ink-3">
                    {sources.length === 0 && documents.length === 0
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
                        href={`/categories/${c}?q=${encodeURIComponent(q)}`}
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
