import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isUuid } from "../../lib/uuid.ts";

// 왜 이 검사가 필요한가
//   문서 id는 uuid다. 주소창에 uuid가 아닌 값이 들어오면 DB가 형식 오류를 내고
//   그것이 500(서버 오류)으로 나가버렸다. 사용자 잘못을 서버 잘못으로 보고하면
//   에러 로그가 오염되어 진짜 장애를 찾기 어려워진다.
describe("isUuid", () => {
  test("올바른 uuid는 통과한다", () => {
    assert.equal(isUuid("69e33beb-27df-4241-bea3-d1634860867a"), true);
    assert.equal(isUuid("00000000-0000-0000-0000-000000000000"), true);
  });

  test("대문자 uuid도 통과한다 (DB가 대소문자를 구분하지 않는다)", () => {
    assert.equal(isUuid("69E33BEB-27DF-4241-BEA3-D1634860867A"), true);
  });

  test("uuid가 아닌 값은 거부한다", () => {
    for (const bad of [
      "x",
      "",
      "abc",
      "69e33beb27df4241bea3d1634860867a", // 하이픈 없음
      "69e33beb-27df-4241-bea3", // 짧음
      "69e33beb-27df-4241-bea3-d1634860867a-extra", // 김
      "69e33beb-27df-4241-bea3-d1634860867g", // g는 16진수가 아님
      "  69e33beb-27df-4241-bea3-d1634860867a  ", // 공백
    ]) {
      assert.equal(isUuid(bad), false, `거부해야 함: ${JSON.stringify(bad)}`);
    }
  });

  test("SQL이 섞인 입력도 거부한다", () => {
    assert.equal(isUuid("'; drop table documents; --"), false);
    assert.equal(isUuid("1 OR 1=1"), false);
  });
});
