import { NextResponse } from "next/server";
import { getSession, type Session } from "@/lib/auth";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, signSession } from "@/lib/session";

// 로그인 여부를 확인하고, 통과하면 세션을 "활동 기반"으로 연장한다.
//
// 세션은 발급 시점부터 고정 8시간이 아니라, 이 API를 부를 때마다 만료 시각이
// 다시 뒤로 밀린다. 계속 위키를 쓰는 사람이 작업 중에 로그아웃되는 일을 막는다.
//
// 왜 미들웨어가 아니라 여기서 하는가
//   Next.js 16의 미들웨어는 Edge 런타임에서만 돈다. 세션 서명에 쓰는
//   node:crypto(createHmac)는 Edge에서 지원되지 않아, 모든 요청(페이지 열람 포함)에서
//   갱신하는 방식은 세션 서명을 Web Crypto로 다시 만들어야 하는 큰 작업이 된다.
//   대신 실제 조작(질문하기·문서 수정·로그인 등)을 하는 API 호출 시점에만 연장한다.
//   문서만 읽고 아무 것도 누르지 않으면 연장되지 않지만, 위키 사용은 대부분
//   검색이나 수정을 동반하므로 실사용에서는 차이가 크지 않다.
//
// 페이지(Server Component)에서는 쓸 수 없다
//   Next.js는 Server Component에서 쿠키 쓰기를 막는다(Server Action·라우트 핸들러만 가능).
//   그래서 이 함수는 API 라우트 전용이다.
export async function withSession(
  handler: (session: Session) => Promise<NextResponse>,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const response = await handler(session);

  // 이 요청이 401/403/400 등으로 끝났더라도, 세션 자체는 유효했으니 연장한다.
  // (권한이 없어 거부된 것과 로그인이 안 된 것은 다르다)
  const token = signSession({
    employeeId: session.employeeId,
    exp: Date.now() + SESSION_TTL_MS,
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });

  return response;
}
