// 「수정 로그」에 무엇을 보여줄지 정하는 규칙 하나.
//
// 이건 수정 이력이다. 올리기만 하고 한 번도 고치지 않은 문서에 "최초 등록" 한 줄만
// 떠 있는 것은 알려주는 게 없다 — 올린 사람과 시각은 문서 자체(created_by·created_at)에
// 이미 남아 있다. 보관함 쪽도 같은 이유로 만든 기록을 뺐다
// (app/api/notes/[id]/logs/route.ts).
//
// 그렇다고 create 를 항상 지울 수는 없다. 문서에는 보관함에 없는 「되돌리기」가 있고,
// create 의 new_content 가 「처음 올렸을 때의 본문」이다. 한 번이라도 고친 문서에서
// 이 줄을 감추면 원본으로 돌아갈 길이 사라진다.
//
// 그래서 감추는 경우는 하나뿐이다 — 감출 것 말고는 아무것도 없을 때.
export function visibleDocumentLogs<T extends { action: string }>(logs: T[]): T[] {
  const onlyCreated = logs.length === 1 && logs[0].action === "create";
  return onlyCreated ? [] : logs;
}
