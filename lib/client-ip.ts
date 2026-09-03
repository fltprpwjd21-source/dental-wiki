import type { NextRequest } from "next/server";

// 요청을 보낸 클라이언트 IP. 로그인 시도 횟수 제한에 쓴다.
//
// Vercel은 엣지에서 x-forwarded-for 를 직접 채워 넣으므로 이 값을 신뢰할 수 있다.
// 다만 다른 환경에서는 클라이언트가 위조할 수도 있어, IP 기준 제한은 "보조 수단"으로만
// 쓴다. 사번 기준 제한(5회/10분)이 주된 방어선이다.
// 값을 못 구하면 "unknown"으로 묶는다 — 그러면 IP를 알 수 없는 요청들이 같은 한도를
// 공유하게 되어, 오히려 더 빨리 차단된다.
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
