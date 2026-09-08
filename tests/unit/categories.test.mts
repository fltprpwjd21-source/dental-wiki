import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_LABELS,
  CATEGORY_SUB,
  CATEGORY_TAB_LABELS,
  type DocumentCategory,
} from "../../lib/categories.ts";

// 왜 이 검사가 필요한가
//   카테고리 목록은 DB의 document_category enum 과 어긋나면 안 된다
//   (20260828065522_init_schema.sql, 20260908150000_meeting_category_and_read_only.sql).
//   코드에만 카테고리를 추가하고 마이그레이션을 잊으면, 화면에는 새 탭이 보이는데
//   문서를 등록하는 순간 DB가 거부한다. 이 검사는 그 불일치를 배포 전에 잡는다.
//
//   방향은 한쪽만 본다 — 코드의 카테고리는 모두 enum 에 있어야 하지만, 그 역은 아니다.
//   'handover'(진료과별 인수인계)는 2026-09-08 에 화면에서 뺐고 enum 에는 남아 있다.
//   Postgres 는 enum 값을 지울 수 없다. 이미 등록된 문서의 category 열이 그 값을
//   가리키고 있어서 지우면 그 행을 읽을 수 없게 되기 때문이다.
const DB_ENUM_VALUES = ["handover", "meeting", "insurance", "policy"];

describe("문서 카테고리", () => {
  test("화면에 쓰는 카테고리는 세 가지다", () => {
    assert.deepEqual(Object.keys(CATEGORY_LABELS).sort(), ["insurance", "meeting", "policy"]);
  });

  test("모두 DB enum 에 있는 값이다", () => {
    for (const key of Object.keys(CATEGORY_LABELS)) {
      assert.ok(DB_ENUM_VALUES.includes(key), `${key} 는 document_category enum 에 없음`);
    }
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
      meeting: "회의록",
      insurance: "보험·비보험 수가",
      policy: "병원 내규·운영회칙",
    };
    assert.deepEqual(CATEGORY_LABELS, expected);
  });
});
