// 표에서 줄을 세우는 규칙 하나.
//
// 안 온 것이 위, 끝난 것이 아래다. 훑어 내릴 때 위쪽만 보면 할 일이 다 보인다.
//
// 순수 함수로 떼어 둔 이유
//   "의뢰일 순인데 날짜가 빈 줄은 어디로 가는가", "같은 날 도착한 것끼리는 어느 쪽이
//   위인가" 같은 것은 눈으로 확인하기 어렵다. 함수로 두면 규칙을 테스트에 적어 고정할 수 있다.
//   (tests/unit/labwork-sort.test.mts)
export type SortableRow = {
  id: string;
  seq: number;
  ordered_on: string | null;
  arrived_on: string | null;
  updated_at: string;
};

const LAST = "9999-99-99";

export function compareLabwork(a: SortableRow, b: SortableRow): number {
  const aDone = a.arrived_on ? 1 : 0;
  const bDone = b.arrived_on ? 1 : 0;
  // 1. 안 온 것이 먼저.
  if (aDone !== bDone) return aDone - bDone;

  if (aDone === 1) {
    // 2. 끝난 것끼리는 「의뢰일」이 먼저다 (2026-09-10 사용자 결정).
    //
    //    도착일로 세우면 의뢰일이 뒤죽박죽 섞인다 — 실제로 그렇게 보였다.
    //    같은 날 의뢰한 둘 중 하나가 한참 늦게 완성돼 나중에 체크되더라도,
    //    그 줄은 자기 의뢰일 자리로 들어가야 한다.
    //
    //    방향은 안 온 것과 반대다. 오래된 의뢰가 아래로 내려간다 —
    //    끝난 일은 오래될수록 볼 일이 없으므로 멀리 밀어 둔다.
    const ao = a.ordered_on ?? "";
    const bo = b.ordered_on ?? "";
    if (ao !== bo) return ao < bo ? 1 : -1;

    //    같은 의뢰일 안에서는 늦게 완성된 것이 위다 — 방금 끝낸 것이 눈에 가깝다.
    if (a.arrived_on !== b.arrived_on) return (a.arrived_on ?? "") < (b.arrived_on ?? "") ? 1 : -1;
    //    도착일은 날짜뿐이라 같은 날이 여럿이다. 그때는 마지막으로 손댄 시각으로 가른다.
    if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? 1 : -1;
    return b.seq - a.seq;
  }

  // 3. 안 온 것끼리는 의뢰일 순.
  //    의뢰일이 빈 줄은 맨 위에 둔다 — 방금 만들어 아직 아무것도 안 적은 줄이라,
  //    지금 손대야 할 줄이다. 아래로 보내면 새 줄을 만들 때마다 찾아 내려가야 한다.
  const aNew = !a.ordered_on;
  const bNew = !b.ordered_on;
  if (aNew !== bNew) return aNew ? -1 : 1;
  if (aNew && bNew) return b.seq - a.seq; // 갓 만든 줄끼리는 최근 것이 위

  const ao = a.ordered_on ?? LAST;
  const bo = b.ordered_on ?? LAST;
  if (ao !== bo) return ao < bo ? -1 : 1;
  return a.seq - b.seq;
}

export function sortLabwork<T extends SortableRow>(rows: T[]): T[] {
  return [...rows].sort(compareLabwork);
}
