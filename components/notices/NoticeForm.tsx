"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  NOTICE_CATEGORIES,
  NOTICE_DOT_DARK,
  NOTICE_LABELS,
  defaultEndsOn,
  todayIso,
  type Notice,
  type NoticeCategory,
} from "@/lib/notices";

// 공지 작성·수정. 노트에서 「공지 등록」으로 들어올 때도 이 폼을 쓴다.
//
// 쓰는 사람이 적어야 하는 건 분류와 제목뿐이다. 나머지는 전부 채워져 있다 —
// 게시 기간은 30일, 본문은 연결한 노트가 대신한다.
// 적을 게 많으면 공지는 다시 카톡으로 간다.
export default function NoticeForm({
  notice,
  source,
}: {
  notice?: Notice;
  source?: { kind: "note" | "document"; id: string; title: string };
}) {
  const router = useRouter();
  const editing = Boolean(notice);

  const [category, setCategory] = useState<NoticeCategory>(notice?.category ?? "rule");
  const [title, setTitle] = useState(notice?.title ?? source?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [startsOn, setStartsOn] = useState(notice?.starts_on ?? todayIso());
  const [endsOn, setEndsOn] = useState(notice?.ends_on ?? defaultEndsOn());
  const [eventOn, setEventOn] = useState(notice?.event_on ?? "");
  const [needsAck, setNeedsAck] = useState(notice?.needs_ack ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const linkedTitle = source?.title;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);

    const payload = {
      category,
      title,
      body,
      startsOn,
      endsOn,
      eventOn: eventOn || null,
      needsAck,
      sourceNoteId: source?.kind === "note" ? source.id : undefined,
      sourceDocumentId: source?.kind === "document" ? source.id : undefined,
    };

    try {
      const response = await fetch(editing ? `/api/notices/${notice!.id}` : "/api/notices", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      router.push(`/notices/${editing ? notice!.id : data.notice.id}`);
      router.refresh();
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 text-[12.5px] text-ink">
      <div>
        <p className="mb-1.5 text-[10.5px] tracking-[.14em] text-ink-2">분류</p>
        <div className="flex flex-wrap gap-1.5">
          {NOTICE_CATEGORIES.map((value) => {
            const on = value === category;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 border bg-white px-3 py-1.5 text-[11px] transition-colors ${
                  on ? "font-medium" : "border-hair-2 text-ink-2 hover:border-[#a9b6cb]"
                }`}
                style={on ? { borderColor: NOTICE_DOT_DARK[value], color: NOTICE_DOT_DARK[value] } : undefined}
              >
                <span
                  aria-hidden
                  className="h-1 w-1 rounded-full"
                  style={{ background: on ? NOTICE_DOT_DARK[value] : "currentColor", opacity: on ? 1 : 0.45 }}
                />
                {NOTICE_LABELS[value]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="notice-title" className="mb-1.5 block text-[10.5px] tracking-[.14em] text-ink-2">
          제목 — 홈 카드에 이 글자가 크게 뜹니다
        </label>
        <input
          id="notice-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full border border-hair-2 bg-white px-3 py-2.5 font-display text-base font-bold tracking-tight text-ink transition-colors hover:border-[#a9b6cb] focus:border-navy focus:outline-none"
        />
      </div>

      {linkedTitle && (
        <p className="border-l-2 border-navy bg-l-cal px-3.5 py-2.5 text-[11px] leading-relaxed text-ink-2">
          <b className="font-medium text-ink">{linkedTitle}</b> 의 내용이 이 공지에 그대로 이어집니다.
          복사가 아니라 연결이라, 나중에 원본을 고치면 공지에서도 바뀐 내용이 보입니다.
          아래 본문은 <b className="font-medium text-ink">덧붙일 말이 있을 때만</b> 적으면 됩니다.
        </p>
      )}

      <div>
        <label htmlFor="notice-body" className="mb-1.5 block text-[10.5px] tracking-[.14em] text-ink-2">
          {linkedTitle ? "덧붙일 말 (선택)" : "본문"}
        </label>
        <textarea
          id="notice-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={linkedTitle ? 3 : 8}
          placeholder={linkedTitle ? "예: 9월 8일부터 적용됩니다" : "시행일, 내선번호, 예외 사항…"}
          className="w-full border border-hair-2 bg-white px-3 py-2.5 leading-relaxed text-ink transition-colors hover:border-[#a9b6cb] focus:border-navy focus:outline-none"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="notice-start" className="mb-1.5 block text-[10.5px] tracking-[.14em] text-ink-2">
            게시 시작
          </label>
          <input
            id="notice-start"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="w-full border border-hair-2 bg-white px-3 py-2 text-ink focus:border-navy focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="notice-end" className="mb-1.5 block text-[10.5px] tracking-[.14em] text-ink-2">
            게시 종료 — 지나면 홈에서 내려감
          </label>
          <input
            id="notice-end"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="w-full border border-hair-2 bg-white px-3 py-2 text-ink focus:border-navy focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="notice-event" className="mb-1.5 block text-[10.5px] tracking-[.14em] text-ink-2">
            일정 날짜 — 캘린더에 점이 찍힘
          </label>
          <input
            id="notice-event"
            type="date"
            value={eventOn}
            onChange={(e) => setEventOn(e.target.value)}
            className="w-full border border-hair-2 bg-white px-3 py-2 text-ink focus:border-navy focus:outline-none"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[11.5px] text-ink-2">
        <input
          type="checkbox"
          checked={needsAck}
          onChange={(e) => setNeedsAck(e.target.checked)}
          className="accent-[#0c1c40]"
        />
        읽은 사람을 집계합니다 — 공지를 연 사람이 몇 명인지 아래에 표시됩니다
      </label>

      {error && (
        <p role="alert" className="text-[12px] text-late">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="bg-navy px-5 py-2.5 text-xs text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_22px_-10px_rgba(12,28,64,.6)] disabled:opacity-50"
        >
          {busy ? "저장 중…" : editing ? "수정 저장" : "공지 올리기"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-[11.5px] text-ink-2 underline-offset-2 hover:underline"
        >
          취소
        </button>
      </div>
    </form>
  );
}
