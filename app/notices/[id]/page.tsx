import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { NOTICE_DOT_DARK, NOTICE_LABELS, type Notice } from "@/lib/notices";
import { isUuid } from "@/lib/uuid";
import MarkdownView from "@/components/notes/MarkdownView";
import NoticeRowActions from "@/components/notices/NoticeRowActions";
import NoticeAck from "@/components/notices/NoticeAck";
import { markNoticeRead } from "@/lib/notices-server";

// 공지 상세 — 카드를 누르면 그냥 공지가 열린다.
//
// 슬라이드로 나누지 않는다. 공지를 여는 사람은 넘기고 싶은 게 아니라 내용을 바로
// 보고 싶어 한다. 카드는 홈에서 '들어가는 문' 역할만 한다.
export default async function NoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = getServerSupabaseClient();
  const { data } = await supabase
    .from("notices")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) notFound();
  const notice = data as Notice;

  // 연결한 원본은 복사하지 않고 그때그때 읽는다 — 노트를 고치면 공지에서도 최신 내용이 보인다.
  let linked: { title: string; content: string; href: string } | null = null;
  if (notice.source_note_id) {
    const { data: note } = await supabase
      .from("nodes")
      .select("name, content, status")
      .eq("id", notice.source_note_id)
      .maybeSingle();
    if (note && note.status === "active") {
      linked = { title: note.name, content: note.content ?? "", href: `/notes?node=${notice.source_note_id}` };
    }
  } else if (notice.source_document_id) {
    const { data: doc } = await supabase
      .from("documents")
      .select("title, content")
      .eq("id", notice.source_document_id)
      .maybeSingle();
    if (doc) {
      linked = { title: doc.title, content: doc.content ?? "", href: `/documents/${notice.source_document_id}` };
    }
  }

  // 열어본 것만으로 읽음으로 친다. 확인 버튼은 needs_ack 를 켠 공지에만 따로 붙는다.
  await markNoticeRead(notice.id, session.employeeId);

  const canEdit = notice.author_id === session.employeeId || session.isAdmin;

  // 읽은 사람 수 / 전체 인원. 방금 이 요청에서 남긴 내 기록도 포함된다.
  //
  // 관리 계정(00001)은 양쪽에서 뺀다.
  //   실제로 진료를 보는 사람이 아니라 화이트리스트를 관리하려고 있는 계정이라,
  //   분모에 넣으면 "14명 중 11명"처럼 영원히 채워지지 않는 수가 되고,
  //   관리자가 공지를 열어보면 분자까지 부풀어 누가 안 읽었는지 흐려진다.
  const { data: admins } = await supabase
    .from("employee_whitelist")
    .select("employee_id")
    .eq("is_admin", true);
  const adminIds = (admins ?? []).map((a) => a.employee_id as string);
  // in 필터는 빈 목록을 받으면 문법 오류가 나므로, 없을 때 쓸 자리표시자를 둔다.
  const adminFilter = `(${(adminIds.length > 0 ? adminIds : ["__none__"]).join(",")})`;

  const [{ count: readCount }, { count: staffCount }] = await Promise.all([
    supabase
      .from("notice_reads")
      .select("employee_id", { count: "exact", head: true })
      .eq("notice_id", notice.id)
      .not("employee_id", "in", adminFilter),
    supabase
      .from("employee_whitelist")
      .select("employee_id", { count: "exact", head: true })
      .eq("is_admin", false),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <div className="bg-l-card">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2.5 px-4 pb-3 pt-4 text-[11.5px] text-ink-2">
          <Link href="/notices" className="text-meet-d hover:underline">
            ← 공지
          </Link>
          <span
            className="flex items-center gap-1.5 text-[10px] font-bold tracking-[.1em]"
            style={{ color: NOTICE_DOT_DARK[notice.category] }}
          >
            <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: NOTICE_DOT_DARK[notice.category] }} />
            {NOTICE_LABELS[notice.category]}
          </span>
          {canEdit && (
            <span className="ml-auto">
              <NoticeRowActions id={notice.id} />
            </span>
          )}
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-5">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink text-balance md:text-3xl">
            {notice.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="border border-hair bg-l-cal px-2.5 py-0.5 text-[10.5px] text-ink-2">
              {notice.author_name ?? notice.author_id}
            </span>
            <span className="border border-hair bg-l-cal px-2.5 py-0.5 text-[10.5px] text-ink-2">
              게시 {notice.starts_on.slice(5)} ~ {notice.ends_on.slice(5)}
            </span>
            {notice.event_on && (
              <span className="border border-hair bg-l-cal px-2.5 py-0.5 text-[10.5px] text-ink-2">
                일정 {notice.event_on.slice(5)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 border-t border-hair bg-l-body">
        <div className="mx-auto max-w-3xl px-4 py-5">
          {notice.body && (
            <div className="prose-notice text-[13px] leading-[1.95] text-[#2c3648]">
              <MarkdownView content={notice.body} />
            </div>
          )}

          {linked && (
            <section className={notice.body ? "mt-6" : ""}>
              <div className="mb-2 flex items-baseline gap-2.5 border-b border-hair pb-1.5">
                <h2 className="font-display text-sm font-bold text-ink">{linked.title}</h2>
                <Link href={linked.href} className="ml-auto text-[11px] text-meet-d hover:underline">
                  원본 열기 →
                </Link>
              </div>
              {/* 복사본이 아니라 연결이다 — 원본을 고치면 여기도 같이 바뀐다 */}
              <div className="text-[13px] leading-[1.95] text-[#2c3648]">
                <MarkdownView content={linked.content} />
              </div>
            </section>
          )}

          {!notice.body && !linked && (
            <p className="text-sm text-ink-2">본문이 없는 공지입니다.</p>
          )}
        </div>
      </div>

      {notice.needs_ack && (
        <NoticeAck readCount={readCount ?? 0} staffCount={staffCount ?? 0} />
      )}
    </main>
  );
}
