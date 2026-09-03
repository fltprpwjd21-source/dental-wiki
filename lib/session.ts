import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "dentalwiki_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8시간 후 자동 만료

export type SessionPayload = {
  employeeId: string;
  isAdmin: boolean;
  exp: number;
};

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET 환경변수가 필요합니다.");
  }
  return secret;
}

// 세션 쿠키 값 = base64(payload) + "." + HMAC 서명. 서버만 아는 SESSION_SECRET으로 위조를 막는다.
export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expectedSignature = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  if (payload.exp < Date.now()) return null;

  return payload;
}
