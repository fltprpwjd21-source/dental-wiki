import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_LABELS, type DocumentCategory } from "../../lib/categories.ts";

// 왜 이 검사가 필요한가
//   카테고리는 DB의 document_category enum('handover','insurance','policy')과
//   짝이 맞아야 한다(20260828065522_init_schema.sql). 코드에만 카테고리를 추가하고
//   마이그레이션을 잊으면, 화면에는 새 탭이 보이는데 문서를 등록하는 순간 DB가 거부한다.
//   이 검사는 그 불일치를 배포 전에 잡는다. 카테고리를 늘릴 때는 마이그레이션과
//   이 테스트를 함께 고쳐야 한다.
describe("문서 카테고리", () => {
  test("DB enum과 같은 3가지로 고정되어 있다", () => {
    assert.deepEqual(Object.keys(CATEGORY_LABELS).sort(), ["handover", "insurance", "policy"]);
  });

  test("모든 카테고리에 한국어 이름이 있다", () => {
    for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
      assert.ok(label && label.trim().length > 0, `${key}에 이름이 없음`);
    }
  });

  test("PRD 6번에 정의된 이름과 일치한다", () => {
    const expected: Record<DocumentCategory, string> = {
      handover: "진료과별 인수인계",
      insurance: "보험·비보험 수가",
      policy: "병원 내규·운영회칙",
    };
    assert.deepEqual(CATEGORY_LABELS, expected);
  });
});
