import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ackSummary,
  approvePatch,
  canAck,
  canAddUpdate,
  canApprove,
  canReject,
  canSubmit,
  canView,
  compareTasks,
  rejectPatch,
  shouldShowRejectionBadge,
  statusAfterNote,
  submitPatch,
  visibleProgress,
  type Task,
  type TaskAssignee,
} from "../../lib/tasks.ts";

// 왜 이 검사가 필요한가
//   업무지시는 앱에서 처음으로 "이건 네 것"이라는 소유 개념이 들어오는 기능이다
//   (다른 기능은 전 스탭이 같은 권한으로 함께 본다). 그래서 규칙을 라우트마다
//   다시 쓰면 어긋난다. lib/tasks.ts 한 곳에 모으고, 그 규칙을 여기서 고정한다.

const ASSIGNER = "00001";
const WORKER_A = "10001";
const WORKER_B = "10002";
const OUTSIDER = "99999";

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "소독실 매뉴얼 개정",
    body: "",
    assigner_id: ASSIGNER,
    assigner_name: "원장",
    status: "assigned",
    is_longterm: false,
    progress: 0,
    submitted_by: null,
    source_node_id: null,
    due_on: null,
    submitted_at: null,
    completed_at: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    deleted_at: null,
    ...over,
  };
}

function makeAssignee(employeeId: string, over: Partial<TaskAssignee> = {}): TaskAssignee {
  return {
    task_id: "t1",
    employee_id: employeeId,
    employee_name: null,
    acked_at: null,
    rejection_seen_at: null,
    ...over,
  };
}

const BOTH = [makeAssignee(WORKER_A), makeAssignee(WORKER_B)];

describe("업무지시 — 열람 권한", () => {
  test("지시자와 담당자는 볼 수 있다", () => {
    const task = makeTask();
    assert.equal(canView(task, BOTH, ASSIGNER), true);
    assert.equal(canView(task, BOTH, WORKER_A), true);
    assert.equal(canView(task, BOTH, WORKER_B), true);
  });

  test("그 밖의 스탭은 볼 수 없다 — 앱에서 유일하게 전 스탭 공유가 아닌 화면이다", () => {
    assert.equal(canView(makeTask(), BOTH, OUTSIDER), false);
  });
});

describe("업무지시 — 확인 체크", () => {
  test("담당자는 한 번 누를 수 있다", () => {
    assert.equal(canAck(BOTH, WORKER_A), true);
  });

  test("이미 누른 담당자는 다시 누르지 않는다", () => {
    const acked = [makeAssignee(WORKER_A, { acked_at: "2026-09-10T01:00:00Z" }), makeAssignee(WORKER_B)];
    assert.equal(canAck(acked, WORKER_A), false);
    assert.equal(canAck(acked, WORKER_B), true);
  });

  test("지시자는 확인할 것이 없다", () => {
    assert.equal(canAck(BOTH, ASSIGNER), false);
  });

  test("확인 집계는 「2/3」 형태로 쓸 수 있다", () => {
    const three = [
      makeAssignee(WORKER_A, { acked_at: "2026-09-10T01:00:00Z" }),
      makeAssignee(WORKER_B, { acked_at: "2026-09-10T02:00:00Z" }),
      makeAssignee("10003"),
    ];
    assert.deepEqual(ackSummary(three), { acked: 2, total: 3 });
  });
});

describe("업무지시 — 완료 보고와 확인", () => {
  test("완료 보고는 담당자 누구나 할 수 있다 (전원이 올릴 필요는 없다)", () => {
    const task = makeTask({ status: "in_progress" });
    assert.equal(canSubmit(task, BOTH, WORKER_A), true);
    assert.equal(canSubmit(task, BOTH, WORKER_B), true);
  });

  test("지시자는 완료 보고를 할 수 없다", () => {
    assert.equal(canSubmit(makeTask({ status: "in_progress" }), BOTH, ASSIGNER), false);
  });

  test("이미 완료 확인 대기 중이면 또 보고하지 않는다", () => {
    assert.equal(canSubmit(makeTask({ status: "submitted" }), BOTH, WORKER_A), false);
  });

  test("완료 확인은 지시자만, 보고가 올라온 뒤에만 할 수 있다", () => {
    assert.equal(canApprove(makeTask({ status: "submitted" }), ASSIGNER), true);
    assert.equal(canApprove(makeTask({ status: "submitted" }), WORKER_A), false);
    assert.equal(canApprove(makeTask({ status: "in_progress" }), ASSIGNER), false);
  });

  test("반려도 완료 확인과 같은 조건이다", () => {
    assert.equal(canReject(makeTask({ status: "submitted" }), ASSIGNER), true);
    assert.equal(canReject(makeTask({ status: "in_progress" }), ASSIGNER), false);
  });
});

describe("업무지시 — 상태 전이", () => {
  test("첫 진행 기록이 올라오면 미착수에서 진행 중으로 넘어간다", () => {
    assert.deepEqual(statusAfterNote(makeTask({ status: "assigned" })), { status: "in_progress" });
  });

  test("완료 확인 대기 중에 기록을 더 써도 상태를 되돌리지 않는다", () => {
    assert.deepEqual(statusAfterNote(makeTask({ status: "submitted" })), {});
  });

  test("완료 보고는 보고자와 시각을 함께 남긴다", () => {
    assert.deepEqual(submitPatch(WORKER_A, "2026-09-10T03:00:00Z"), {
      status: "submitted",
      submitted_by: WORKER_A,
      submitted_at: "2026-09-10T03:00:00Z",
    });
  });

  test("완료 확인은 완료 시각을 남긴다", () => {
    assert.deepEqual(approvePatch("2026-09-10T04:00:00Z"), {
      status: "done",
      completed_at: "2026-09-10T04:00:00Z",
    });
  });

  test("반려하면 진행률이 0 이 되고 다시 진행 중으로 돌아간다", () => {
    assert.deepEqual(rejectPatch(), {
      status: "in_progress",
      progress: 0,
      submitted_at: null,
    });
  });

  test("반려해도 보고자는 지우지 않는다 — 반려 알림이 갈 대상이기 때문이다", () => {
    assert.equal("submitted_by" in rejectPatch(), false);
  });

  test("반려한 뒤에는 다시 완료 보고를 할 수 있다", () => {
    const rejected = makeTask({ ...rejectPatch(), submitted_by: WORKER_A });
    assert.equal(canSubmit(rejected, BOTH, WORKER_A), true);
    assert.equal(canSubmit(rejected, BOTH, WORKER_B), true);
  });

  test("완료 확인이 끝난 지시에는 더 쓰지 않는다", () => {
    const done = makeTask({ status: "done", completed_at: "2026-09-10T04:00:00Z" });
    assert.equal(canAddUpdate(done, BOTH, WORKER_A), false);
    assert.equal(canAddUpdate(done, BOTH, ASSIGNER), false);
  });

  test("진행 중인 지시에는 지시자도 기록을 쓸 수 있다 (반려 사유가 여기 남는다)", () => {
    const task = makeTask({ status: "in_progress" });
    assert.equal(canAddUpdate(task, BOTH, ASSIGNER), true);
    assert.equal(canAddUpdate(task, BOTH, OUTSIDER), false);
  });
});

describe("업무지시 — 진행률", () => {
  test("장기 업무에만 진행률을 보여준다", () => {
    assert.equal(visibleProgress(makeTask({ is_longterm: true, progress: 60 })), 60);
    assert.equal(visibleProgress(makeTask({ is_longterm: false, progress: 60 })), null);
  });
});

describe("업무지시 — 반려 배지", () => {
  const REJECTED_AT = "2026-09-10T05:00:00Z";

  test("완료 보고를 올린 담당자에게만 붙는다", () => {
    const task = makeTask({ status: "in_progress", submitted_by: WORKER_A });
    assert.equal(shouldShowRejectionBadge(task, makeAssignee(WORKER_A), REJECTED_AT), true);
    assert.equal(shouldShowRejectionBadge(task, makeAssignee(WORKER_B), REJECTED_AT), false);
  });

  test("지시를 열어본 뒤에는 사라진다", () => {
    const task = makeTask({ status: "in_progress", submitted_by: WORKER_A });
    const seen = makeAssignee(WORKER_A, { rejection_seen_at: "2026-09-10T06:00:00Z" });
    assert.equal(shouldShowRejectionBadge(task, seen, REJECTED_AT), false);
  });

  test("전에 본 반려보다 새 반려가 있으면 다시 뜬다", () => {
    const task = makeTask({ status: "in_progress", submitted_by: WORKER_A });
    const seen = makeAssignee(WORKER_A, { rejection_seen_at: "2026-09-10T04:00:00Z" });
    assert.equal(shouldShowRejectionBadge(task, seen, REJECTED_AT), true);
  });

  test("소수점 자릿수와 오프셋 표기가 달라도 시각을 제대로 비교한다", () => {
    const task = makeTask({ status: "in_progress", submitted_by: WORKER_A });
    // 같은 순간을 Postgres 가 다른 표기로 돌려준 경우 — 사전순 비교였다면 어긋난다
    const seen = makeAssignee(WORKER_A, { rejection_seen_at: "2026-09-10T14:00:00.123456+09:00" });
    assert.equal(shouldShowRejectionBadge(task, seen, "2026-09-10T05:00:00Z"), false);
  });

  test("반려가 없으면 뜨지 않는다", () => {
    const task = makeTask({ submitted_by: WORKER_A });
    assert.equal(shouldShowRejectionBadge(task, makeAssignee(WORKER_A), null), false);
  });
});

describe("업무지시 — 목록 정렬", () => {
  test("완료 확인 대기가 맨 위로 온다", () => {
    const waiting = makeTask({ id: "waiting", status: "submitted" });
    const running = makeTask({ id: "running", status: "in_progress" });
    const finished = makeTask({ id: "finished", status: "done" });
    const sorted = [finished, running, waiting].sort(compareTasks).map((t) => t.id);
    assert.deepEqual(sorted, ["waiting", "running", "finished"]);
  });

  test("같은 상태면 마감이 임박한 것이 먼저다", () => {
    const soon = makeTask({ id: "soon", status: "in_progress", due_on: "2026-09-11" });
    const later = makeTask({ id: "later", status: "in_progress", due_on: "2026-09-30" });
    assert.deepEqual([later, soon].sort(compareTasks).map((t) => t.id), ["soon", "later"]);
  });

  test("마감일이 없는 지시는 있는 것보다 뒤로 간다", () => {
    const dated = makeTask({ id: "dated", status: "in_progress", due_on: "2026-09-30" });
    const undated = makeTask({ id: "undated", status: "in_progress", due_on: null });
    assert.deepEqual([undated, dated].sort(compareTasks).map((t) => t.id), ["dated", "undated"]);
  });

  test("상태도 마감도 같으면 최근에 갱신된 것이 먼저다", () => {
    const old = makeTask({ id: "old", status: "in_progress", updated_at: "2026-09-01T00:00:00Z" });
    const fresh = makeTask({ id: "fresh", status: "in_progress", updated_at: "2026-09-10T00:00:00Z" });
    assert.deepEqual([old, fresh].sort(compareTasks).map((t) => t.id), ["fresh", "old"]);
  });

  test("미착수와 진행 중은 같은 무리로 두고 마감일로만 가른다", () => {
    const notStarted = makeTask({ id: "notStarted", status: "assigned", due_on: "2026-09-12" });
    const running = makeTask({ id: "running", status: "in_progress", due_on: "2026-09-20" });
    assert.deepEqual([running, notStarted].sort(compareTasks).map((t) => t.id), ["notStarted", "running"]);
  });
});
