import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SessionPayload, verifySession } from "@/lib/session";

// 서버 컴포넌트/라우트에서 현재 로그인한 세션을 읽을 때 사용
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}
