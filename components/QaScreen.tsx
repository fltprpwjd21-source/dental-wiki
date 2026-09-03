"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CATEGORY_LABELS, type DocumentCategory } from "@/lib/categories";

type Source = { id: string; title: string; category: DocumentCategory };

export default function QaScreen() {
  const searchParams = useSearchParams();
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAutoRun = useRef(false);

  async function runSearch(text: string) {
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

  // 맨 위 헤더 검색창에서 넘어온 ?q= 를 읽어 자동 실행한다 (질문 입력창은 헤더에만 있음)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !hasAutoRun.current) {
      hasAutoRun.current = true;
      runSearch(q);
    }
  }, [searchParams]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="mb-2 text-lg font-semibold text-brand">치과위키에 질문하기</h1>
        <nav className="flex gap-3">
          {(Object.entries(CATEGORY_LABELS) as [DocumentCategory, string][]).map(
            ([value, label]) => (
              <Link
                key={value}
                href={`/categories/${value}`}
                className="text-sm text-accent underline hover:text-brand-dark"
              >
                {label}
              </Link>
            ),
          )}
        </nav>
      </div>

      {isSubmitting && <p className="text-sm text-brand-muted">검색 중...</p>}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!isSubmitting && !error && !answer && (
        <p className="text-sm text-brand-muted">
          위 검색창에 궁금한 내용을 입력해보세요.
        </p>
      )}

      {answer && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-surface p-4">
          <p className="whitespace-pre-wrap text-sm text-ink">{answer}</p>

          {sources.length > 0 && (
            <div className="space-y-1 border-t border-gray-200 pt-3">
              <p className="text-xs text-brand-muted">근거 문서</p>
              <ul className="space-y-1">
                {sources.map((source) => (
                  <li key={source.id} className="text-xs text-gray-600">
                    [{CATEGORY_LABELS[source.category]}]{" "}
                    <Link href={`/documents/${source.id}`} className="text-accent underline hover:text-brand-dark">
                      {source.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
