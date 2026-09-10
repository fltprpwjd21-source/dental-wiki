// 업무지시의 규칙 — 누가 무엇을 할 수 있고, 상태가 어떻게 옮겨가는가 (PRD ⑨, PLAN 8차 35번)
//
// 이 파일에는 DB도 화면도 들어오지 않는다. 순수 함수만 둔다.
//   규칙이 API 라우트마다 흩어지면 "완료 보고는 담당자만"을 한 곳에서 빠뜨려도
//   아무도 모른다. 여기 모아 두고 단위 테스트로 고정한다
//   (공지의 lib/notices.ts 와 같은 구성이고, 서버 조회가 필요하면 별도 파일로 나눈다).

export type TaskStatus = "assigned" | "in_progress" | "submitted" | "done";

// 진행 기록의 종류. 'submit'·'reject' 는 상태를 바꾼 사건이라 나중에 고칠 수 없다
// (DB 트리거가 강제한다 — 20260910150000_tasks.sql).
export type TaskUpdateKind = "note" | "submit" | "reject";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  assigned: "미착수",
  in_progress: "진행 중",
  submitted: "완료 확인 대기",
  done: "완료",
};

export type Task = {
  id: string;
  title: string;
  body: string;
  assigner_id: string;
  assigner_name: string | null;
  status: TaskStatus;
  is_longterm: boolean;
  progress: number;
  /** 마지막으로 「완료 보고」를 올린 담당자. 반려 알림이 갈 대상이라 반려해도 지우지 않는다. */
  submitted_by: string | null;
  /**
   * 지시와 함께 가리키는 보관함 항목(nodes.id). 폴더·노트 모두 가능하다.
   * 외래키가 아니므로 원본이 사라질 수 있다 — 화면은 그때 「삭제된 자료」로 표시한다.
   */
  source_node_id: string | null;
  due_on: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TaskAssignee = {
  task_id: string;
  employee_id: string;
  employee_name: string | null;
  /** 「확인」 체크. 담당자마다 갈리는 유일한 값이다. */
  acked_at: string | null;
  rejection_seen_at: string | null;
};

// ── 누구인가 ──────────────────────────────────────────────────────────

export function isAssigner(task: Task, employeeId: string): boolean {
  return task.assigner_id === employeeId;
}

export function isAssignee(assignees: readonly TaskAssignee[], employeeId: string): boolean {
  return assignees.some((a) => a.employee_id === employeeId);
}

export function findAssignee(
  assignees: readonly TaskAssignee[],
  employeeId: string,
): TaskAssignee | undefined {
  return assignees.find((a) => a.employee_id === employeeId);
}

// ── 무엇을 할 수 있는가 ────────────────────────────────────────────────

// 업무지시는 앱에서 유일하게 열람이 제한되는 화면이다. 다른 기능은 전 스탭이 함께 보지만
// (PRD 6번 비범위 "역할별 권한 세분화 없음"), 지시문에는 질책성 내용이 들어갈 수 있어서
// 지시자와 담당자에게만 연다. 나중에 여는 것은 쉬워도 이미 본 것은 되돌릴 수 없다.
export function canView(task: Task, assignees: readonly TaskAssignee[], employeeId: string): boolean {
  return isAssigner(task, employeeId) || isAssignee(assignees, employeeId);
}

// 「확인」 체크는 담당자 본인만, 한 번만 누른다. 지시자는 누를 것이 없다.
export function canAck(assignees: readonly TaskAssignee[], employeeId: string): boolean {
  const me = findAssignee(assignees, employeeId);
  return me !== undefined && me.acked_at === null;
}

// 진행 기록은 담당자 전원과 지시자가 함께 쌓는다 — 지시자의 반려 사유·추가 지시도
// 같은 자리에 기록으로 남아야 흐름이 한 줄로 읽힌다.
// 완료 확인이 끝난 지시에는 더 쓰지 않는다 (종결된 기록이다).
export function canAddUpdate(
  task: Task,
  assignees: readonly TaskAssignee[],
  employeeId: string,
): boolean {
  if (task.status === "done") return false;
  return canView(task, assignees, employeeId);
}

// 완료 보고는 담당자 누구나 할 수 있다. 전원이 보고해야 완료로 치지 않는다 —
// 지시 하나를 나눠 하는 것이므로 대표로 한 사람이 "다 됐습니다"를 올린다.
// 대신 누가 올렸는지(submitted_by)를 남겨 카드에 표시하고, 반려 알림도 그 사람에게 간다.
export function canSubmit(
  task: Task,
  assignees: readonly TaskAssignee[],
  employeeId: string,
): boolean {
  if (!isAssignee(assignees, employeeId)) return false;
  return task.status === "assigned" || task.status === "in_progress";
}

// 완료 확인·반려는 지시를 낸 사람만, 완료 보고가 올라와 있을 때만 할 수 있다.
export function canApprove(task: Task, employeeId: string): boolean {
  return isAssigner(task, employeeId) && task.status === "submitted";
}

export function canReject(task: Task, employeeId: string): boolean {
  return canApprove(task, employeeId);
}

// ── 상태를 어떻게 옮기는가 ─────────────────────────────────────────────

export type TaskPatch = Partial<
  Pick<Task, "status" | "progress" | "submitted_by" | "submitted_at" | "completed_at">
>;

// 진행 기록이 처음 올라오면 「미착수」에서 「진행 중」으로 넘어간다.
// 이미 넘어간 뒤에는 아무것도 바꾸지 않는다 (완료 보고를 되돌리지 않기 위해서다).
export function statusAfterNote(task: Task): TaskPatch {
  return task.status === "assigned" ? { status: "in_progress" } : {};
}

export function submitPatch(employeeId: string, now: string): TaskPatch {
  return {
    status: "submitted",
    submitted_by: employeeId,
    submitted_at: now,
  };
}

export function approvePatch(now: string): TaskPatch {
  return { status: "done", completed_at: now };
}

// 반려하면 진행률이 0 으로 초기화되고 다시 「진행 중」이 된다 (2026-09-09 결정).
//
// submitted_by 는 지우지 않는다 — 반려 배지를 누구에게 띄울지가 그 값이기 때문이다.
// submitted_at 만 비워 "지금은 확인 대기가 아니다"를 나타낸다.
//
// 초기화되는 것은 tasks.progress 현재값뿐이고, 그동안의 진행률은 task_updates.progress 에
// 그대로 남는다. 장기 업무에서 몇 달치 진행이 사라진 것처럼 보이면 안 된다.
export function rejectPatch(): TaskPatch {
  return { status: "in_progress", progress: 0, submitted_at: null };
}

// ── 진행률 ─────────────────────────────────────────────────────────────

// 20% 씩 여섯 칸. 1% 단위로 열어두면 "지금 47% 인가 48% 인가"를 고민하게 되는데,
// 그 정밀도는 아무도 쓰지 않고 답할 수도 없다. 눈금이 굵을수록 손이 덜 간다.
export const PROGRESS_STEP = 20;
export const PROGRESS_STEPS = [0, 20, 40, 60, 80, 100] as const;

export function isValidProgress(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100 && value % PROGRESS_STEP === 0;
}

// 글 없이 진행률만 바꿔도 기록으로 남긴다. 빈 본문은 DB 가 막으므로(task_updates_body_not_blank)
// 여기서 문장을 만들어 채운다 — 대화 흐름에서 "언제 몇 %가 됐는지"가 보여야 하기 때문이다.
export function progressChangeBody(from: number, to: number): string {
  return `진행률 ${from}% → ${to}%`;
}

/** 완료 보고의 기본 문구. 담당자가 고쳐 쓸 수 있다. */
export const DEFAULT_SUBMIT_BODY = "업무를 완료했습니다.";

// ── 화면에 무엇을 보여주는가 ───────────────────────────────────────────

// 진행률은 장기 업무에만 있다. 단기 업무에까지 퍼센트를 요구하면 아무도 쓰지 않는다
// (공지의 「읽음 확인」 버튼을 2026-09-09 에 걷어낸 것과 같은 이유다).
export function visibleProgress(task: Task): number | null {
  return task.is_longterm ? task.progress : null;
}

/** 「확인 2/3」 처럼 보여주기 위한 집계. */
export function ackSummary(assignees: readonly TaskAssignee[]): { acked: number; total: number } {
  return {
    acked: assignees.filter((a) => a.acked_at !== null).length,
    total: assignees.length,
  };
}

// 반려 배지를 띄울지. 배지는 완료 보고를 올린 담당자에게만 붙는다 —
// 반려 사유 자체는 진행 기록이라 담당자 전원이 보지만, "네가 올린 게 반려됐다"는
// 알림은 그 사람에게 가는 것이 맞다. 지시를 열어보면(rejection_seen_at 갱신) 사라진다.
//
// 시각 비교에 문자열을 쓰지 않는다 — Postgres 가 돌려주는 타임스탬프는 소수점 자릿수와
// 오프셋 표기가 제각각이라 사전순 비교가 어긋난다.
export function shouldShowRejectionBadge(
  task: Task,
  me: TaskAssignee | undefined,
  latestRejectAt: string | null,
): boolean {
  if (!me || !latestRejectAt) return false;
  if (task.submitted_by !== me.employee_id) return false;
  if (me.rejection_seen_at === null) return true;
  return Date.parse(me.rejection_seen_at) < Date.parse(latestRejectAt);
}

// 목록 정렬: ① 완료 확인 대기 → ② 마감 임박 → ③ 최근 갱신순.
//
// 완료 보고가 맨 위에 오는 이유는 그것만이 "지시자가 지금 눌러야 할 것"이기 때문이다.
// 완료 확인을 누르면 done 이 되어 아래 완료 목록으로 내려간다 — 그래서 공지에서 쓰던
// "안 본 항목" 추적 표가 여기엔 필요 없다 (PLAN 8차 설계 결정 5번).
//
// 마감일이 없는 지시는 있는 것보다 뒤로 보낸다. 날짜를 비워둔 쪽이 덜 급하다.
const STATUS_ORDER: Record<TaskStatus, number> = {
  submitted: 0,
  assigned: 1,
  in_progress: 1,
  done: 2,
};

export function compareTasks(a: Task, b: Task): number {
  const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (byStatus !== 0) return byStatus;

  if (a.due_on !== b.due_on) {
    if (a.due_on === null) return 1;
    if (b.due_on === null) return -1;
    return a.due_on < b.due_on ? -1 : 1;
  }

  return Date.parse(b.updated_at) - Date.parse(a.updated_at);
}
