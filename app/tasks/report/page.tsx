import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getArchiveNodes, getColleagues, getTaskInbox } from "@/lib/tasks-server";
import NewTaskForm from "@/components/tasks/NewTaskForm";
import TaskTabs from "@/components/tasks/TaskTabs";

// 업무 보고 작성 화면 (PRD ⑨)
//
// 지시를 받지 않은 일도 먼저 보고로 올린다. 올리는 순간 「결재대기」로 시작해서,
// 받는 사람이 완료 확인·이어서 지시·반려 중 하나를 고른다.
//
// 지시와 같은 폼을 쓰되 kind 만 다르다 — 받는 사람을 한 명만 고르고, 마감일은 묻지
// 않는다 (이미 한 일을 올리는 것이라 마감이 없다).
export default async function ReportTaskPage() {
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

        <TaskTabs active="report" mineBadge={unacked} />

        <section className="pt-3">
          <h2 className="text-[13px] font-medium text-ink">업무 보고</h2>
          <p className="mt-0.5 pb-2.5 text-[11px] text-ink-3">
            한 일을 보고로 올립니다. 받는 사람이 확인하면 결재되고, 이어서 할 일이 있으면 그
            자리에서 다음 지시가 붙습니다.
          </p>
          <NewTaskForm
            colleagues={colleagues}
            archiveNodes={archiveNodes}
            currentEmployeeId={session.employeeId}
            kind="report"
          />
        </section>
      </div>
    </main>
  );
}
