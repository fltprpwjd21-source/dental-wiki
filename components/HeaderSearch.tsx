"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// 검색과 질문을 한 칸이 받는다. 입력하면 홈으로 가서 답이 나온다 (QaScreen이 ?q= 를 읽는다).
// 남색 머리에서 유일하게 흰 칸이라, 손을 올리면 1px 떠오르게 해 누를 곳임을 알린다.
export default function HeaderSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = value.trim();
    if (!question) return;
    router.push(`/?q=${encodeURIComponent(question)}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-center gap-2 bg-white px-3 py-2 shadow-[0_1px_0_rgba(255,255,255,.16),0_2px_8px_-3px_rgba(0,0,0,.5)] transition-all duration-200 focus-within:-translate-y-px hover:-translate-y-px hover:shadow-[0_1px_0_rgba(255,255,255,.3),0_8px_16px_-6px_rgba(0,0,0,.6)] md:mx-auto md:max-w-lg"
    >
      <span aria-hidden className="shrink-0 text-ink-3">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="검색하거나 질문하기"
        aria-label="검색하거나 질문하기"
        className="min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-ink-3 focus:outline-none"
      />
    </form>
  );
}
