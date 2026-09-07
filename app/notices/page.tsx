import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { NOTICE_DOT_DARK, NOTICE_LABELS, todayIso, type Notice } from "@/lib/notices";
import NoticeRowActions from "@/components/notices/NoticeRowActions";

// 공지 탭 — 목록이 쭉 나오고, 오른쪽 위에 「공지 작성」.
// 게시 기간이 끝난 공지는 지우지 않고 흐리게 남긴다 ("9월에 뭐라고 공지했었지"를 찾아야 한다).
export default async function NoticesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = getServerSupabaseClient();
  const { data } = await supabase
    .from("notices")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const notices = (data ?? []) as Notice[];
  const today = todayIso();

  return (
    <main className="flex-1 bg-l-card">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex items-center gap-2.5 pb-3">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">공지</h1>
          <span className="font-mono text-[10.5px] text-ink-3">전체 {notices.length}</span>
          <Link
            href="/notices/new"
            className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap bg-navy px-4 py-2 text-[11.5px] font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-9px_rgba(12,28,64,.65)]"
          >
            <span aria-hidden className="text-[13px] leading-none">+</span> 공지 작성
          </Link>
        </div>

        {notices.length === 0 ? (
          <p className="border-t border-hair-2 py-6 text-sm text-ink-2">
            아직 올라온 공지가 없습니다. 오른쪽 위에서 첫 공지를 올려보세요.
          </p>
        ) : (
          <ul className="border-t border-hair-2">
            {notices.map((notice, i) => {
              const past = notice.ends_on < today;
              const mine = notice.author_id === session.employeeId;
              return (
                <li
                  key={notice.id}
                  className={`grid grid-cols-[26px_1fr_auto] items-baseline gap-x-3.5 gap-y-1 border-b border-hair py-3 transition-colors hover:bg-l-cal sm:grid-cols-[26px_84px_1fr_auto] ${past ? "opacity-50" : ""}`}
                >
                  <span className="font-mono text-[11px] text-[#b7c1d1]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="col-start-2 col-end-4 flex items-center gap-1.5 whitespace-nowrap text-[10px] sm:col-end-3"
                    style={{ color: NOTICE_DOT_DARK[notice.category] }}
                  >
                    <span
                      aria-hidden
                      className="h-1 w-1 rounded-full"
                      style={{ background: NOTICE_DOT_DARK[notice.category] }}
                    />
                    {NOTICE_LABELS[notice.category]}
                  </span>
                  <span className="col-start-2 sm:col-start-3">
                    <Link href={`/notices/${notice.id}`} className="text-[13.5px] leading-snug text-ink hover:underline">
                      {notice.title}
                    </Link>
                    {past && (
                      <span className="ml-2 border border-hair-2 px-1.5 py-px align-[1px] text-[9.5px] text-ink-3">
                        게시 종료
                      </span>
                    )}
                    <span className="mt-0.5 block font-mono text-[10.5px] text-ink-3">
                      {notice.author_name ?? notice.author_id} · {notice.created_at.slice(5, 10)}
                    </span>
                  </span>
                  <span className="col-start-3 justify-self-end sm:col-start-4">
                    {(mine || session.isAdmin) && <NoticeRowActions id={notice.id} />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-5 border-l-2 border-navy bg-l-cal px-3.5 py-3 text-[11px] leading-relaxed text-ink-2">
          공지는 <b className="font-medium text-ink">로그인한 누구나</b> 올릴 수 있고,
          고치고 지우는 건 <b className="font-medium text-ink">쓴 사람과 관리자</b>만 할 수 있습니다.
          게시 기간이 끝난 공지는 홈에서 내려가고 이 목록에만 남습니다.
        </p>
      </div>
    </main>
  );
}
