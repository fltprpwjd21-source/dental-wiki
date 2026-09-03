"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// 헤더 어디서든 질문을 입력하면 홈으로 이동해 바로 검색된다 (QaScreen이 ?q= 를 읽어 자동 실행)
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
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-md gap-2">
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="궁금한 내용을 검색해보세요"
        className="w-full rounded-full border border-gray-300 px-4 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-brand px-4 py-1.5 text-sm text-white hover:bg-brand-dark"
      >
        검색
      </button>
    </form>
  );
}
