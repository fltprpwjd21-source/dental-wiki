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
// 방식이라, 화이트리스트에서 계정을 지우거나 관리자에서 강등해도 토큰이 만료될 때까지
// (최대 8시간) 그대로 통과한다. 그래서 요청마다 DB에서 아래 두 가지를 다시 확인한다.
//   - 계정이 아직 남아있는지: 없으면 세션을 무효로 처리 → 퇴사자 삭제가 즉시 반영된다 (PRD 7번)
//   - is_admin: 항상 DB의 최신 값을 사용 → 관리자 강등이 즉시 반영된다
//
// cache()로 감싸 같은 요청 안에서는 몇 번 호출해도 DB 조회가 한 번만 일어나게 한다.
// (예: AppHeader와 페이지 본문이 각각 getSession()을 호출한다)
//
// 다만 이 DB 조회 자체가 버튼 클릭마다(=매 API 요청마다) 발생해서, "즉시 반영"의
// 대가로 클릭할 때마다 Supabase 왕복이 하나씩 더 붙어 체감 지연이 컸다(2026-09-04
// 실측 400~900ms). 그래서 조회 결과를 서버 메모리에 30초만 캐싱한다 — 화이트리스트
// 삭제·강등 반영이 "즉시"에서 "최대 30초 지연"으로 바뀌는 트레이드오프를 사용자와
// 합의하고 적용했다. DB 오류(네트워크 문제 등)는 캐싱하지 않는다 — 일시적 장애를
// 30초짜리 로그아웃으로 굳히지 않기 위해서다.
const WHITELIST_CACHE_TTL_MS = 30 * 1000;
type WhitelistCacheEntry = { found: true; isAdmin: boolean; expiresAt: number } | { found: false; expiresAt: number };
const whitelistCache = new Map<string, WhitelistCacheEntry>();

export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const payload = verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!payload) return null;

  const cached = whitelistCache.get(payload.employeeId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.found ? { employeeId: payload.employeeId, isAdmin: cached.isAdmin } : null;
  }

  const supabase = getServerSupabaseClient();
  const { data: employee, error } = await supabase
    .from("employee_whitelist")
    .select("is_admin")
    .eq("employee_id", payload.employeeId)
    .maybeSingle();

  // 조회 자체가 실패했다면(네트워크 오류 등) 캐싱하지 않고 이번 요청만 로그아웃 취급한다.
  if (error) return null;

  // 삭제된(=퇴사한) 사원번호는 로그아웃 상태로 취급하고, 이 결과도 30초간 캐싱한다.
  if (!employee) {
    whitelistCache.set(payload.employeeId, { found: false, expiresAt: Date.now() + WHITELIST_CACHE_TTL_MS });
    return null;
  }

  whitelistCache.set(payload.employeeId, {
    found: true,
    isAdmin: employee.is_admin,
    expiresAt: Date.now() + WHITELIST_CACHE_TTL_MS,
  });
  return { employeeId: payload.employeeId, isAdmin: employee.is_admin };
});
