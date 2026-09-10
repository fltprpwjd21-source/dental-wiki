import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { displayName, isUnnamed } from "../../lib/employee-names.ts";

// 왜 이 검사가 필요한가
//   "사람은 어디서나 실명으로 보인다"는 규칙(2026-09-10)이 화면마다 다시 구현되면
//   또 어긋난다. 규칙은 displayName() 하나뿐이고, 그 우선순위가 여기 고정돼 있다.
//   특히 개명 반영(현재 이름 우선)과 퇴사자 보존(스냅샷 폴백)은 서로 반대 방향으로
//   당기는 요구라, 순서가 뒤집히면 둘 중 하나가 조용히 깨진다.
describe("사람 표시 이름", () => {
  test("화이트리스트에 있으면 지금 이름으로 보여준다", () => {
    assert.equal(displayName("2091643", "김치과"), "김치과");
  });

  test("개명하면 옛 기록에도 새 이름이 반영된다 — 스냅샷보다 지금 이름이 우선한다", () => {
    assert.equal(displayName("2091643", "김새이름", "김옛이름"), "김새이름");
  });

  test("퇴사해서 지금 이름이 없으면 기록에 남은 당시 이름을 쓴다", () => {
    assert.equal(displayName("2091643", null, "김퇴사"), "김퇴사");
  });

  test("둘 다 없으면 사원번호를 그대로 보여준다", () => {
    assert.equal(displayName("2091643"), "2091643");
    assert.equal(displayName("2091643", null, null), "2091643");
  });

  test("공백뿐인 이름은 이름이 없는 것으로 친다", () => {
    assert.equal(displayName("2091643", "   "), "2091643");
    assert.equal(displayName("2091643", "  ", " 김스냅 "), "김스냅");
  });

  test("이름 앞뒤 공백은 지우고 보여준다", () => {
    assert.equal(displayName("2091643", "  김치과  "), "김치과");
  });

  test("isUnnamed 는 사원번호로 떨어진 경우에만 참이다", () => {
    assert.equal(isUnnamed("2091643"), true);
    assert.equal(isUnnamed("2091643", "김치과"), false);
    assert.equal(isUnnamed("2091643", null, "김퇴사"), false);
  });
});
