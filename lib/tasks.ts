// 업무지시의 규칙 — 누가 무엇을 할 수 있고, 상태가 어떻게 옮겨가는가 (PRD ⑨, PLAN 8차 35번)
//
// 이 파일에는 DB도 화면도 들어오지 않는다. 순수 함수만 둔다.
//   규칙이 API 라우트마다 흩어지면 "완료 보고는 담당자만"을 한 곳에서 빠뜨려도
//   아무도 모른다. 여기 모아 두고 단위 테스트로 고정한다
//   (공지의 lib/notices.ts 와 같은 구성이고, 서버 조회가 필요하면 별도 파일로 나눈다).

export type TaskStatus = "assigned" | "in_progress" | "submitted" | "done";

// 업무지시와 업무보고를 한 테이블에서 다룬다 (2026-09-11).
// 갈리는 것은 assigner_id 의 의미뿐이다 — 지시면 「지시를 낸 사람」, 보고면 「보고를 받을 사람」.
// 어느 쪽이든 완료 확인·이어서 지시·반려를 누르는 사람이라서 아래 규칙이 그대로 통한다.
export type TaskKind = "instruction" | "report";

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  instruction: "업무지시",
  report: "업무보고",
};

// 진행 기록의 종류. 'note' 외에는 상태를 바꾼 사건이라 나중에 고칠 수 없다
// (DB 트리거가 강제한다 — 20260910150000_tasks.sql 의 OLD.kind <> 'note' 판정).
export type TaskUpdateKind = "note" | "submit" | "reject" | "followup";

// 완료 보고를 되돌려보내는 기록.
//
// 처음에는 「반려」와 「이어서 지시」를 나눠 뒀는데, 하는 일이 완전히 같았다 — 둘 다
// 코멘트를 받아 같은 건을 다시 진행 중으로 돌린다. 누르는 사람도 "다시 해와라"와
// "이어서 해라"를 매번 갈라 생각해야 했다. 그래서 「추가 요청」 하나로 합쳤다 (2026-09-11).
//
// 'reject' 는 enum 에 남는다. Postgres 는 enum 값을 빼기 어렵고, 합치기 전에 쌓인 기록이
// 실제로 반려였기 때문이다 — 옛 기록은 옛 이름 그대로 보여주는 것이 맞다.
// 새로 쓰이는 것은 'followup' 뿐이다.
export type TaskReturnKind = Extract<TaskUpdateKind, "reject" | "followup">;

// 화면에 보이는 상태 이름 (2026-09-11 문구 변경).
//
// 「미착수」는 일을 안 했다는 질책처럼 읽혔다. 실제로 그 상태가 뜻하는 것은 담당자가
// 아직 지시를 열어보지 않았다는 것이라 「미확인」이 사실에 가깝다.
//
// 「완료 확인 대기」는 길고, 받는 사람 입장에서 무엇을 기다리는지가 흐렸다 —
// 올린 사람이 아니라 받은 사람이 눌러야 한다는 뜻이 담기게 「결재대기」로 바꿨다.
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  assigned: "미확인",
  in_progress: "진행중",
  submitted: "결재대기",
  done: "완료",
};

export type Task = {
  id: string;
  title: string;
  body: string;
  kind: TaskKind;
  /**
   * kind='instruction' 이면 지시를 낸 사람, kind='report' 이면 보고를 받을 사람.
   * 두 경우 모두 완료 확인·이어서 지시·반려를 누르는 사람이다.
   */
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

// 업무를 올린 쪽과 처리할 쪽 (2026-09-11).
//
// 지시는 낸 사람이 올린 쪽이고 담당자가 처리할 쪽이다. 보고는 정확히 반대다 — 올린
// 사람은 보고자이고, 확인·추가 요청을 눌러야 하는 쪽이 처리할 사람이다.
//
// DB 는 "누를 수 있는 사람"을 assigner_id 한 칸에 모아 둔다. 그래야 canApprove 같은
// 규칙이 두 종류에 한 벌로 통하기 때문이다. 대신 화면에서 쓰는 '올린 사람/담당자'는
// 여기서 한 번 뒤집어 준다 — 안 그러면 보고를 받은 사람 화면에서 그 보고가
// 「내가 요청한 업무」로 들어가고, 담당자 칸에 보고자 이름이 뜬다.

export function isOwner(
  task: Task,
  assignees: readonly TaskAssignee[],
  employeeId: string,
): boolean {
  return task.kind === "report"
    ? isAssignee(assignees, employeeId)
    : isAssigner(task, employeeId);
}

export function isHandler(
  task: Task,
  assignees: readonly TaskAssignee[],
  employeeId: string,
): boolean {
  return task.kind === "report"
    ? isAssigner(task, employeeId)
    : isAssignee(assignees, employeeId);
}

// ── 무엇을 할 수 있는가 ────────────────────────────────────────────────

// 열람은 두 층이다 (2026-09-11 변경).
//
// 지시문에는 질책성 내용이 들어갈 수 있어서 본문·진행 기록·첨부는 여전히 당사자에게만 연다.
// 다만 "누가 무엇을 어디까지 했는지"는 팀이 알아야 해서, 제목·담당자·상태·진행률·마감일까지의
// 요약만 전 스탭에게 연다. 열어놓은 것은 되돌릴 수 없으므로 넓히기 쉬운 쪽으로 좁게 열었다.
//
// 이 함수는 그중 '깊은 쪽'이다 — 본문과 스레드를 볼 수 있는가.
export function canView(task: Task, assignees: readonly TaskAssignee[], employeeId: string): boolean {
  return isAssigner(task, employeeId) || isAssignee(assignees, employeeId);
}

// 요약(게시판)을 볼 수 있는가. 로그인한 스탭이면 누구나 본다.
//
// 함수로 남겨 두는 이유는, 나중에 범위를 좁힐 일이 생기면 고칠 자리가 여기 하나이기
// 때문이다. 실제 차단은 서버 조회를 나눠서 한다 — getTaskBoard() 는 select 목록에
// body 를 넣지 않으므로, 화면이 실수로 그려도 내려갈 본문 자체가 없다.
export function canViewSummary(): boolean {
  return true;
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

// 완료 확인·추가 요청은 그 건을 처리하는 사람만, 완료 보고가 올라와 있을 때만 할 수 있다.
// (지시면 낸 사람, 보고면 받는 사람 — 둘 다 assigner_id 다)
export function canApprove(task: Task, employeeId: string): boolean {
  return isAssigner(task, employeeId) && task.status === "submitted";
}

// 「추가 요청」도 같은 자리에서 누른다. 완료 확인과 조건이 같은 것은 우연이 아니다 —
// 둘은 같은 순간에 고르는 한 벌의 선택지다.
export function canFollowup(task: Task, employeeId: string): boolean {
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

// 완료 보고를 올리면 진행률은 100% 가 된다 (2026-09-11).
//
// 눈금을 100 으로 옮기고 「작업 완료」를 또 누르는 두 동작을 요구할 이유가 없다. 그리고
// 「진행률 80%」인 채 완료 확인을 기다리는 카드는 보는 사람을 헷갈리게 한다 — 다 했다는
// 보고와 눈금이 어긋나 있으면 어느 쪽을 믿어야 할지 알 수 없다.
//
// 장기 업무가 아니어도 값은 채운다. 그쪽은 진행률을 화면에 그리지 않으므로(visibleProgress)
// 보이지 않을 뿐이고, 나중에 장기 업무로 바꿔도 값이 어긋나 있지 않다.
// 반려·이어서 지시로 되돌아가면 0 으로 다시 초기화된다.
export function submitPatch(employeeId: string, now: string): TaskPatch {
  return {
    status: "submitted",
    submitted_by: employeeId,
    submitted_at: now,
    progress: 100,
  };
}

export function approvePatch(now: string): TaskPatch {
  return { status: "done", completed_at: now };
}

// 「추가 요청」. 완료 보고를 되돌려보내 같은 건이 다시 진행 중이 된다 (2026-09-11).
//
// 예전의 「반려」와 「이어서 지시」가 여기로 합쳐졌다. 둘은 코멘트를 받아 같은 상태로
// 되돌린다는 점에서 하는 일이 완전히 같았고, 누르는 쪽에 없는 구분을 강요하고 있었다.
//
// submitted_by 는 지우지 않는다 — 배지를 누구에게 띄울지가 그 값이기 때문이다.
// submitted_at 만 비워 "지금은 결재 대기가 아니다"를 나타낸다.
//
// 진행률을 0 으로 되돌리는 것은 새로 받은 일에 대한 진행이 아직 0 이기 때문이다.
// 초기화되는 것은 tasks.progress 현재값뿐이고, 그동안의 진행률은 task_updates.progress 에
// 그대로 남는다 — 장기 업무에서 몇 달치 진행이 사라진 것처럼 보이면 안 된다.
//
// completed_at 은 채우지 않는다. 완료가 아니다.
export function followupPatch(): TaskPatch {
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
// 게시판은 본문을 읽지 않으므로 Task 전체를 갖고 있지 않다. 필요한 두 칸만 받는다 —
// 같은 규칙을 두 번 쓰지 않기 위해서다.
export function visibleProgress(task: Pick<Task, "is_longterm" | "progress">): number | null {
  return task.is_longterm ? task.progress : null;
}

/** 「확인 2/3」 처럼 보여주기 위한 집계. */
export function ackSummary(assignees: readonly TaskAssignee[]): { acked: number; total: number } {
  return {
    acked: assignees.filter((a) => a.acked_at !== null).length,
    total: assignees.length,
  };
}

/** 완료 보고가 되돌아온 마지막 사건. 반려인지 이어서 지시인지와 그 시각. */
export type TaskReturn = { kind: TaskReturnKind; at: string };

// 되돌아왔음을 알리는 배지를 띄울지, 띄운다면 어느 쪽인지.
//
// 배지는 완료 보고를 올린 담당자에게만 붙는다 — 사유·코멘트 자체는 진행 기록이라 담당자
// 전원이 보지만, "네가 올린 게 되돌아왔다"는 알림은 그 사람에게 가는 것이 맞다.
// 지시를 열어보면(rejection_seen_at 갱신) 사라진다.
//
// 반려와 이어서 지시를 한 함수로 다루되 어느 쪽인지는 돌려준다. 담당자 입장에서 "다시
// 내 차례"라는 사실은 같지만, 다시 해야 하는 것과 이어서 하는 것은 마음가짐이 다르다.
//
// 시각 비교에 문자열을 쓰지 않는다 — Postgres 가 돌려주는 타임스탬프는 소수점 자릿수와
// 오프셋 표기가 제각각이라 사전순 비교가 어긋난다.
//
// 컬럼 이름은 rejection_seen_at 그대로 둔다. 뜻이 "되돌아온 것을 본 시각"으로 넓어졌을
// 뿐이고, 쓰이는 곳이 여기 하나라 이름을 바꾸려고 마이그레이션을 더할 이유가 없다.
export function returnBadgeKind(
  task: Task,
  me: TaskAssignee | undefined,
  latestReturn: TaskReturn | null,
): TaskReturnKind | null {
  if (!me || !latestReturn) return null;
  if (task.submitted_by !== me.employee_id) return null;
  if (me.rejection_seen_at === null) return latestReturn.kind;
  return Date.parse(me.rejection_seen_at) < Date.parse(latestReturn.at) ? latestReturn.kind : null;
}

// 'reject' 는 합치기 전에 쌓인 기록에만 남는다 — 그때는 정말 반려였으므로 옛 이름 그대로 둔다.
export const TASK_RETURN_LABELS: Record<TaskReturnKind, string> = {
  reject: "반려됨",
  followup: "추가 요청",
};

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
