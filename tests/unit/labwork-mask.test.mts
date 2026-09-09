import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { maskName, patientLabel } from "../../lib/labwork/mask.ts";

// 왜 이 검사가 필요한가
//   가리는 규칙이 글자 수마다 다르다(2글자는 뒤, 3글자 이상은 가운데 한 글자).
//   그 경계는 눈으로 확인하기 어렵고, 잘못되면 환자 이름이 그대로 화면에 남는다 —
//   조용히 개인정보가 노출되는 종류의 실수라 사람이 알아채기 어렵다.
//   docs/01-plan/features/labwork.plan.md 3.3 의 규칙 표를 그대로 고정한다.
describe("환자 이름 가리기", () => {
  test("계획서 3.3 규칙 표와 일치한다", () => {
    assert.equal(maskName("김민수"), "김○수", "3글자는 가운데");
    assert.equal(maskName("김수"), "김○", "2글자는 뒤 — 앞을 가리면 성이 사라진다");
    assert.equal(maskName("남궁민수"), "남궁○수", "4글자도 가운데 한 글자");
    assert.equal(maskName("김"), "김", "1글자는 가릴 것이 없다");
  });

  test("가리는 글자는 항상 하나다", () => {
    // 두 글자 이상 가리면 알아보기 어려워진다. 목적은 전체 이름이 읽히지 않게 하는 것뿐이다.
    for (const name of ["김민수", "남궁민수", "박하늘별님구름햇님"]) {
      assert.equal([...maskName(name)].filter((c) => c === "○").length, 1, name);
    }
  });

  test("길이는 그대로 유지된다 (자리가 밀리지 않는다)", () => {
    for (const name of ["김수", "김민수", "남궁민수"]) {
      assert.equal(maskName(name).length, name.length, name);
    }
  });

  test("전체 이름이 그대로 남는 경우는 없다 (2글자 이상)", () => {
    for (const name of ["김수", "김민수", "남궁민수", "이영희"]) {
      assert.notEqual(maskName(name), name, `${name} 이 안 가려졌다`);
    }
  });

  test("앞뒤 공백은 털어낸다 (시트에서 자주 섞여 온다)", () => {
    assert.equal(maskName("  김민수 "), "김○수");
    assert.equal(maskName(""), "");
    assert.equal(maskName("   "), "");
  });
});

describe("환자 칸 표시", () => {
  test("이름과 차트번호를 함께 보여준다", () => {
    assert.equal(patientLabel("김민수", "12345"), "김○수 · 12345");
  });

  test("한쪽이 비어도 성립한다", () => {
    // 시트는 사람이 채우는 곳이라 한쪽이 비는 일이 실제로 생긴다.
    assert.equal(patientLabel("김민수", null), "김○수");
    assert.equal(patientLabel(null, "12345"), "12345");
    assert.equal(patientLabel("", ""), "—");
    assert.equal(patientLabel(null, null), "—");
  });

  test("차트번호만 있어도 이름은 만들어내지 않는다", () => {
    assert.ok(!patientLabel(null, "12345").includes("○"));
  });
});
