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
