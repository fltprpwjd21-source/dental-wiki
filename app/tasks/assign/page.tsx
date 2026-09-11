import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getArchiveNodes, getColleagues, getTaskInbox } from "@/lib/tasks-server";
import NewTaskForm from "@/components/tasks/NewTaskForm";
import TaskTabs from "@/components/tasks/TaskTabs";

// 업무 지시 작성 화면 (PRD ⑨)
//
// 쓰는 화면을 목록에서 떼어 낸 탭이다 (2026-09-11). 전에는 작성창이 목록 위에 얹혀
// 있어서, 쓰는 동안 아래로 한줄 요약과 내 업무가 계속 딸려 나왔다 — 쓰는 데 도움이
// 되지 않으면서 화면만 길어졌다.
//
// 등록하고 나면 폼이 「내 업무」로 보낸다. 여기 남아 있을 이유가 없다.
export default async function AssignTaskPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [inbox, colleagues, archiveNodes] = await Promise.all([
    getTaskInbox(session.employeeId),
    getColleagues(),
    getArchiveNodes(),
  ]);

  const unacked = inbox.received.filter((t) => t.myAckedAt === null).length;

  return (
    <main className="flex-1 bg-l-body">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <h1 className="pb-3 font-display text-xl font-bold tracking-tight text-ink">업무</h1>

        <TaskTabs active="assign" mineBadge={unacked} />

        <section className="pt-3">
          <h2 className="text-[13px] font-medium text-ink">업무 지시</h2>
          <p className="mt-0.5 pb-2.5 text-[11px] text-ink-3">
            다른 스탭에게 업무를 맡깁니다. 담당자는 여러 명 고를 수 있고, 고른 사람들이 같은
            업무 하나를 함께 봅니다.
          </p>
          <NewTaskForm
            colleagues={colleagues}
            archiveNodes={archiveNodes}
            currentEmployeeId={session.employeeId}
            kind="instruction"
          />
        </section>
      </div>
    </main>
  );
}
