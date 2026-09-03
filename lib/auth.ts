import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";
import { getServerSupabaseClient } from "@/lib/supabase/server";

// 화면·API에서 쓰는 세션 정보. isAdmin은 토큰이 아니라 DB에서 읽은 최신 값이다.
export type Session = {
  employeeId: string;
  isAdmin: boolean;
};

// 서버 컴포넌트/라우트에서 현재 로그인한 세션을 읽을 때 사용
//
// 쿠키 서명만 확인하는 것으로는 부족하다. 세션 토큰은 서버가 무효화할 수 없는 HMAC
// 방식이라, 화이트리스트에서 비활성화하거나 관리자에서 강등해도 토큰이 만료될 때까지
// (최대 8시간) 그대로 통과한다. 그래서 요청마다 DB에서 아래 두 가지를 다시 확인한다.
//   - is_active: false면 세션을 무효로 처리 → 비활성화가 즉시 반영된다 (PRD 7번)
//   - is_admin : 항상 DB의 최신 값을 사용 → 관리자 강등이 즉시 반영된다
//
// cache()로 감싸 같은 요청 안에서는 몇 번 호출해도 DB 조회가 한 번만 일어나게 한다.
// (예: AppHeader와 페이지 본문이 각각 getSession()을 호출한다)
export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const payload = verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!payload) return null;

  const supabase = getServerSupabaseClient();
  const { data: employee, error } = await supabase
    .from("employee_whitelist")
    .select("is_admin, is_active")
    .eq("employee_id", payload.employeeId)
    .maybeSingle();

  // 조회 실패·삭제된 사원번호·비활성화된 사원번호는 모두 로그아웃 상태로 취급한다
  if (error || !employee || !employee.is_active) return null;

  return { employeeId: payload.employeeId, isAdmin: employee.is_admin };
});
