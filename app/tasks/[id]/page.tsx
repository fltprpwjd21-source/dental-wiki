import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/uuid";
import { getSourceSubtree, getTaskDetail, markRejectionSeen } from "@/lib/tasks-server";
import TaskThread from "@/components/tasks/TaskThread";
import SourceTree from "@/components/tasks/SourceTree";
import { TASK_RETURN_LABELS, TASK_STATUS_LABELS } from "@/lib/tasks";
import MarkdownView from "@/components/notes/MarkdownView";

// 업무지시 상세.
//
// 볼 수 없는 사람에게는 404 다 — 있는데 권한이 없다는 사실도 알려주지 않는다.
// (getTaskDetail 이 열람 권한까지 판단하고 null 을 돌려준다)
export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const detail = await getTaskDetail(id, session.employeeId);
  if (!detail) notFound();

  const { card, source, attachments, updates, can } = detail;

  // 지시를 여는 것만으로 되돌아옴 배지를 지운다 — 따로 누르는 「확인했음」 버튼은 두지
  // 않는다 (공지의 읽음 처리와 같은 판단이다). 반려든 이어서 지시든 마찬가지다.
  if (card.returned) await markRejectionSeen(id, session.employeeId);

  // 연결한 자료가 살아 있으면 그 가지를 곁에 띄운다 — 지시를 받은 사람이 보관함을
  // 따로 찾아 나가지 않아도 되게 한다 (2026-09-10). 좁은 화면에서는 아래로 접힌다.
  const subtree = source?.exists ? await getSourceSubtree(source.id) : null;

  return (
    <main className="flex-1 bg-l-body">
      <div className={`mx-auto px-4 py-5 ${subtree ? "max-w-6xl" : "max-w-3xl"}`}>
        <Link href="/tasks" className="text-[11px] text-ink-3 underline hover:text-ink-2">
          ← 업무지시
        </Link>

        {/* 연결한 자료가 있으면 지시와 트리를 나란히 둔다. 좁은 화면에서는 한 줄로
            접혀 트리가 지시 아래로 내려간다 — 휴대폰에서 옆에 두면 둘 다 못 읽는다. */}
        <div
          className={
            subtree ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start" : ""
          }
        >
          <div className="min-w-0">

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="border border-hair-2 px-1.5 py-px text-[10px] text-ink-2">
            {TASK_STATUS_LABELS[card.status]}
          </span>
          {card.returned && (
            <span
              className={`border px-1.5 py-px text-[10px] ${
                card.returned === "reject" ? "border-late text-late" : "border-amber text-amber"
              }`}
            >
              {TASK_RETURN_LABELS[card.returned]}
            </span>
          )}
          {card.dueOn && (
            <span className="font-mono text-[10.5px] text-ink-3">마감 {card.dueOn}</span>
          )}
        </div>

        <h1 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-ink text-balance">
          {card.title}
        </h1>

        {/* 올린 쪽과 담당자. 지시와 보고는 이 둘이 서로 뒤집히므로 서버가 정리해 준
            ownerName·handlerNames 를 쓴다 (2026-09-11). */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="border border-hair bg-l-cal px-2.5 py-0.5 text-[10.5px] text-ink-2">
            {card.kind === "report" ? "보고" : "지시"} {card.ownerName}
          </span>
          {card.kind === "instruction" && (
            <span className="border border-hair bg-l-cal px-2.5 py-0.5 text-[10.5px] text-ink-2">
              확인 {card.ack.acked}/{card.ack.total}
            </span>
          )}
          {card.status === "submitted" && card.submittedByName && (
            <span className="border border-amber px-2.5 py-0.5 text-[10.5px] text-amber">
              {card.submittedByName} 완료 보고
            </span>
          )}
        </div>

        {/* 담당자 — 지시는 누가 확인했고 누가 아직인지까지, 보고는 받는 사람 한 명이다
            (보고에는 「확인」 체크가 없다 — 받는 사람이 곧 결재하는 사람이라 따로 누를 것이 없다). */}
        <section className="mt-4">
          <h2 className="mb-1.5 text-[11px] font-medium text-ink-2">담당자</h2>
          <ul className="flex flex-wrap gap-1.5">
            {card.kind === "report"
              ? card.handlerNames.map((name) => (
                  <li
                    key={name}
                    className="border border-hair bg-l-card px-2.5 py-0.5 text-[11.5px] text-ink"
                  >
                    {name}
                  </li>
                ))
              : card.assignees.map((a) => (
                  <li
                    key={a.employeeId}
                    className={`border px-2.5 py-0.5 text-[11.5px] ${
                      a.ackedAt
                        ? "border-hair bg-l-card text-ink"
                        : "border-hair-2 border-dashed bg-l-card text-ink-3"
                    }`}
                  >
                    {a.name}
                    <span className="ml-1.5 text-[9.5px]">{a.ackedAt ? "확인함" : "미확인"}</span>
                  </li>
                ))}
          </ul>
        </section>

        {card.progress !== null && (
          <section className="mt-4">
            <h2 className="mb-1.5 text-[11px] font-medium text-ink-2">진행률</h2>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 bg-l-doc">
                <div className="h-full bg-meet-d" style={{ width: `${card.progress}%` }} />
              </div>
              <span className="font-mono text-[11px] tabular-nums text-ink-2">{card.progress}%</span>
            </div>
          </section>
        )}

        <section className="mt-4">
          <h2 className="mb-1.5 text-[11px] font-medium text-ink-2">내용</h2>
          <div className="border border-hair bg-l-card px-3.5 py-3">
            {card.body.trim() ? (
              <MarkdownView content={card.body} />
            ) : (
              <p className="text-[12px] text-ink-3">내용 없이 제목만 있는 지시입니다.</p>
            )}
          </div>
        </section>

        {source && !subtree && (
          <section className="mt-4">
            <h2 className="mb-1.5 text-[11px] font-medium text-ink-2">연결된 보관함 자료</h2>
            {source.exists ? (
              <Link
                href={`/notes?node=${source.id}`}
                className="flex items-center gap-2 border border-hair bg-l-card px-3 py-2 text-[12.5px] hover:bg-l-cal"
              >
                <span className="text-[10px] text-ink-3">{source.kind === "folder" ? "폴더" : "노트"}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{source.name}</span>
                <span aria-hidden className="text-ink-3">
                  →
                </span>
              </Link>
            ) : (
              // 외래키를 걸지 않아 원본이 사라질 수 있다 (마이그레이션 주석 참고).
              <p className="border border-hair bg-l-card px-3 py-2 text-[12px] text-ink-3">
                연결했던 자료가 삭제되었습니다.
              </p>
            )}
          </section>
        )}

        {attachments.length > 0 && (
          <section className="mt-4">
            <h2 className="mb-1.5 text-[11px] font-medium text-ink-2">첨부파일 {attachments.length}</h2>
            <ul className="border border-hair bg-l-card">
              {attachments.map((file) => (
                <li key={file.id} className="border-b border-hair last:border-b-0">
                  {/* 비공개 버킷이라 서명 URL 없이 우리 라우트를 거쳐 연다.
                      브라우저가 못 그리는 형식(pptx)은 서버가 내려받기로 돌린다. */}
                  <a
                    href={`/api/tasks/attachments/${file.id}/content`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-[12.5px] hover:bg-l-cal"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-3">
                      {(file.sizeBytes / 1024 / 1024).toFixed(1)}MB
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-3">{file.uploadedByName}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <TaskThread
          taskId={card.id}
          employeeId={session.employeeId}
          isLongterm={card.isLongterm}
          progress={card.progress ?? 0}
          updates={updates}
          can={can}
        />
          </div>

          {subtree && source && (
            <aside className="min-w-0 lg:sticky lg:top-4">
              <SourceTree nodes={subtree.nodes} rootId={subtree.rootId} sourceId={source.id} />
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
