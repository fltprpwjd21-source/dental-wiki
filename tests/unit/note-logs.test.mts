import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { visibleNoteLogs, NOTE_UPLOAD_ACTION } from "../../lib/note-logs.ts";

// 왜 이 검사가 필요한가
//   보관함 노트는 빈 내용으로 먼저 생기고(create_note), 글을 써서 저장할 때
//   update_note 가 남는다. 그래서 처음 올린 자료가 「내용 수정」으로 표시됐다.
//   첫 저장을 「업로드」로 부르는 규칙이 여기 걸린다 — 노트마다 업로드 줄이
//   정확히 하나여야 하고, 두 번째 저장부터는 수정이어야 한다.
const at = (n: number) => `2026-09-0${n}T00:00:00Z`;

describe("보관함 기록 표시 규칙", () => {
  test("만들고 처음 저장하면 그 저장이 「업로드」다", () => {
    const shown = visibleNoteLogs([
      { id: "u1", action: "update_note", created_at: at(2) },
      { id: "c", action: "create_note", created_at: at(1) },
    ]);
    assert.deepEqual(shown.map((l) => [l.id, l.action]), [["u1", NOTE_UPLOAD_ACTION]]);
  });

  test("두 번째 저장부터는 수정이다", () => {
    const shown = visibleNoteLogs([
      { id: "u2", action: "update_note", created_at: at(3) },
      { id: "u1", action: "update_note", created_at: at(2) },
      { id: "c", action: "create_note", created_at: at(1) },
    ]);
    assert.deepEqual(shown.map((l) => [l.id, l.action]), [
      ["u2", "update_note"],
      ["u1", NOTE_UPLOAD_ACTION],
    ]);
  });

  test("업로드 줄은 항상 하나뿐이다", () => {
    const logs = [
      { id: "u3", action: "update_note", created_at: at(4) },
      { id: "u2", action: "update_note", created_at: at(3) },
      { id: "u1", action: "update_note", created_at: at(2) },
      { id: "c", action: "create_note", created_at: at(1) },
    ];
    const uploads = visibleNoteLogs(logs).filter((l) => l.action === NOTE_UPLOAD_ACTION);
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].id, "u1", "가장 이른 저장이어야 한다");
  });

  test("내용을 채운 채로 만들어진 노트는 만든 기록 자체가 업로드다", () => {
    // 지금 화면은 빈 내용으로 만들지만, 공지·문서에서 옮겨오는 길이 생기면
    // update_note 없이 create_note 만 남는다. 그때 업로드 줄이 사라지면 안 된다.
    const shown = visibleNoteLogs([{ id: "c", action: "create_note", created_at: at(1) }]);
    assert.deepEqual(shown.map((l) => [l.id, l.action]), [["c", NOTE_UPLOAD_ACTION]]);
  });

  test("폴더는 만든 기록을 보여주지 않는다 (올린 내용이 없다)", () => {
    const shown = visibleNoteLogs([
      { id: "r", action: "rename", created_at: at(2) },
      { id: "f", action: "create_folder", created_at: at(1) },
    ]);
    assert.deepEqual(shown.map((l) => [l.id, l.action]), [["r", "rename"]]);
  });

  test("첨부는 업로드와 따로 남는다 (노트 본문과 다른 일이다)", () => {
    const shown = visibleNoteLogs([
      { id: "a", action: "upload_attachment", created_at: at(3) },
      { id: "u1", action: "update_note", created_at: at(2) },
      { id: "c", action: "create_note", created_at: at(1) },
    ]);
    assert.deepEqual(shown.map((l) => [l.id, l.action]), [
      ["a", "upload_attachment"],
      ["u1", NOTE_UPLOAD_ACTION],
    ]);
  });

  test("들어온 순서를 바꾸지 않는다 (화면은 최신순으로 받는다)", () => {
    const shown = visibleNoteLogs([
      { id: "t", action: "trash", created_at: at(4) },
      { id: "u2", action: "update_note", created_at: at(3) },
      { id: "u1", action: "update_note", created_at: at(2) },
      { id: "c", action: "create_note", created_at: at(1) },
    ]);
    assert.deepEqual(shown.map((l) => l.id), ["t", "u2", "u1"]);
  });
});
