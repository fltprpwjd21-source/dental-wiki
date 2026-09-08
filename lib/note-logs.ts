// 보관함 「수정 기록」에 무엇을 어떤 이름으로 보여줄지 정하는 규칙.
//
// 화면에서 노트를 만들면 빈 내용으로 먼저 생기고(create_note, content: ""),
// 글을 써서 저장하는 순간 update_note 가 남는다. 그래서 처음 올린 자료가
// 「내용 수정」으로 표시됐다 — 고친 적이 없는데 고쳤다고 적혀 있던 것이다.
//
// 여기서 그 첫 저장을 「업로드」로 바꿔 부른다.
//   - update_note 가 있으면: 그중 가장 이른 것 하나가 업로드다
//   - 없으면(내용을 채운 채로 만들어진 노트): create_note 자체가 업로드다
//   - 폴더는 올린 내용이 없으므로 만든 기록을 빼기만 한다
// 결과적으로 노트에는 「업로드」 줄이 항상 정확히 하나 있다.
//
// upload_note 는 화면에서만 쓰는 이름이다 — DB(node_logs.action)에는 이 값이
// 없고, 넣어서도 안 된다(check 제약에 없다). 기록을 고치는 게 아니라
// 읽는 쪽에서 이름만 바꿔 부르는 것이다.
export const NOTE_UPLOAD_ACTION = "upload_note";

const CREATE_ACTIONS = ["create_note", "create_folder"];

export function visibleNoteLogs<T extends { action: string; created_at: string }>(
  logs: T[],
): T[] {
  // 가장 이른 것을 찾아야 하므로 시간순으로 훑는다.
  // (목록 자체는 호출한 쪽이 정한 순서를 그대로 유지한다)
  const oldestFirst = [...logs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const firstUpdate = oldestFirst.find((l) => l.action === "update_note");
  const create = oldestFirst.find((l) => l.action === "create_note");
  const uploadId = firstUpdate ?? create;

  return logs
    .filter((log) => log === uploadId || !CREATE_ACTIONS.includes(log.action))
    .map((log) => (log === uploadId ? { ...log, action: NOTE_UPLOAD_ACTION } : log));
}
