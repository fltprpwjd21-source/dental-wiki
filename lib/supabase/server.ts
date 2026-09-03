import { createClient } from "@supabase/supabase-js";

// 서버(API 라우트)에서만 사용. 서비스 역할 키는 절대 클라이언트로 노출하지 않는다.
export function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.",
    );
  }

  return createClient(url, serviceRoleKey);
}
