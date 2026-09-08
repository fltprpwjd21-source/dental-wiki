export type DocumentCategory = "meeting" | "insurance" | "policy";

// 탭에 보이는 순서 그대로다.
//
// 「진료과별 인수인계」는 2026-09-08 에 뺐다 — 인수인계 자료는 보관함에서 꺼내 쓰기로 했다.
// DB의 document_category enum 에는 'handover' 가 그대로 남아 있다.
// Postgres 는 enum 값을 지울 수 없고, 지울 필요도 없다 —
// 코드에서 이 목록에 없는 카테고리는 화면에도 없고(/categories/handover 는 404),
// 새 문서 등록도 막힌다(app/api/documents/route.ts).
export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  meeting: "회의록",
  insurance: "보험·비보험 수가",
  policy: "병원 내규·운영회칙",
};

// 탭 라벨은 짧게, 화면 제목은 길게 쓴다.
export const CATEGORY_TAB_LABELS: Record<DocumentCategory, string> = {
  meeting: "회의록",
  insurance: "수가·비보험",
  policy: "내규",
};

export const CATEGORY_SUB: Record<DocumentCategory, string> = {
  meeting: "부서 회의와 컨퍼런스 기록",
  insurance: "보험 산정기준과 비보험 항목 단가",
  policy: "병원 내규와 운영회칙",
};
