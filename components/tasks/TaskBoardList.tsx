import Link from "next/link";
import { TASK_KIND_LABELS, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/tasks";
import type { TaskBoardItem } from "@/lib/tasks-server";

// 전체 작업현황 목록 (task-board.plan.md ①).
//
// 당사자가 아닌 줄에는 링크를 걸지 않는다. 눌러봐야 상세가 404 로 막히는데, 그러면
// "있는데 못 보는 것"인지 "없는 것"인지 헷갈린다. 대신 「내용 비공개」로 왜 못 여는지 알린다.
//
// 여기 오는 값에는 본문이 없다 — getTaskBoard() 가 select 에서 빼고 읽는다.
// 화면에서 가리는 방식이 아니므로 이 컴포넌트가 실수로 그리려 해도 그릴 것이 없다.

const STATUS_STYLE: Record<TaskStatus, string> = {
  assigned: "border-hair-2 text-ink-2",
  in_progress: "border-meet text-meet",
  submitted: "border-amber text-amber",
  done: "border-done text-done",
};

export default function TaskBoardList({ items }: { items: TaskBoardItem[] }) {
  if (items.length === 0) {
    return (
      <p className="border border-hair bg-l-card px-3 py-6 text-center text-[12px] text-ink-3">
        아직 등록된 업무가 없습니다.
      </p>
    );
  }

  return (
    <ul className="border border-hair bg-l-card">
      {items.map((item) => {
        // 화살표는 언제나 「올린 사람 → 받는 사람」이다.
        //
        // 업무보고는 assigner_id 가 '보고를 받는 사람'이라 지시와 방향이 반대다. 그대로
        // 그리면 보고인데 받는 사람이 앞에 와서 누가 올린 것인지 거꾸로 읽힌다.
        //
        // 「지시」·「보고」 같은 말머리는 붙이지 않는다 — 화살표가 이미 방향을 말하고,
        // 보고는 오른쪽 「업무보고」 배지로 구분된다 (2026-09-11).
        const workers = item.assigneeNames.join(", ");
        const from = item.kind === "report" ? workers || "작성자 없음" : item.assignerName;
        const to = item.kind === "report" ? item.assignerName : workers || "담당자 없음";

        const inner = (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={`shrink-0 border px-1.5 py-px text-[9.5px] ${STATUS_STYLE[item.status]}`}
              >
                {TASK_STATUS_LABELS[item.status]}
              </span>
              {item.kind === "report" && (
                <span className="shrink-0 border border-hair-2 px-1.5 py-px text-[9.5px] text-ink-2">
                  {TASK_KIND_LABELS.report}
                </span>
              )}

              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {item.title}
              </span>

              {item.progress !== null && (
                <span className="shrink-0 font-mono text-[10.5px] text-ink-2">{item.progress}%</span>
              )}
              {item.dueOn && (
                <span className="shrink-0 font-mono text-[10.5px] text-ink-3">마감 {item.dueOn}</span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-ink-2">
              <span className="truncate">{from}</span>
              <span className="text-ink-3">→</span>
              <span className="truncate">{to}</span>
              {!item.mine && <span className="text-ink-3">· 내용 비공개</span>}
            </div>
          </>
        );

        return (
          <li key={item.id} className="border-b border-hair last:border-b-0">
            {item.mine ? (
              <Link href={`/tasks/${item.id}`} className="block px-3 py-2.5 hover:bg-l-cal">
                {inner}
              </Link>
            ) : (
              <div className="px-3 py-2.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
