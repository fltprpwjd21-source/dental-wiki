// 기공물 화면이 받는 타입. 원본이 무엇이든 이 모양으로 들어온다.
//
// 왜 타입을 따로 두는가
//   지금 원본은 구글 시트지만, NAS 로 옮기면 우리 DB 가 원본이 된다
//   (docs/01-plan/features/labwork.plan.md 7.2 결정 2).
//   그때 화면과 API 를 다시 만들지 않으려면, 화면이 "시트 한 행"을 아는 게 아니라
//   이 타입만 알아야 한다. 원본을 갈아끼우는 일이 lib/labwork/source.ts 한 파일로 끝난다.
//
// 환자 이름·차트번호가 이 타입에 있는 것은 화면에 그리기 위해서다.
//   우리 DB 에 저장하지 않는다. 화면에 그릴 때는 mask.ts 를 거친다.

/** 도착 예정일을 오늘과 비교한 결과. 색과 정렬 순서가 여기서 갈린다. */
export type LabworkState = "late" | "today" | "upcoming" | "arrived";

export type LabworkItem = {
  /** 원본에서 이 항목을 다시 찾아가기 위한 식별자 (시트라면 행 번호) */
  sourceId: string;
  /** 기공물 종류 — 지르코니아·PFM·틀니 등 */
  kind: string;
  /** 기공소 이름 */
  lab: string;
  /** 환자 이름 원문. 화면에 그릴 때 maskName() 을 거친다 */
  patientName: string | null;
  patientChartNo: string | null;
  /** 의뢰일 (YYYY-MM-DD) */
  orderedOn: string | null;
  /** 도착 예정일 (YYYY-MM-DD) */
  dueOn: string | null;
  /** 실제로 도착했는지 */
  arrived: boolean;
};

/** 화면에 그리기 위해 상태와 D-day 를 붙인 것 */
export type LabworkRow = LabworkItem & {
  state: LabworkState;
  /** 예정일까지 남은 날 수. 음수면 지났다. 예정일이 없으면 null */
  daysLeft: number | null;
};

// 시트를 못 읽었을 때 빈 목록으로 넘기지 않는다.
//   빈 목록은 "오늘 올 게 없다"와 구별되지 않아, 고장을 정상으로 보이게 만든다.
//   그래서 읽기 결과는 성공/실패를 명시적으로 담아 돌려준다.
export type LabworkLoadResult =
  | { ok: true; rows: LabworkRow[] }
  | { ok: false; reason: "auth" | "columns" | "unreachable"; detail: string };

export const LABWORK_LOAD_MESSAGE: Record<
  Exclude<LabworkLoadResult, { ok: true }>["reason"],
  string
> = {
  auth: "기공물 시트에 접근할 수 없습니다. 시트 공유 설정을 확인해주세요.",
  columns: "시트 열 구성이 바뀐 것 같습니다. 첫 줄의 열 이름을 확인해주세요.",
  unreachable: "기공물 시트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
};

// ── 시제품(우리 DB 저장) 쪽 타입 ──────────────────────────────────────
//
// 위쪽 LabworkItem 은 "시트를 읽어 보여주는" 화면이 쓰는 타입이고,
// 아래는 "표에 직접 입력하는" 시제품이 쓰는 타입이다. 지금은 둘이 따로 있다 —
// 원본을 어디에 둘지가 아직 정해지지 않았기 때문이다(NAS 이전 후 판단).
// 하나로 합치는 것은 그 결정이 난 뒤에 한다. 미리 합치면 안 쓰는 필드가 생긴다.

/** 표 한 줄에서 사람이 고칠 수 있는 칸들. 실제 시트 13열을 그 순서 그대로 담는다. */
export type LabworkDraft = {
  lab: string;              // 기공소 (A)
  patient_chart_no: string; // 등록번호 (B)
  ordered_on: string;       // 의뢰 (C) — YYYY-MM-DD, 빈 문자열 허용
  patient_name: string;     // 환자명 (D)
  doctor: string;           // 의사 (E)
  kind: string;             // 보철물 (F)
  tooth: string;            // 치식 (G) — "16", "14,15,16" 처럼 여러 개일 수 있어 글자다
  tooth_count: string;      // 치아개수 (H) — 화면에서는 글자로 다루고 저장할 때 숫자로 바꾼다
  ab_count: string;         // AB개수 (I)
  due_on: string;           // 예정일 (J)
  note: string;             // 기타사항 = 비고 (K)
  arrived_on: string;       // 도착일 (L) — 이 값이 있으면 도착한 것이다
  oral_scan: boolean;       // 구강스캔 (M) — 해당하는 경우에만 체크
};

/** 어느 시트인지. 구조가 같아 한 표에 담고 화면에서 탭으로 나눈다. */
export type LabworkScope = "external" | "internal";

export const LABWORK_SCOPES: { key: LabworkScope; label: string; hint: string }[] = [
  { key: "external", label: "외부", hint: "기공소로 나가는 시트" },
  { key: "internal", label: "내부", hint: "병원 내부용 시트" },
];

export type LabworkRecord = LabworkDraft & {
  id: string;
  seq: number;
  updated_at: string;
};

export const EMPTY_DRAFT: LabworkDraft = {
  lab: "",
  patient_chart_no: "",
  ordered_on: "",
  patient_name: "",
  doctor: "",
  kind: "",
  tooth: "",
  tooth_count: "",
  ab_count: "",
  due_on: "",
  note: "",
  arrived_on: "",
  oral_scan: false,
};

// 내부시트는 기공실에서 만든다. 기공소 칸을 지우지 않고 이 값을 미리 채워 둔다 —
// 두 시트의 열이 같아야 화면·붙여넣기·나중의 합산 통계가 한 벌로 끝난다.
export const INTERNAL_LAB_NAME = "기공실";
