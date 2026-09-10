// 화면에 "누가"를 표시하는 규칙을 여기 하나로 모은다.
//
// 왜 한 곳에 모으는가
//   지금까지 화면마다 방식이 달랐다. 문서 수정 로그는 사원번호만 찍었고(2091643),
//   보관함 기록은 사원번호 뒤에 이름을 회색으로 붙였고, 공지는 등록할 때 저장해 둔
//   이름(author_name)을 쓰되 없으면 사원번호로 떨어졌다. 같은 사람이 화면마다
//   다르게 보였고, 사원번호로 뜨는 화면에서는 그게 누구인지 알 수 없었다.
//   2026-09-10 부터는 사람은 어디서나 실명으로 표시한다.
//
// 왜 "지금 이름"을 먼저 보는가
//   기록에 함께 저장해 둔 이름(스냅샷)만 쓰면 개명·오타 수정이 옛 기록에 반영되지
//   않는다. 설정 화면에서 이름을 고쳐도 예전 로그에는 옛 이름이 그대로 남는 것이다.
//   그래서 화이트리스트에 아직 있는 사람은 항상 지금 이름으로 보여준다.
//
// 왜 스냅샷을 남겨두는가
//   퇴사해서 화이트리스트에서 지워지면 지금 이름을 읽을 길이 없다. 그때 기록에
//   저장해 둔 당시 이름이 마지막 단서가 된다 — 기록 자체는 지우지 않는다는
//   원칙(PRD 5번②)을 이름에도 그대로 적용한다.
//
// 사원번호는 맨 마지막 수단이다
//   둘 다 없을 때만 사원번호를 보여준다. 아무것도 안 보여주는 것보다는 낫고,
//   "이름이 비어 있는 계정"을 화면에서 눈에 띄게 만드는 효과도 있다.

/** 화이트리스트에 이름이 반드시 있어야 하는가 — DB 제약과 등록 API가 함께 강제한다. */
export const NAME_REQUIRED = true;

// 빈 문자열·공백만 있는 이름은 없는 것으로 친다. 등록 API가 trim 후 거부하지만,
// 그 검사가 생기기 전에 들어간 값이 남아 있을 수 있다.
function usable(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 사람 하나를 화면에 어떻게 표시할지 정한다.
 *
 * @param employeeId 사원번호 (기록에 남아 있는 값)
 * @param currentName 화이트리스트에서 지금 읽은 이름. 퇴사자면 없다.
 * @param snapshotName 기록에 함께 저장돼 있던 당시 이름. 없는 기록도 있다.
 */
export function displayName(
  employeeId: string,
  currentName?: string | null,
  snapshotName?: string | null,
): string {
  return usable(currentName) ?? usable(snapshotName) ?? employeeId;
}

/**
 * 사원번호가 실명으로 바뀌지 않은 채 화면에 나가는지 판별한다.
 * 화면에서 "이름 없음"을 흐리게 처리할 때 쓴다.
 */
export function isUnnamed(
  employeeId: string,
  currentName?: string | null,
  snapshotName?: string | null,
): boolean {
  return displayName(employeeId, currentName, snapshotName) === employeeId;
}
