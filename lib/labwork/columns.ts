// 표에 어떤 칸이 어떤 순서로 서는지. 화면·저장·붙여넣기가 모두 이 목록 하나를 본다.
//
// 왜 한 곳에 모으는가
//   실제 구글 시트의 열 이름을 아직 못 봤다. 확인되면 여기만 고치면
//   화면의 칸 순서·붙여넣기 순서·저장 필드가 한꺼번에 따라온다.
//   화면 JSX 안에 칸을 늘어놓으면 그때 세 곳을 따로 고치게 되고, 하나를 빠뜨린다.
import type { LabworkDraft } from "./types";

export type LabworkColumnKind = "date" | "text" | "number" | "check";

export type LabworkColumn = {
  key: keyof LabworkDraft;
  label: string;
  kind: LabworkColumnKind;
  /** 화면에서 차지할 너비 (grid-template-columns 값) */
  width: string;
  /** 폰에서는 숨긴다 — 좁은 화면에 다 넣으면 아무것도 못 읽는다 */
  hideOnPhone?: boolean;
};

// 실제 시트(2026-09-10 확인)의 열 순서를 그대로 따른다.
// 쓰던 순서와 다르면 붙여넣기가 어긋나고, 눈도 매번 다시 찾아야 한다.
//   시트 13열 중 등록번호(B)·환자명(D)은 빠져 있다 — 환자를 특정하는 값이라
//   외부 클라우드인 지금 DB 에 저장하지 않는다. NAS 이전 후에 더한다.
export const LABWORK_COLUMNS: LabworkColumn[] = [
  { key: "lab", label: "기공소", kind: "text", width: "minmax(5.5rem, .9fr)" },
  { key: "ordered_on", label: "의뢰", kind: "date", width: "8.5rem", hideOnPhone: true },
  { key: "doctor", label: "의사", kind: "text", width: "minmax(4.5rem, .7fr)", hideOnPhone: true },
  { key: "kind", label: "보철물", kind: "text", width: "minmax(9rem, 1.6fr)" },
  { key: "tooth", label: "치식", kind: "text", width: "minmax(4rem, .7fr)", hideOnPhone: true },
  { key: "tooth_count", label: "치아", kind: "number", width: "3.5rem", hideOnPhone: true },
  { key: "ab_count", label: "AB", kind: "number", width: "3.5rem", hideOnPhone: true },
  { key: "due_on", label: "예정일", kind: "date", width: "8.5rem" },
  { key: "note", label: "기타사항", kind: "text", width: "minmax(7rem, 1.2fr)", hideOnPhone: true },
  { key: "arrived", label: "도착", kind: "check", width: "4rem" },
  { key: "extra", label: "구분", kind: "text", width: "minmax(5rem, .8fr)", hideOnPhone: true },
];

// 엑셀에서 복사하면 칸은 탭, 줄은 줄바꿈으로 붙는다(TSV).
// 붙여넣기를 지원하지 않으면 "엑셀 대신 쓸 수 있나"의 답이 그냥 아니오가 된다.
export function parsePastedGrid(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "") // 엑셀은 마지막에 줄바꿈 하나를 더 붙인다
    .split("\n")
    .map((line) => line.split("\t"));
}
