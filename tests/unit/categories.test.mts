import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_LABELS,
  CATEGORY_SUB,
  CATEGORY_TAB_LABELS,
  type DocumentCategory,
} from "../../lib/categories.ts";

// 왜 이 검사가 필요한가
//   카테고리는 DB의 document_category enum('handover','meeting','insurance','policy')과
//   짝이 맞아야 한다(20260828065522_init_schema.sql). 코드에만 카테고리를 추가하고
//   마이그레이션을 잊으면, 화면에는 새 탭이 보이는데 문서를 등록하는 순간 DB가 거부한다.
//   이 검사는 그 불일치를 배포 전에 잡는다. 카테고리를 늘릴 때는 마이그레이션과
//   이 테스트를 함께 고쳐야 한다.
describe("문서 카테고리", () => {
  test("DB enum과 같은 4가지로 고정되어 있다", () => {
    // 'meeting'은 20260908150000 마이그레이션에서 enum 에 추가했다.
    assert.deepEqual(Object.keys(CATEGORY_LABELS).sort(), [
      "handover",
      "insurance",
      "meeting",
      "policy",
    ]);
  });

  test("탭 라벨과 설명이 카테고리마다 빠짐없이 있다", () => {
    // 화면 세 곳(탭·제목·설명)이 서로 다른 지도를 쓰므로, 하나만 빠뜨리면
    // 그 카테고리 화면에서 빈칸이 뜬다.
    for (const key of Object.keys(CATEGORY_LABELS) as DocumentCategory[]) {
      assert.ok(CATEGORY_TAB_LABELS[key]?.trim(), `${key}에 탭 라벨이 없음`);
      assert.ok(CATEGORY_SUB[key]?.trim(), `${key}에 설명이 없음`);
    }
  });

  test("모든 카테고리에 한국어 이름이 있다", () => {
    for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
      assert.ok(label && label.trim().length > 0, `${key}에 이름이 없음`);
    }
  });

  test("PRD 6번에 정의된 이름과 일치한다", () => {
    const expected: Record<DocumentCategory, string> = {
      handover: "진료과별 인수인계",
      meeting: "회의록",
      insurance: "보험·비보험 수가",
      policy: "병원 내규·운영회칙",
    };
    assert.deepEqual(CATEGORY_LABELS, expected);
  });
});
