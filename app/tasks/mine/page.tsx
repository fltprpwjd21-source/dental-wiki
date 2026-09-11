import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTaskInbox } from "@/lib/tasks-server";
import TaskCardList from "@/components/tasks/TaskCardList";
import TaskTabs from "@/components/tasks/TaskTabs";

// 내 업무 (PRD ⑨)
//
// 받은 것과 요청한 것을 한 화면에 나란히 둔다 (2026-09-11). 전에는 탭 두 개로 갈라
// 뒀는데, 둘 다 "내 차례인가"를 묻는 같은 질문이라 오가며 봐야 했다.
//
// 넓은 화면에서는 왼쪽이 받은 업무, 오른쪽이 요청한 업무다 — 먼저 봐야 하는 것이
// 내가 해야 할 일이라 읽는 순서대로 왼쪽에 둔다.
//
// 좁은 화면(휴대폰)에서는 위아래로 쌓는다. 두 목록을 반씩 나누면 제목 한 줄이
// 서너 글자에서 잘려 무슨 업무인지 알 수 없게 된다 — 카드 안에 상태 배지·사람 이름·
// 마감일이 한 줄에 들어가야 해서 폭이 필요하다.
export default async function MyTasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const inbox = await getTaskInbox(session.employeeId);

  const unacked = inbox.received.filter((t) => t.myAckedAt === null).length;
  const waitingApproval = inbox.given.filter((t) => t.status === "submitted").length;

  return (
    <main className="flex-1 bg-l-body">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex flex-wrap items-center gap-2.5 pb-3">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">업무</h1>
          <span className="font-mono text-[10.5px] text-ink-3">
            받은 {inbox.received.length} · 요청 {inbox.given.length}
          </span>
          {unacked > 0 && (
            <span className="border border-amber px-1.5 py-px text-[9.5px] text-amber">
              미확인 {unacked}
            </span>
          )}
        </div>

        {waitingApproval > 0 && (
          <p className="mb-3 border border-amber bg-l-cal px-3 py-2 text-[11.5px] text-ink">
            완료 보고 <span className="font-medium text-amber">{waitingApproval}건</span>이 결재를
            기다립니다.
          </p>
        )}

        <TaskTabs active="mine" mineBadge={unacked} />

        {/* 넓으면 좌우, 좁으면 위아래. items-start 로 두 칸의 높이를 따로 둔다 —
            한쪽이 길다고 반대쪽 빈 칸이 같이 늘어나면 아래가 허전해 보인다. */}
        <div className="grid gap-5 pt-3 lg:grid-cols-2 lg:items-start">
          <section className="min-w-0">
            <h2 className="mb-1.5 text-[11.5px] font-medium text-ink-2">내가 받은 업무</h2>
            <TaskCardList
              tasks={inbox.received}
              side="received"
              emptyText="받은 업무가 없습니다."
            />
          </section>

          <section className="min-w-0">
            <h2 className="mb-1.5 text-[11.5px] font-medium text-ink-2">내가 요청한 업무</h2>
            <TaskCardList
              tasks={inbox.given}
              side="given"
              emptyText="아직 요청한 업무가 없습니다."
            />
          </section>
        </div>
      </div>
    </main>
  );
}
