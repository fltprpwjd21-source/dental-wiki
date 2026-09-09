import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseLooseDate, formatDate } from "../../lib/labwork/date.ts";

// 왜 이 검사가 필요한가
//   지금 쓰는 기공물 시트에는 "9/8" 과 "9월 15일" 이 한 표 안에 섞여 있다.
//   달력 위젯을 쓰면 이걸 칠 수가 없어 표가 엑셀보다 불편해진다. 그래서 글자로 받아 읽는데,
//   읽는 규칙이 틀리면 엉뚱한 날짜가 조용히 저장된다 — 화면에는 멀쩡한 날짜로 보인다.
const 오늘 = new Date("2026-09-10T00:00:00Z");

describe("기공물 날짜 읽기", () => {
  test("지금 시트에 실제로 적혀 있는 모양들을 읽는다", () => {
    assert.equal(parseLooseDate("9/8", 오늘), "2026-09-08");
    assert.equal(parseLooseDate("9월 15일", 오늘), "2026-09-15");
    assert.equal(parseLooseDate("9월15일", 오늘), "2026-09-15");
  });

  test("다른 흔한 모양도 받는다", () => {
    assert.equal(parseLooseDate("2026-09-08", 오늘), "2026-09-08");
    assert.equal(parseLooseDate("2026.9.8", 오늘), "2026-09-08");
    assert.equal(parseLooseDate("9-8", 오늘), "2026-09-08");
    assert.equal(parseLooseDate("0908", 오늘), "2026-09-08");
    assert.equal(parseLooseDate("2026년 9월 8일", 오늘), "2026-09-08");
    assert.equal(parseLooseDate("  9/8  ", 오늘), "2026-09-08");
  });

  test("연도를 안 적으면 올해로 본다", () => {
    assert.equal(parseLooseDate("12/25", 오늘), "2026-12-25");
  });

  test("연말에 「1/5」를 치면 내년으로 본다", () => {
    // 그냥 올해로 두면 작년 1월이 되어 「지남」으로 잘못 뜬다.
    // 기공물은 몇 달 뒤까지 잡지, 반년 전으로 새로 잡지 않는다.
    const 연말 = new Date("2026-12-20T00:00:00Z");
    assert.equal(parseLooseDate("1/5", 연말), "2027-01-05");
    assert.equal(parseLooseDate("12/25", 연말), "2026-12-25", "가까운 미래는 올해 그대로");
  });

  test("없는 날짜는 받지 않는다", () => {
    // 2월 31일을 그냥 넘기면 Date 가 3월로 바꿔 버려, 친 적 없는 날이 저장된다.
    assert.equal(parseLooseDate("2/31", 오늘), null);
    assert.equal(parseLooseDate("13/1", 오늘), null);
    assert.equal(parseLooseDate("9/32", 오늘), null);
    assert.equal(parseLooseDate("2026-02-30", 오늘), null);
  });

  test("날짜가 아닌 글자는 null 이다 (덜 친 값을 저장하지 않는다)", () => {
    for (const bad of ["", "   ", "내일", "9월", "abc", "9/", "/8"]) {
      assert.equal(parseLooseDate(bad, 오늘), null, `"${bad}"`);
    }
  });
});

describe("기공물 날짜 보여주기", () => {
  test("올해면 연도를 뺀다 (표에서 한 칸이라도 좁게)", () => {
    assert.equal(formatDate("2026-09-08", 오늘), "9/8");
  });

  test("다른 해면 연도를 붙인다", () => {
    assert.equal(formatDate("2025-12-31", 오늘), "2025. 12/31");
  });

  test("빈 값은 빈 글자다", () => {
    assert.equal(formatDate(null, 오늘), "");
  });
});
