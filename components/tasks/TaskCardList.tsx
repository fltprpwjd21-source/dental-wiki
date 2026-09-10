import Link from "next/link";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/tasks";
import type { TaskCard } from "@/lib/tasks-server";

// 상태 뱃지 색. 병원 색(파랑) 안에서 고르되 「완료 확인 대기」만 주황으로 뺀다 —
// 그것 하나가 지시자가 지금 눌러야 할 것이기 때문이다.
const STATUS_STYLE: Record<TaskStatus, string> = {
  assigned: "border-hair-2 text-ink-3",
  in_progress: "border-meet text-meet-d",
  submitted: "border-amber text-amber",
  done: "border-hair text-done",
};

// 남은 날짜. 지난 것은 빨강, 사흘 안쪽은 주황.
function dueLabel(dueOn: string): { text: string; tone: string } {
  const due = new Date(`${dueOn}T00:00:00`);
  const days = Math.round((due.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  return {
    text: days < 0 ? `${-days}일 지남` : days === 0 ? "오늘" : `D-${days}`,
    tone: days < 0 ? "text-late" : days <= 3 ? "text-soon" : "text-ink-3",
  };
}

// 본문 첫 줄만 뽑아 한 줄 미리보기로 쓴다. 받은 쪽은 제목만으로는 무슨 일인지
// 감이 안 오는 경우가 많아서, 목록에서 이미 한 줄이 보이는 편이 낫다.
function preview(body: string, limit = 70): string {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return "";
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
}

function Card({ task, side }: { task: TaskCard; side: "given" | "received" }) {
  const due = task.dueOn ? dueLabel(task.dueOn) : null;
  const summary = preview(task.body);

  // 받은 쪽에서 아직 확인을 안 눌렀으면 눈에 띄게 한다 — 그게 이 사람이 할 첫 동작이다.
  const needsAck = side === "received" && task.myAckedAt === null;

  return (
    <li className={needsAck ? "border-l-2 border-l-amber" : "border-l-2 border-l-transparent"}>
      <Link
        href={`/tasks/${task.id}`}
        className="block border-b border-hair px-3 py-2.5 hover:bg-l-cal"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`shrink-0 border px-1.5 py-px text-[9.5px] ${STATUS_STYLE[task.status]}`}>
            {TASK_STATUS_LABELS[task.status]}
          </span>

          {needsAck && (
            <span className="shrink-0 border border-amber bg-amber px-1.5 py-px text-[9.5px] text-white">
              미확인
            </span>
          )}
          {task.rejected && (
            <span className="shrink-0 border border-late px-1.5 py-px text-[9.5px] text-late">반려됨</span>
          )}

          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{task.title}</span>

          {due && <span className={`shrink-0 font-mono text-[10.5px] ${due.tone}`}>{due.text}</span>}
        </div>

        {summary && (
          <p className="mt-1 truncate text-[11.5px] leading-relaxed text-ink-2">{summary}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-ink-2">
          {side === "given" ? (
            <>
              <span className="truncate">{task.assignees.map((a) => a.name).join(", ")}</span>
              <span className="text-ink-3">
                확인 {task.ack.acked}/{task.ack.total}
              </span>
            </>
          ) : (
            <>
              <span>
                지시 <span className="text-ink">{task.assignerName}</span>
              </span>
              {task.assignees.length > 1 && (
                <span className="text-ink-3">함께 {task.assignees.length}명</span>
              )}
            </>
          )}

          {task.attachmentCount > 0 && (
            <span className="text-ink-3">첨부 {task.attachmentCount}</span>
          )}

          {task.status === "submitted" && task.submittedByName && (
            <span className="text-amber">{task.submittedByName} 완료 보고</span>
          )}
        </div>

        {/* 진행률은 장기 업무에만 있다 (서버가 null 로 내려주면 안 그린다) */}
        {task.progress !== null && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 bg-l-doc">
              <div className="h-full bg-meet-d" style={{ width: `${task.progress}%` }} />
            </div>
            <span className="font-mono text-[10px] tabular-nums text-ink-3">{task.progress}%</span>
          </div>
        )}
      </Link>
    </li>
  );
}

export default function TaskCardList({
  tasks,
  side,
  emptyText,
}: {
  tasks: TaskCard[];
  side: "given" | "received";
  emptyText: string;
}) {
  // 완료된 지시는 접어둔 자리로 내린다 — 목록 맨 위는 지금 손봐야 할 것의 자리다.
  const live = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="border border-hair bg-l-card">
      {live.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11.5px] text-ink-3">{emptyText}</p>
      ) : (
        <ul>
          {live.map((task) => (
            <Card key={task.id} task={task} side={side} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="border-t border-hair">
          <summary className="cursor-pointer px-3 py-2 text-[11px] text-ink-3 hover:text-ink-2">
            완료된 업무 {done.length}건
          </summary>
          <ul className="border-t border-hair">
            {done.map((task) => (
              <Card key={task.id} task={task} side={side} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
