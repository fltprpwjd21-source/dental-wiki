import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sortLabwork, type SortableRow } from "../../lib/labwork/sort.ts";

// 왜 이 검사가 필요한가
//   줄 세우는 규칙은 화면을 보고 확인하기 어렵다 — 스무 줄이 조금 다르게 놓여 있어도
//   눈으로는 잘 안 걸린다. 그런데 순서가 어긋나면 "안 온 기공물"을 놓치게 된다.
//   규칙을 여기 적어 고정한다.
let seq = 0;
function row(p: Partial<SortableRow> & { id: string }): SortableRow {
  return {
    seq: ++seq,
    ordered_on: null,
    arrived_on: null,
    updated_at: "2026-09-10T00:00:00Z",
    ...p,
  };
}
const ids = (rows: SortableRow[]) => sortLabwork(rows).map((r) => r.id);

describe("기공물 줄 세우기", () => {
  test("안 온 것이 위, 끝난 것이 아래", () => {
    const 끝남 = row({ id: "끝남", ordered_on: "2026-09-01", arrived_on: "2026-09-05" });
    const 안옴 = row({ id: "안옴", ordered_on: "2026-09-09" });
    assert.deepEqual(ids([끝남, 안옴]), ["안옴", "끝남"]);
  });

  test("안 온 것끼리는 의뢰일 순 (먼저 의뢰한 것이 위)", () => {
    const 늦게 = row({ id: "늦게", ordered_on: "2026-09-09" });
    const 먼저 = row({ id: "먼저", ordered_on: "2026-09-02" });
    assert.deepEqual(ids([늦게, 먼저]), ["먼저", "늦게"]);
  });

  test("끝난 것끼리는 도착한 순서로 쌓인다 (방금 체크한 것이 맨 아래)", () => {
    const 어제 = row({ id: "어제", ordered_on: "2026-09-01", arrived_on: "2026-09-09" });
    const 오늘 = row({ id: "오늘", ordered_on: "2026-09-01", arrived_on: "2026-09-10" });
    assert.deepEqual(ids([오늘, 어제]), ["어제", "오늘"]);
  });

  test("같은 날 도착한 것끼리는 나중에 손댄 것이 아래", () => {
    // 도착일은 날짜뿐이라 오늘 체크한 것들이 전부 같은 값이 된다.
    // 시각으로 안 가르면 방금 누른 줄이 어디로 갔는지 매번 달라진다.
    const 먼저 = row({ id: "먼저", arrived_on: "2026-09-10", updated_at: "2026-09-10T01:00:00Z" });
    const 나중 = row({ id: "나중", arrived_on: "2026-09-10", updated_at: "2026-09-10T05:00:00Z" });
    assert.deepEqual(ids([나중, 먼저]), ["먼저", "나중"]);
  });

  test("의뢰일이 빈 줄은 맨 위에 둔다 (방금 만든 줄이라 지금 손댈 줄이다)", () => {
    const 새줄 = row({ id: "새줄" });
    const 오래된 = row({ id: "오래된", ordered_on: "2026-08-01" });
    assert.deepEqual(ids([오래된, 새줄]), ["새줄", "오래된"]);
  });

  test("갓 만든 빈 줄끼리는 최근에 만든 것이 위", () => {
    const 먼저만듦 = row({ id: "먼저만듦" });
    const 나중만듦 = row({ id: "나중만듦" });
    assert.deepEqual(ids([먼저만듦, 나중만듦]), ["나중만듦", "먼저만듦"]);
  });

  test("빈 줄이라도 도착 처리되면 아래로 내려간다", () => {
    // 의뢰일이 없다고 끝난 줄이 위에 남으면, 위쪽이 "할 일"이라는 약속이 깨진다.
    const 빈줄끝남 = row({ id: "빈줄끝남", arrived_on: "2026-09-10" });
    const 안옴 = row({ id: "안옴", ordered_on: "2026-09-01" });
    assert.deepEqual(ids([빈줄끝남, 안옴]), ["안옴", "빈줄끝남"]);
  });

  test("같은 의뢰일이면 넣은 순서를 지킨다", () => {
    const 첫째 = row({ id: "첫째", ordered_on: "2026-09-03" });
    const 둘째 = row({ id: "둘째", ordered_on: "2026-09-03" });
    assert.deepEqual(ids([둘째, 첫째]), ["첫째", "둘째"]);
  });

  test("원래 배열을 건드리지 않는다", () => {
    const 목록 = [row({ id: "b", ordered_on: "2026-09-09" }), row({ id: "a", ordered_on: "2026-09-01" })];
    const 그대로 = 목록.map((r) => r.id);
    sortLabwork(목록);
    assert.deepEqual(목록.map((r) => r.id), 그대로);
  });
});
