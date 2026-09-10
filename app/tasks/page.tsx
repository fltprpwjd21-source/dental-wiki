import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getArchiveNodes, getColleagues, getTaskInbox } from "@/lib/tasks-server";
import NewTaskForm from "@/components/tasks/NewTaskForm";
import TaskCardList from "@/components/tasks/TaskCardList";

// 업무지시 탭 (PRD ⑨)
//
// 위가 「내가 해야 할 업무」다 (2026-09-10 변경). 처음에는 내가 낸 것을 위에 뒀는데,
// 화면을 열었을 때 먼저 봐야 하는 것은 남을 시킨 일이 아니라 내가 해야 할 일이다.
// 내가 낸 것은 그 아래에서 진행 상황만 훑으면 된다.
//
// 작성창은 머리글 줄이 아니라 그 아래 한 칸을 통째로 쓴다 — 안에 보관함 트리가
// 들어가므로 머리글 오른쪽에 끼워 넣으면 좁아서 못 쓴다.
//
// 직원 목록과 보관함 트리는 여기서 서버가 직접 읽어 내려준다 — 설정 화면이
// 화이트리스트를 읽는 방식과 같다. 담당자와 자료를 고르려면 필요하므로 별도 API 를
// 두지 않았다.
export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [inbox, colleagues, archiveNodes] = await Promise.all([
    getTaskInbox(session.employeeId),
    getColleagues(),
    getArchiveNodes(),
  ]);

  const unacked = inbox.received.filter((t) => t.myAckedAt === null).length;
  const waitingApproval = inbox.given.filter((t) => t.status === "submitted").length;

  return (
    <main className="flex-1 bg-l-body">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex flex-wrap items-center gap-2.5 pb-3">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">업무지시</h1>
          <span className="font-mono text-[10.5px] text-ink-3">
            받은 {inbox.received.length} · 내린 {inbox.given.length}
          </span>
          {unacked > 0 && (
            <span className="border border-amber px-1.5 py-px text-[9.5px] text-amber">
              미확인 {unacked}
            </span>
          )}
        </div>

        {/* 완료 확인을 기다리는 것은 띠로 한 번 더 알린다 — 지시자가 누르기 전까지
            사라지지 않으며, 그 카드들은 목록에서도 이미 맨 위에 온다. */}
        {waitingApproval > 0 && (
          <p className="mb-3 border border-amber bg-l-cal px-3 py-2 text-[11.5px] text-ink">
            완료 보고 <span className="font-medium text-amber">{waitingApproval}건</span>이 확인을
            기다립니다.
          </p>
        )}

        <div className="pb-5">
          <NewTaskForm
            colleagues={colleagues}
            archiveNodes={archiveNodes}
            currentEmployeeId={session.employeeId}
          />
        </div>

        <section className="pb-5">
          <h2 className="mb-1.5 text-[11.5px] font-medium text-ink-2">내가 해야 할 업무</h2>
          <TaskCardList tasks={inbox.received} side="received" emptyText="받은 업무가 없습니다." />
        </section>

        <section>
          <h2 className="mb-1.5 text-[11.5px] font-medium text-ink-2">내가 내린 업무</h2>
          <TaskCardList tasks={inbox.given} side="given" emptyText="아직 내린 업무가 없습니다." />
        </section>
      </div>
    </main>
  );
}
