"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CATEGORY_LABELS, type DocumentCategory } from "@/lib/categories";

type Source = { id: string; title: string; category: DocumentCategory };

// 헤더 검색창에서 넘어온 ?q= 가 있을 때만 나타난다.
// 질문 칸이 따로 없으므로, 질문이 없으면 이 덩어리는 아예 그려지지 않는다.
export default function QaScreen() {
  const searchParams = useSearchParams();
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastRunQuestion = useRef<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);

  async function runSearch(text: string) {
    setQuestion(text);
    setError(null);
    setAnswer(null);
    setSources([]);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
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
  // "한 번 실행했는가"로 막으면 두 번째 질문이 무시되므로, 어떤 질문을 실행했는지 기억한다.
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q !== lastRunQuestion.current) {
      lastRunQuestion.current = q;
      runSearch(q);
    }
  }, [searchParams]);

  const q = searchParams.get("q");
  if (!q) return null;

  return (
    <section className="border-b border-hair bg-l-body">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <p className="mb-2 text-[10.5px] tracking-[.14em] text-ink-2">질문</p>
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
          </div>
        )}
      </div>
    </section>
  );
}
