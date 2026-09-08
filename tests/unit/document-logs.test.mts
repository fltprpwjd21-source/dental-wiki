import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { visibleDocumentLogs } from "../../lib/document-logs.ts";

// 왜 이 검사가 필요한가
//   "최초 등록만 있으면 감춘다"는 규칙은 「되돌리기」와 한 몸이다.
//   조건을 넓혀 create 를 항상 감추면 화면은 깔끔해지지만, 한 번 고친 문서를
//   처음 올렸을 때로 되돌릴 방법이 조용히 사라진다. 그 실수를 여기서 잡는다.
//   (로그는 목록에서만 감추는 것이고, DB에서 지우는 것이 아니다 —
//    document_logs 에는 삭제를 막는 트리거가 걸려 있다)
const create = { id: "1", action: "create" };
const update = { id: "2", action: "update" };
const revert = { id: "3", action: "revert" };

describe("문서 수정 로그 표시 규칙", () => {
  test("올리기만 한 문서는 아무것도 보여주지 않는다", () => {
    assert.deepEqual(visibleDocumentLogs([create]), []);
  });

  test("한 번이라도 고쳤으면 최초 등록도 함께 보여준다 (되돌리기 대상이라서)", () => {
    // 목록은 최신순이라 update 가 앞, create 가 뒤에 온다.
    assert.deepEqual(visibleDocumentLogs([update, create]), [update, create]);
  });

  test("되돌리기 기록이 섞여 있어도 그대로 보여준다", () => {
    assert.deepEqual(visibleDocumentLogs([revert, update, create]), [revert, update, create]);
  });

  test("기록이 아예 없으면 빈 목록이다", () => {
    assert.deepEqual(visibleDocumentLogs([]), []);
  });

  test("create 가 아닌 기록 하나만 있으면 감추지 않는다", () => {
    // 있을 수 없는 조합이지만, 조건을 "길이가 1"만으로 줄이면 여기서 깨진다.
    assert.deepEqual(visibleDocumentLogs([update]), [update]);
  });
});
