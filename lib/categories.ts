export type DocumentCategory = "handover" | "meeting" | "insurance" | "policy";

// 탭에 보이는 순서 그대로다.
export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  handover: "진료과별 인수인계",
  meeting: "회의록",
  insurance: "보험·비보험 수가",
  policy: "병원 내규·운영회칙",
};

// 탭 라벨은 짧게, 화면 제목은 길게 쓴다.
// 탭 일곱 개가 한 줄에 들어가야 해서 "진료과별 인수인계"를 그대로 못 쓴다.
export const CATEGORY_TAB_LABELS: Record<DocumentCategory, string> = {
  handover: "인수인계",
  meeting: "회의록",
  insurance: "수가·비보험",
  policy: "내규",
};

export const CATEGORY_SUB: Record<DocumentCategory, string> = {
  handover: "진료과별 업무 인수인계",
  meeting: "부서 회의와 컨퍼런스 기록",
  insurance: "보험 산정기준과 비보험 항목 단가",
  policy: "병원 내규와 운영회칙",
};
