import Link from "next/link";
import { NOTICE_DOT_DARK, NOTICE_LABELS, isoDate, type Notice } from "@/lib/notices";

// 층 4 — 캘린더.
//
// 따로 입력하는 곳을 만들지 않는다. 공지에 날짜(event_on)가 있으면 그 날에 점이 찍힌다.
// 입력을 두 번 시키면 한쪽은 반드시 비어 있게 된다.
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function HomeCalendar({ events }: { events: Notice[] }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const todayIso = isoDate(today);

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();

  // 날짜별로 어떤 분류의 점이 찍히는지 모은다 (같은 날 둘이면 점도 둘).
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

  // 오늘 이후로 가장 가까운 일정 셋. 캘린더만 있으면 날짜를 눈으로 찾아야 한다.
  const upcoming = events
    .filter((n) => n.event_on && n.event_on >= todayIso)
    .sort((a, b) => (a.event_on! < b.event_on! ? -1 : 1))
    .slice(0, 3);

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
                className={`pb-1 text-center text-[9.5px] tracking-wide ${i === 0 ? "text-[#b4544a]" : "text-ink-3"}`}
              >
                {w}
              </div>
            ))}

            {cells.map((day, i) => {
              if (day === null) return <div key={`pad-${i}`} aria-hidden />;
              const iso = isoDate(new Date(year, month, day));
              const dots = byDate.get(iso) ?? [];
              const isToday = iso === todayIso;
              const isSunday = i % 7 === 0;

              return (
                <div
                  key={iso}
                  className={`relative flex min-h-[30px] flex-col items-center justify-center gap-[3px] text-[11px] tabular-nums transition-colors md:min-h-[33px] md:text-[11.5px] ${
                    isToday
                      ? "bg-navy font-bold text-white"
                      : isSunday
                        ? "text-[#b4544a] hover:bg-white"
                        : "text-[#2f3c52] hover:bg-white"
                  }`}
                >
                  {isToday && (
                    <span aria-hidden className="animate-ring absolute inset-0 border border-navy" />
                  )}
                  <span className="relative">{day}</span>
                  <span className="relative flex h-1 items-center gap-[2.5px]">
                    {dots.slice(0, 3).map((n) => (
                      <span
                        key={n.id}
                        title={n.title}
                        className={`h-1 w-1 rounded-full ${isToday ? "ring-1 ring-white/85" : ""}`}
                        style={{ background: NOTICE_DOT_DARK[n.category] }}
                      />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-1.5 font-display text-[13px] font-bold text-ink">다가오는 일정</h3>
          {upcoming.length === 0 ? (
            <p className="border-t border-hair pt-2 text-[11.5px] text-ink-2">
              등록된 일정이 없습니다.
            </p>
          ) : (
            <ul>
              {upcoming.map((n) => (
                <li key={n.id} className="border-t border-hair">
                  <Link
                    href={`/notices/${n.id}`}
                    className="grid grid-cols-[54px_1fr] items-baseline gap-2.5 py-2 text-xs hover:bg-white"
                  >
                    <span className="font-mono text-[11px] text-ink-2">
                      {n.event_on!.slice(5)}
                    </span>
                    <span className="leading-snug text-ink">
                      {n.title}
                      <em className="mt-0.5 block text-[10.5px] font-light not-italic text-ink-2">
                        {NOTICE_LABELS[n.category]}
                      </em>
                    </span>
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
