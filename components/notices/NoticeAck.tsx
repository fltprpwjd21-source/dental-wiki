"use client";

import { useState } from "react";

// 층 마지막 — 남색 띠. 읽음 확인을 켠 공지에만 붙는다.
// 전부에 붙이면 아무도 안 누르기 때문에, 작성할 때 고른 공지에만 나온다.
export default function NoticeAck({ id, readCount }: { id: string; readCount: number }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleAck() {
    setBusy(true);
    try {
      const response = await fetch(`/api/notices/${id}/read`, { method: "POST" });
      if (response.ok) setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-head text-white/70">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2.5 px-4 py-3 text-[11.5px]">
        <span>
          이 공지를 읽은 사람 <b className="font-medium text-white">{readCount + (done ? 1 : 0)}</b>명
        </span>
        <button
          type="button"
          onClick={handleAck}
          disabled={busy || done}
          className="ml-auto bg-white px-4 py-1.5 text-[11px] font-medium text-navy transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {done ? "확인했습니다" : busy ? "처리 중…" : "읽음 확인"}
        </button>
      </div>
    </div>
  );
}
