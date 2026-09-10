import { getServerSupabaseClient } from "@/lib/supabase/server";

// 사원번호 목록에 대한 "지금 이름"을 한 번에 읽는다.
// (순수 규칙은 lib/employee-names.ts 에 있다 — 공지의 notices/notices-server 와 같은 구성)
//
// 조회에 실패해도 예외를 던지지 않고 빈 Map 을 돌려준다. 이름을 못 붙이면
// displayName() 이 스냅샷이나 사원번호로 떨어질 뿐이지만, 여기서 던지면
// 로그 목록 전체가 500 이 된다 — 이름 때문에 기록을 못 보는 쪽이 훨씬 나쁘다.
export async function fetchEmployeeNames(
  employeeIds: readonly string[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(employeeIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return new Map();

  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("employee_whitelist")
      .select("employee_id, name")
      .in("employee_id", ids);

    if (error) {
      console.error("[employee-names] 이름 조회 실패", error);
      return new Map();
    }

    return new Map(
      (data ?? []).map((row) => [row.employee_id as string, row.name as string | null]),
    );
  } catch (error) {
    console.error("[employee-names] 이름 조회 실패", error);
    return new Map();
  }
}
