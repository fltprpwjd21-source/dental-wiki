"use client";

import Link from "next/link";
import { useState } from "react";
import { NOTICE_LABELS, isoDate, type Notice } from "@/lib/notices";

// 층 4 — 캘린더.
//
// 따로 입력하는 곳을 만들지 않는다. 공지에 날짜(event_on)가 있으면 그 날에 점이 찍힌다.
// 입력을 두 번 시키면 한쪽은 반드시 비어 있게 된다.
//
// 점은 분류색이 아니라 전부 주황이다.
//   달력에서 알아야 할 것은 "무슨 분류인가"가 아니라 "이 날 뭔가 있다"이고,
//   분류색(파랑 계열)은 옅은 파랑 바탕과 오늘(남색) 위에서 잘 안 보인다.
//   주황은 두 바탕 모두에서 튀고, 카드의 안 읽음 점과 같은 색이라 "봐야 할 것"으로 읽힌다.
//
// 오른쪽은 고른 날의 일정이다. 처음에는 오늘이 골라져 있고, 다른 날을 누르면 그 날로 바뀐다.
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function HomeCalendar({ events }: { events: Notice[] }) {
  // 오늘을 렌더 중에 읽지 않는다 — 같은 렌더가 매번 다른 값을 내면 안 된다.
  // 처음 한 번만 계산해 상태로 들고 간다.
  const [today] = useState(() => isoDate(new Date()));
  const [selected, setSelected] = useState(today);

  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = new Date(year, month, 1).getDay();

  // 날짜별로 그 날의 공지를 모은다 (같은 날 둘이면 점도 둘).
  const byDate = new Map<string, Notice[]>();
  for (const notice of events) {
    if (!notice.event_on) continue;
    const list = byDate.get(notice.event_on) ?? [];
    list.push(notice);
    byDate.set(notice.event_on, list);
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const picked = byDate.get(selected) ?? [];
  const isToday = selected === today;
  const heading = isToday
    ? "오늘 일정"
    : `${Number(selected.slice(5, 7))}월 ${Number(selected.slice(8, 10))}일 일정`;

  return (
    <section className="border-t border-hair bg-l-cal">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:gap-5 md:grid-cols-[1fr_220px] md:items-start md:py-5">
        <div>
          <div className="mb-2.5 flex items-baseline gap-2">
            <h2 className="font-display text-[15px] font-bold text-ink">
              {year}년 {month + 1}월
            </h2>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`pb-1 text-center text-[9.5px] tracking-wide ${
                  i === 0 ? "text-[#b4544a]" : "text-ink-3"
                }`}
              >
                {w}
              </div>
            ))}

            {cells.map((day, i) => {
              if (day === null) return <div key={`pad-${i}`} aria-hidden />;
              const iso = isoDate(new Date(year, month, day));
              const dots = byDate.get(iso) ?? [];
              const dayIsToday = iso === today;
              const dayIsSelected = iso === selected;
              const isSunday = i % 7 === 0;

              // 오늘은 남색, 고른 날은 그보다 한 단계 밝은 파랑.
              // 둘 다인 날은 오늘 색이 이긴다 — 오늘이 어디인지가 먼저다.
              const tone = dayIsToday
                ? "bg-navy font-bold text-white"
                : dayIsSelected
                  ? "bg-[#3d74c0] font-medium text-white"
                  : isSunday
                    ? "text-[#b4544a] hover:bg-[#3d74c0] hover:text-white"
                    : "text-[#2f3c52] hover:bg-[#3d74c0] hover:text-white";

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  aria-pressed={dayIsSelected}
                  aria-label={`${month + 1}월 ${day}일${dots.length > 0 ? ` · 일정 ${dots.length}건` : ""}`}
                  className={`relative flex min-h-[30px] flex-col items-center justify-center gap-[3px] text-[11px] tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy md:min-h-[33px] md:text-[11.5px] ${tone}`}
                >
                  {dayIsToday && (
                    <span aria-hidden className="animate-ring absolute inset-0 border border-navy" />
                  )}
                  <span className="relative">{day}</span>
                  <span className="relative flex h-1 items-center gap-[2.5px]">
                    {dots.slice(0, 3).map((n) => (
                      <span
                        key={n.id}
                        className={`h-1 w-1 rounded-full bg-amber ${
                          dayIsToday || dayIsSelected ? "ring-1 ring-white/85" : ""
                        }`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <h3 className="font-display text-[13px] font-bold text-ink">{heading}</h3>
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelected(today)}
                className="ml-auto text-[10.5px] text-meet-d underline-offset-2 hover:underline"
              >
                오늘로
              </button>
            )}
          </div>

          {picked.length === 0 ? (
            <p className="border-t border-hair pt-2 text-[11.5px] text-ink-2">
              {isToday ? "오늘은 일정이 없습니다." : "이 날은 일정이 없습니다."}
            </p>
          ) : (
            <ul>
              {picked.map((n) => (
                <li key={n.id} className="border-t border-hair">
                  <Link
                    href={`/notices/${n.id}`}
                    className="block py-2 text-xs leading-snug text-ink hover:bg-white"
                  >
                    <span
                      aria-hidden
                      className="mr-1.5 inline-block h-1 w-1 rounded-full bg-amber align-middle"
                    />
                    {n.title}
                    <em className="mt-0.5 block text-[10.5px] font-light not-italic text-ink-2">
                      {NOTICE_LABELS[n.category]}
                    </em>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
