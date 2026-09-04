import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 브라우저에서만 사용. 이 키는 공개용이라 노출돼도 안전하다 — 이 프로젝트는
// 테이블 접근을 전부 anon/authenticated 롤에서 회수해뒀고(RLS 마이그레이션 참고),
// Storage도 signed URL의 토큰이 실제 권한을 부여하므로 이 키 자체는 아무 권한도 주지 않는다.
//
// 호출할 때마다 새 클라이언트를 만들면 "Multiple GoTrueClient instances" 경고가 뜬다
// (Auth는 안 쓰지만 supabase-js 내부적으로 항상 만들어짐) — 모듈 전역에 하나만 캐싱한다.
let cachedClient: SupabaseClient | null = null;

export function getBrowserSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 환경변수가 필요합니다.",
    );
  }

  cachedClient = createClient(url, publishableKey);
  return cachedClient;
}
