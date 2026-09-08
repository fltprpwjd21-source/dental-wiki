import Link from "next/link";
import { NOTICE_DOT, NOTICE_LABELS, shortDate, type Notice } from "@/lib/notices";

// 층 3 — 흰 창 위에 검은 카드.
//
// 시안 D: 큰 번호를 바탕 무늬로 깐다. 장식이 아니라 순서다 — 왼쪽이 가장 최근이다.
// 손을 올리면 카드가 뜨고 번호가 따라 어긋난다. 나머지 카드는 물러난다.
export default function NoticeCards({
  notices,
  unreadIds,
}: {
  notices: Notice[];
  /** 한 번도 열어보지 않은 공지 — 주황 점이 붙는다 */
  unreadIds: Set<string>;
}) {
  if (notices.length === 0) {
    // 빈 상자를 남기지 않는다. 공지가 없으면 이 덩어리가 통째로 사라진다.
    return null;
  }

  return (
    <section className="bg-l-card pt-5">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-baseline gap-2.5 pb-3">
          <h2 className="font-display text-base font-bold tracking-tight text-ink">공지</h2>
          {unreadIds.size > 0 && (
            <span className="font-mono text-[10.5px] text-ink-3">안 읽음 {unreadIds.size}</span>
          )}
          <Link href="/notices" className="ml-auto text-[11.5px] text-meet-d hover:text-ink">
            전체 보기 →
          </Link>
        </div>

        <ul className="grid grid-cols-3 gap-1.5 sm:gap-2 md:grid-cols-5">
          {notices.map((notice, i) => (
            <li
              key={notice.id}
              /* 넷째·다섯째는 좁은 화면에서 숨는다. 세 장이 한 줄에 들어가야 하기 때문이다. */
              className={i >= 3 ? "hidden md:block" : ""}
            >
              <Link
                href={`/notices/${notice.id}`}
                style={{ animationDelay: `${0.04 + i * 0.07}s`, ["--cat" as string]: NOTICE_DOT[notice.category] }}
                className="animate-rise group relative flex aspect-[4/5] flex-col gap-1.5 overflow-hidden bg-card-ink p-2.5 text-white shadow-[0_2px_8px_-4px_rgba(7,18,42,.4)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_-14px_rgba(7,18,42,.6)] md:p-3.5"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-[18px] -right-[5px] select-none font-display text-[66px] font-extrabold leading-none tracking-[-.07em] text-white/[.075] transition-all duration-500 group-hover:-translate-x-1.5 group-hover:-translate-y-2 group-hover:text-white/[.14] md:-bottom-[30px] md:-right-2 md:text-[104px]"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                <span className="relative flex items-center gap-1.5">
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-[8px] tracking-[.04em] md:text-[9.5px] md:tracking-[.1em]" style={{ color: "var(--cat)" }}>
                    <span aria-hidden className="h-1 w-1 rounded-full md:h-1.5 md:w-1.5" style={{ background: "var(--cat)" }} />
                    {NOTICE_LABELS[notice.category]}
                  </span>
                  <span className="ml-auto hidden font-mono text-[9.5px] text-white/40 md:inline">
                    {shortDate(notice.created_at.slice(0, 10))}
                  </span>
                </span>

                <h3 className="relative mt-0.5 font-display text-[12.5px] font-extrabold leading-[1.3] tracking-[-.04em] text-balance md:mt-1 md:text-[19px] md:tracking-[-.03em]">
                  {notice.title}
                </h3>

                {notice.summary && (
                  <p className="relative hidden text-[11px] font-light leading-relaxed text-white/60 md:line-clamp-3 md:block">
                    {notice.summary}
                  </p>
                )}

                <span className="relative mt-auto flex items-center gap-2">
                  {unreadIds.has(notice.id) && (
                    <span
                      aria-label="안 읽음"
                      className="animate-blip ml-auto h-1.5 w-1.5 rounded-full bg-amber"
                    />
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
