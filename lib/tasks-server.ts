import { cache } from "react";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { fetchEmployeeNames } from "@/lib/employee-names-server";
import { displayName } from "@/lib/employee-names";
import type { FlatNode } from "@/lib/notes/tree";
import {
  ackSummary,
  canAck,
  canAddUpdate,
  canApprove,
  canReject,
  canSubmit,
  canView,
  compareTasks,
  shouldShowRejectionBadge,
  visibleProgress,
  type Task,
  type TaskAssignee,
} from "@/lib/tasks";

// 업무지시를 화면에 필요한 모양으로 읽어온다 (PLAN 8차 36번).
// 순수 규칙은 lib/tasks.ts 에 있다 — 공지의 notices / notices-server 와 같은 구성이다.

/** 카드 한 장에 필요한 것들. 화면이 다시 계산하지 않아도 되게 여기서 다 붙여 보낸다. */
export type TaskCard = {
  id: string;
  title: string;
  body: string;
  status: Task["status"];
  isLongterm: boolean;
  /** 장기 업무가 아니면 null — 화면은 이 값이 null 이면 진행률 막대를 그리지 않는다. */
  progress: number | null;
  dueOn: string | null;
  assignerId: string;
  assignerName: string;
  assignees: { employeeId: string; name: string; ackedAt: string | null }[];
  ack: { acked: number; total: number };
  submittedByName: string | null;
  /** 내가 올린 완료 보고가 반려됐고 아직 안 봤다 */
  rejected: boolean;
  /** 나는 이 지시를 확인했는가. 담당자가 아니면 null */
  myAckedAt: string | null | undefined;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskInbox = {
  /** 내가 내린 업무 */
  given: TaskCard[];
  /** 내가 해야 할 업무 */
  received: TaskCard[];
};

type TaskRow = Task;
type AssigneeRow = TaskAssignee;

// 목록 두 덩어리를 한 번에 읽는다.
//
// 조회에 실패해도 빈 목록을 돌려준다 — 업무지시가 안 보이는 것보다 화면 전체가 500 이
// 되는 게 훨씬 나쁘다 (홈의 getHomeData 와 같은 방식).
export async function getTaskInbox(employeeId: string): Promise<TaskInbox> {
  const empty: TaskInbox = { given: [], received: [] };

  try {
    const supabase = getServerSupabaseClient();

    // 내가 담당자인 지시의 id 를 먼저 뽑는다. 그래야 "내가 낸 것" 과 "내가 맡은 것" 을
    // or 하나로 묶어 한 번에 읽을 수 있다.
    const { data: mine } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("employee_id", employeeId);

    const myTaskIds = (mine ?? []).map((r) => r.task_id as string);

    let query = supabase.from("tasks").select("*").is("deleted_at", null);
    query =
      myTaskIds.length > 0
        ? query.or(`assigner_id.eq.${employeeId},id.in.(${myTaskIds.join(",")})`)
        : query.eq("assigner_id", employeeId);

    const { data: taskRows, error } = await query;
    if (error) {
      console.error("[tasks] 목록 조회 실패", error);
      return empty;
    }

    const tasks = (taskRows ?? []) as TaskRow[];
    if (tasks.length === 0) return empty;

    const taskIds = tasks.map((t) => t.id);

    const [assigneeResult, rejectResult, attachmentResult] = await Promise.all([
      supabase.from("task_assignees").select("*").in("task_id", taskIds),
      // 반려 배지는 "마지막 반려를 봤는가" 로 판단하므로 반려 기록의 시각만 있으면 된다.
      supabase
        .from("task_updates")
        .select("task_id, created_at")
        .in("task_id", taskIds)
        .eq("kind", "reject")
        .order("created_at", { ascending: false }),
      supabase.from("task_attachments").select("task_id").in("task_id", taskIds),
    ]);

    const attachmentCountByTask = new Map<string, number>();
    for (const row of attachmentResult.data ?? []) {
      const id = row.task_id as string;
      attachmentCountByTask.set(id, (attachmentCountByTask.get(id) ?? 0) + 1);
    }

    const assigneesByTask = new Map<string, AssigneeRow[]>();
    for (const row of (assigneeResult.data ?? []) as AssigneeRow[]) {
      const list = assigneesByTask.get(row.task_id) ?? [];
      list.push(row);
      assigneesByTask.set(row.task_id, list);
    }

    // 내림차순으로 읽었으므로 각 지시의 첫 줄이 가장 최근 반려다.
    const latestRejectByTask = new Map<string, string>();
    for (const row of rejectResult.data ?? []) {
      const id = row.task_id as string;
      if (!latestRejectByTask.has(id)) latestRejectByTask.set(id, row.created_at as string);
    }

    // 사람 이름은 화이트리스트의 지금 이름을 먼저 쓰고, 없으면 지시에 저장해 둔
    // 당시 이름으로 떨어진다 (lib/employee-names.ts 의 displayName).
    const everyone = new Set<string>();
    for (const t of tasks) {
      everyone.add(t.assigner_id);
      if (t.submitted_by) everyone.add(t.submitted_by);
    }
    for (const list of assigneesByTask.values()) {
      for (const a of list) everyone.add(a.employee_id);
    }
    const nameOf = await fetchEmployeeNames([...everyone]);

    const toCard = (task: TaskRow): TaskCard => {
      const assignees = assigneesByTask.get(task.id) ?? [];
      const me = assignees.find((a) => a.employee_id === employeeId);
      const submittedSnapshot = assignees.find((a) => a.employee_id === task.submitted_by);

      return {
        id: task.id,
        title: task.title,
        body: task.body,
        status: task.status,
        isLongterm: task.is_longterm,
        progress: visibleProgress(task),
        dueOn: task.due_on,
        assignerId: task.assigner_id,
        assignerName: displayName(task.assigner_id, nameOf.get(task.assigner_id), task.assigner_name),
        assignees: assignees.map((a) => ({
          employeeId: a.employee_id,
          name: displayName(a.employee_id, nameOf.get(a.employee_id), a.employee_name),
          ackedAt: a.acked_at,
        })),
        ack: ackSummary(assignees),
        submittedByName: task.submitted_by
          ? displayName(task.submitted_by, nameOf.get(task.submitted_by), submittedSnapshot?.employee_name)
          : null,
        rejected: shouldShowRejectionBadge(task, me, latestRejectByTask.get(task.id) ?? null),
        myAckedAt: me ? me.acked_at : undefined,
        attachmentCount: attachmentCountByTask.get(task.id) ?? 0,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
      };
    };

    const sorted = [...tasks].sort(compareTasks);

    return {
      given: sorted.filter((t) => t.assigner_id === employeeId).map(toCard),
      received: sorted
        .filter((t) => (assigneesByTask.get(t.id) ?? []).some((a) => a.employee_id === employeeId))
        .map(toCard),
    };
  } catch (error) {
    console.error("[tasks] 목록 조회 실패", error);
    return empty;
  }
}

// ── 상세 ────────────────────────────────────────────────────────────────

export type TaskAttachmentView = {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  uploadedByName: string;
  createdAt: string;
};

/** 지시와 함께 가리키는 보관함 항목. 원본이 지워졌으면 exists 가 false 다. */
export type TaskSourceView = {
  id: string;
  name: string;
  kind: "folder" | "note" | "attachment";
  exists: boolean;
};

/** 대화창에 쌓이는 한 줄. */
export type TaskUpdateView = {
  id: string;
  kind: "note" | "submit" | "reject";
  authorId: string;
  authorName: string;
  body: string;
  progress: number | null;
  editedAt: string | null;
  createdAt: string;
  attachments: TaskAttachmentView[];
};

export type TaskDetail = {
  card: TaskCard;
  source: TaskSourceView | null;
  /** 지시문에 바로 붙은 첨부 (진행 기록에 붙은 것은 각 기록 안에 있다) */
  attachments: TaskAttachmentView[];
  updates: TaskUpdateView[];
  /** 이 사람이 지금 이 지시에서 할 수 있는 것 */
  can: {
    ack: boolean;
    addUpdate: boolean;
    submit: boolean;
    approve: boolean;
    reject: boolean;
    /**
     * 작업 기록 칸(글·진행률·첨부)을 열어줄지.
     *
     * 담당자에게만 연다 (2026-09-10). 지시를 낸 사람은 반려할 때 사유를 쓰므로
     * 따로 적는 칸이 필요 없고, 칸이 둘이면 "여기 써야 하나 저기 써야 하나"를
     * 매번 고민하게 된다. 지시자가 굳이 남기고 싶으면 반려 사유가 그 자리다.
     */
    compose: boolean;
  };
};

// 지시 하나를 열어본다. 볼 수 없는 사람에게는 null 을 돌려준다 —
// 화면은 그때 404 로 처리한다(있는데 권한이 없다는 사실도 알려주지 않는다).
export async function getTaskDetail(taskId: string, employeeId: string): Promise<TaskDetail | null> {
  try {
    const supabase = getServerSupabaseClient();

    const [taskResult, assigneeResult] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).is("deleted_at", null).maybeSingle(),
      supabase.from("task_assignees").select("*").eq("task_id", taskId),
    ]);

    const task = taskResult.data as Task | null;
    const assignees = (assigneeResult.data ?? []) as TaskAssignee[];
    if (!task || !canView(task, assignees, employeeId)) return null;

    const [updateResult, attachmentResult, sourceResult] = await Promise.all([
      supabase
        .from("task_updates")
        .select("id, kind, author_id, author_name, body, progress, edited_at, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true }),
      supabase
        .from("task_attachments")
        .select("id, task_id, update_id, name, size_bytes, mime_type, uploaded_by, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true }),
      task.source_node_id
        ? supabase.from("nodes").select("id, name, type, status").eq("id", task.source_node_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const updateRows = updateResult.data ?? [];
    const attachments = attachmentResult.data ?? [];

    // 가장 최근 반려의 시각 — 반려 배지를 띄울지 판단하는 데 쓴다.
    const latestReject =
      [...updateRows].reverse().find((u) => u.kind === "reject")?.created_at ?? null;

    const everyone = new Set<string>([task.assigner_id, ...assignees.map((a) => a.employee_id)]);
    if (task.submitted_by) everyone.add(task.submitted_by);
    for (const a of attachments) everyone.add(a.uploaded_by as string);
    for (const u of updateRows) everyone.add(u.author_id as string);
    const nameOf = await fetchEmployeeNames([...everyone]);

    const toAttachmentView = (a: (typeof attachments)[number]): TaskAttachmentView => ({
      id: a.id as string,
      name: a.name as string,
      sizeBytes: Number(a.size_bytes),
      mimeType: a.mime_type as string,
      uploadedByName: displayName(a.uploaded_by as string, nameOf.get(a.uploaded_by as string)),
      createdAt: a.created_at as string,
    });

    const me = assignees.find((a) => a.employee_id === employeeId);
    const submittedSnapshot = assignees.find((a) => a.employee_id === task.submitted_by);

    const card: TaskCard = {
      id: task.id,
      title: task.title,
      body: task.body,
      status: task.status,
      isLongterm: task.is_longterm,
      progress: visibleProgress(task),
      dueOn: task.due_on,
      assignerId: task.assigner_id,
      assignerName: displayName(task.assigner_id, nameOf.get(task.assigner_id), task.assigner_name),
      assignees: assignees.map((a) => ({
        employeeId: a.employee_id,
        name: displayName(a.employee_id, nameOf.get(a.employee_id), a.employee_name),
        ackedAt: a.acked_at,
      })),
      ack: ackSummary(assignees),
      submittedByName: task.submitted_by
        ? displayName(task.submitted_by, nameOf.get(task.submitted_by), submittedSnapshot?.employee_name)
        : null,
      rejected: shouldShowRejectionBadge(task, me, latestReject),
      myAckedAt: me ? me.acked_at : undefined,
      attachmentCount: attachments.length,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    };

    // 연결한 보관함 항목이 그 사이 휴지통으로 갔거나 지워졌을 수 있다.
    // 외래키를 걸지 않았기 때문인데(마이그레이션 주석 참고), 그때는 「삭제된 자료」로 알린다.
    const sourceRow = sourceResult.data as
      | { id: string; name: string; type: string; status: string }
      | null;
    const source: TaskSourceView | null = task.source_node_id
      ? sourceRow && sourceRow.status === "active"
        ? {
            id: sourceRow.id,
            name: sourceRow.name,
            kind: sourceRow.type as TaskSourceView["kind"],
            exists: true,
          }
        : { id: task.source_node_id, name: "삭제된 자료", kind: "note", exists: false }
      : null;

    return {
      card,
      source,
      // update_id 가 없는 첨부만 지시문에 붙은 것이다. 나머지는 각 기록 안으로 들어간다.
      attachments: attachments.filter((a) => a.update_id === null).map(toAttachmentView),
      updates: updateRows.map((u) => ({
        id: u.id as string,
        kind: u.kind as TaskUpdateView["kind"],
        authorId: u.author_id as string,
        authorName: displayName(u.author_id as string, nameOf.get(u.author_id as string), u.author_name as string | null),
        body: u.body as string,
        progress: u.progress === null ? null : Number(u.progress),
        editedAt: (u.edited_at as string | null) ?? null,
        createdAt: u.created_at as string,
        attachments: attachments.filter((a) => a.update_id === u.id).map(toAttachmentView),
      })),
      can: {
        ack: canAck(assignees, employeeId),
        addUpdate: canAddUpdate(task, assignees, employeeId),
        submit: canSubmit(task, assignees, employeeId),
        approve: canApprove(task, employeeId),
        reject: canReject(task, employeeId),
        compose:
          canAddUpdate(task, assignees, employeeId) &&
          assignees.some((a) => a.employee_id === employeeId),
      },
    };
  } catch (error) {
    console.error("[tasks] 상세 조회 실패", error);
    return null;
  }
}

/** 지시 옆에 함께 띄울 보관함 가지. root 를 뿌리로 그 아래를 전부 담는다. */
export type SourceSubtree = { rootId: string; nodes: FlatNode[] };

// 지시에 연결한 자료 주변을 함께 보여주기 위해 그 가지만 잘라 온다 (2026-09-10).
//
// 왜 곁에 띄우는가
//   "이 폴더 정리해주세요"를 받은 사람은 결국 보관함을 열어 그 폴더를 찾아간다.
//   지시문과 자료가 다른 화면에 있으면 왔다 갔다 하게 되므로 한 화면에 같이 둔다.
//
// 노트를 연결한 경우에는 그 노트가 든 폴더를 뿌리로 삼는다 — 노트 하나만 덩그러니
// 띄우면 어디에 있는 노트인지 알 수 없어서, 옆 자료까지 보이는 편이 쓸모 있다.
export async function getSourceSubtree(sourceNodeId: string): Promise<SourceSubtree | null> {
  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("nodes")
      .select(
        "id, parent_id, type, name, version, size_bytes, mime_type, created_by, created_at, updated_at",
      )
      .eq("status", "active");

    if (error) return null;

    const all = (data ?? []) as FlatNode[];
    const byId = new Map(all.map((n) => [n.id, n]));
    const source = byId.get(sourceNodeId);
    if (!source) return null;

    const root = source.type === "folder" ? source : (source.parent_id ? byId.get(source.parent_id) ?? source : source);

    // 뿌리에서 아래로 훑는다. 부모가 서로를 가리키는 자료가 생겨도 멈추도록 방문 표시를 남긴다.
    const childrenOf = new Map<string, FlatNode[]>();
    for (const node of all) {
      if (!node.parent_id) continue;
      const list = childrenOf.get(node.parent_id) ?? [];
      list.push(node);
      childrenOf.set(node.parent_id, list);
    }

    const picked: FlatNode[] = [];
    const seen = new Set<string>();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      picked.push(node);
      for (const child of childrenOf.get(node.id) ?? []) stack.push(child);
    }

    return { rootId: root.id, nodes: picked };
  } catch (error) {
    console.error("[tasks] 보관함 가지 조회 실패", error);
    return null;
  }
}

// 반려를 봤다고 표시한다. 지시를 여는 것만으로 배지가 사라진다 — 따로 누르는
// 「확인했음」 버튼은 두지 않는다(공지의 읽음 처리와 같은 판단이다).
//
// 실패해도 화면을 막지 않는다. 배지가 안 사라지는 것보다 지시가 안 열리는 게 나쁘다.
export async function markRejectionSeen(taskId: string, employeeId: string): Promise<void> {
  try {
    const supabase = getServerSupabaseClient();
    await supabase
      .from("task_assignees")
      .update({ rejection_seen_at: new Date().toISOString() })
      .eq("task_id", taskId)
      .eq("employee_id", employeeId);
  } catch (error) {
    console.error("[tasks] 반려 확인 기록 실패", error);
  }
}

// 탭 배지에 쓸 "내가 지금 눌러야 할 것"의 개수.
//
// 세는 것은 세 가지다 — 확인 안 누른 받은 업무, 내 확인을 기다리는 완료 보고,
// 안 본 반려. 셋 다 "누르면 사라지는 것"이라 배지가 영영 남지 않는다.
//
// 헤더는 모든 화면에 있으므로 요청마다 한 번만 돌게 cache() 로 감싼다
// (lib/auth.ts 의 getSession 과 같은 방식). 실패하면 0 을 돌려준다 —
// 배지가 안 뜨는 것보다 화면 전체가 죽는 게 훨씬 나쁘다.
export const countPendingActions = cache(async (employeeId: string): Promise<number> => {
  try {
    const supabase = getServerSupabaseClient();

    const [minesResult, givenResult] = await Promise.all([
      supabase.from("task_assignees").select("task_id, acked_at, rejection_seen_at").eq("employee_id", employeeId),
      supabase
        .from("tasks")
        .select("id")
        .eq("assigner_id", employeeId)
        .eq("status", "submitted")
        .is("deleted_at", null),
    ]);

    const mine = minesResult.data ?? [];
    const waitingForMyApproval = (givenResult.data ?? []).length;
    if (mine.length === 0) return waitingForMyApproval;

    const myTaskIds = mine.map((r) => r.task_id as string);
    const [taskResult, rejectResult] = await Promise.all([
      supabase.from("tasks").select("*").in("id", myTaskIds).is("deleted_at", null),
      supabase
        .from("task_updates")
        .select("task_id, created_at")
        .in("task_id", myTaskIds)
        .eq("kind", "reject")
        .order("created_at", { ascending: false }),
    ]);

    const tasks = (taskResult.data ?? []) as Task[];
    const latestRejectByTask = new Map<string, string>();
    for (const row of rejectResult.data ?? []) {
      const id = row.task_id as string;
      if (!latestRejectByTask.has(id)) latestRejectByTask.set(id, row.created_at as string);
    }
    const rowByTask = new Map(mine.map((r) => [r.task_id as string, r]));

    let count = waitingForMyApproval;
    for (const task of tasks) {
      const row = rowByTask.get(task.id);
      if (!row) continue;
      // 완료된 지시는 더 누를 것이 없다.
      if (task.status === "done") continue;
      if (row.acked_at === null) count += 1;
      const assignee: TaskAssignee = {
        task_id: task.id,
        employee_id: employeeId,
        employee_name: null,
        acked_at: row.acked_at as string | null,
        rejection_seen_at: row.rejection_seen_at as string | null,
      };
      if (shouldShowRejectionBadge(task, assignee, latestRejectByTask.get(task.id) ?? null)) count += 1;
    }
    return count;
  } catch (error) {
    console.error("[tasks] 알림 개수 조회 실패", error);
    return 0;
  }
});

/** 담당자를 고르는 목록. 사원번호와 이름만 — 관리자 여부·등록일은 필요 없다. */
export type Colleague = { employeeId: string; name: string };

// 2026-09-10: 전 직원 이름 목록이 일반 스탭에게도 열린다. 업무를 지시하려면 상대를
// 골라야 하므로 피할 수 없고, 관리자 화면과 달리 관리자 여부·등록일은 내려주지 않는다.
export async function getColleagues(): Promise<Colleague[]> {
  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("employee_whitelist")
      .select("employee_id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("[tasks] 직원 목록 조회 실패", error);
      return [];
    }

    return (data ?? []).map((row) => ({
      employeeId: row.employee_id as string,
      name: displayName(row.employee_id as string, row.name as string | null),
    }));
  } catch (error) {
    console.error("[tasks] 직원 목록 조회 실패", error);
    return [];
  }
}

// 지시에 연결할 보관함 자료를 고르라고 트리를 통째로 내려준다.
//
// 목록이 아니라 트리인 이유
//   "이 폴더 정리해주세요"는 폴더가 어디 붙어 있는지가 곧 의미다. 평면 목록으로 주면
//   같은 이름의 폴더를 구분하려고 경로를 따로 읽어야 하는데, 그건 트리를 글로 옮긴 것에
//   지나지 않는다. 보관함에서 보던 그 모양 그대로 보여주고 하나를 고르게 한다.
//
// 조립은 화면에서 한다 — /api/notes/tree 와 같은 방식이고 buildTree 를 그대로 쓴다.
// 첨부(attachment)는 buildTree 가 알아서 걸러낸다 (지시에 붙이는 파일은 따로 올린다).
export async function getArchiveNodes(): Promise<FlatNode[]> {
  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("nodes")
      .select(
        "id, parent_id, type, name, version, size_bytes, mime_type, created_by, created_at, updated_at",
      )
      .eq("status", "active");

    if (error) {
      console.error("[tasks] 보관함 조회 실패", error);
      return [];
    }
    return (data ?? []) as FlatNode[];
  } catch (error) {
    console.error("[tasks] 보관함 조회 실패", error);
    return [];
  }
}
