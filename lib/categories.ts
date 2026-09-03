export type DocumentCategory = "handover" | "insurance" | "policy";

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  handover: "진료과별 인수인계",
  insurance: "보험·비보험 수가",
  policy: "병원 내규·운영회칙",
};
