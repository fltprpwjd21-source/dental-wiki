// 표에 어떤 칸이 어떤 순서로 서는지. 화면·저장·붙여넣기가 모두 이 목록 하나를 본다.
//
// 왜 한 곳에 모으는가
//   실제 구글 시트의 열 이름을 아직 못 봤다. 확인되면 여기만 고치면
//   화면의 칸 순서·붙여넣기 순서·저장 필드가 한꺼번에 따라온다.
//   화면 JSX 안에 칸을 늘어놓으면 그때 세 곳을 따로 고치게 되고, 하나를 빠뜨린다.
import type { LabworkColumnKey } from "./types";

export type LabworkColumnKind = "date" | "text" | "number" | "check";

export type LabworkColumn = {
  key: LabworkColumnKey;
  label: string;
  kind: LabworkColumnKind;
  /** 화면에서 차지할 너비 (grid-template-columns 값) */
  width: string;
  /** 폰에서는 숨긴다 — 좁은 화면에 다 넣으면 아무것도 못 읽는다 */
  hideOnPhone?: boolean;
};

// 실제 시트(2026-09-10 확인) A~M 열을 그 순서 그대로 세운다.
// 쓰던 순서와 다르면 붙여넣기가 어긋나고, 눈도 매번 다시 찾아야 한다.
export const LABWORK_COLUMNS: LabworkColumn[] = [
  // 기공소 이름은 세 글자가 대부분이다. 늘려 두면 오른쪽 칸들이 밀린다.
  { key: "lab", label: "기공소", kind: "text", width: "4.5rem" },
  { key: "patient_chart_no", label: "등록번호", kind: "text", width: "5.5rem" },
  // 날짜는 "9/8" 로 짧게 보여주므로 칸도 그만큼만 있으면 된다.
  { key: "ordered_on", label: "의뢰", kind: "date", width: "4rem", hideOnPhone: true },
  { key: "patient_name", label: "환자명", kind: "text", width: "4.5rem" },
  { key: "doctor", label: "의사", kind: "text", width: "4.5rem", hideOnPhone: true },
  { key: "kind", label: "보철물", kind: "text", width: "minmax(8rem, 1.6fr)" },
  { key: "tooth", label: "치식", kind: "text", width: "minmax(3.5rem, .7fr)", hideOnPhone: true },
  { key: "tooth_count", label: "치아", kind: "number", width: "3.2rem", hideOnPhone: true },
  { key: "ab_count", label: "AB", kind: "number", width: "3.2rem", hideOnPhone: true },
  { key: "due_on", label: "예정일", kind: "date", width: "5rem" },
  { key: "note", label: "비고", kind: "text", width: "minmax(6rem, 1.2fr)", hideOnPhone: true },
  // 이름을 「도착일」에서 「예정일」로 바꿨다 (2026-09-10 사용자 지시).
  //   앞의 J열과 이름이 같아진다. 사용자가 그 점을 확인한 뒤 고른 것이다.
  //
  //   주의: 이 칸에 값이 들어가면 그 줄은 「도착 완료」로 취급되어 아래로 내려간다.
  //   저장되는 값은 arrived_on 이고, 도착 체크·정렬·연한 하늘색이 모두 이 칸을 본다.
  { key: "arrived_on", label: "예정일", kind: "date", width: "5rem" },
  // 구강스캔인 경우에만 체크한다. 글자로 두면 매번 손으로 치게 되고 오타가 집계에서 빠진다.
  { key: "oral_scan", label: "구강스캔", kind: "check", width: "4.5rem" },
  // 도착 확인용 체크. 저장되는 값은 앞의 「도착일」 하나뿐이다 —
  // 체크하면 오늘 날짜가 그리로 들어가고, 풀면 지워진다 (types.ts ARRIVED_CHECK_KEY).
  { key: "arrived", label: "도착", kind: "check", width: "3.5rem" },
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
