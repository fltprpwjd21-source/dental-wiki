import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTaskBoard, getTaskInbox } from "@/lib/tasks-server";
import TaskBoardList from "@/components/tasks/TaskBoardList";
import TaskTabs from "@/components/tasks/TaskTabs";

// 업무 탭 첫 화면 — 한줄 업무 요약 (PRD ⑨)
//
// 전 스탭의 진행상황을 한 줄씩 훑는 곳이다. 「내 업무」가 "내 차례인가"를 묻는다면
// 여기는 "지금 무엇이 돌고 있나"를 묻는다 — 내 것은 배지 숫자로 알고 들어오지만
// 남들이 뭘 하는지는 여기 말고 알 데가 없어서 이쪽을 첫 화면으로 둔다.
//
// 본문은 내려오지 않는다. getTaskBoard() 가 select 에서 빼고 읽는다 — 화면에서
// 가리는 방식이 아니라 읽지 않는 방식이다.
//
// 받은함도 함께 읽는다 — 탭 줄의 배지와 결재 대기 띠가 거기서 나온다.
export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [board, inbox] = await Promise.all([
    getTaskBoard(session.employeeId),
    getTaskInbox(session.employeeId),
  ]);

  const unacked = inbox.received.filter((t) => t.myAckedAt === null).length;
  const waitingApproval = inbox.given.filter((t) => t.status === "submitted").length;
  const running = board.filter((t) => t.status !== "done").length;

  return (
    <main className="flex-1 bg-l-body">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex flex-wrap items-center gap-2.5 pb-3">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">업무</h1>
          <span className="font-mono text-[10.5px] text-ink-3">진행 중 {running}건</span>
        </div>

        {/* 결재를 기다리는 것은 띠로 한 번 더 알린다 — 내가 누르기 전까지 사라지지 않는다. */}
        {waitingApproval > 0 && (
          <p className="mb-3 border border-amber bg-l-cal px-3 py-2 text-[11.5px] text-ink">
            완료 보고 <span className="font-medium text-amber">{waitingApproval}건</span>이 결재를
            기다립니다.
          </p>
        )}

        <TaskTabs active="summary" mineBadge={unacked} />

        <section className="pt-3">
          <p className="pb-2 text-[11px] text-ink-3">
            전 스탭이 진행상황을 함께 봅니다. 내용과 대화는 그 업무의 당사자에게만 열립니다.
          </p>
          <TaskBoardList items={board} />
        </section>
      </div>
    </main>
  );
}
