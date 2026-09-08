"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_TAB_LABELS, type DocumentCategory } from "@/lib/categories";

// 탭 안에 두는 검색칸. 이 카테고리 안에서만 찾는다.
//
// 상단 검색칸(전체)과 나란히 있는 게 아니라 서로 다른 일을 한다.
//   상단  = 어디 있는지 모를 때. 이게 이 위키를 만든 이유다.
//   여기  = 수가 질문인 걸 아는 사람이 바로 좁혀 묻는 길.
// 답은 같은 홈 화면에서 나온다 — 화면을 두 벌 만들지 않고 ?category= 만 붙인다.
export default function CategorySearch({ category }: { category: DocumentCategory }) {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = value.trim();
    if (!question) return;
    router.push(`/?q=${encodeURIComponent(question)}&category=${category}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-w-0 flex-1 items-center gap-2 border border-hair-2 bg-white px-2.5 py-1.5 transition-colors focus-within:border-navy sm:max-w-xs"
    >
      <span aria-hidden className="shrink-0 text-ink-3">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={`${CATEGORY_TAB_LABELS[category]} 안에서 찾기`}
        aria-label={`${CATEGORY_TAB_LABELS[category]} 안에서 찾기`}
        className="min-w-0 flex-1 bg-transparent text-[11.5px] text-ink outline-none placeholder:text-ink-3"
      />
    </form>
  );
}
