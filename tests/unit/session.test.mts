import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import {
  signSession,
  verifySession,
  SESSION_TTL_MS,
  type SessionPayload,
} from "../../lib/session.ts";

// 왜 이 검사가 필요한가
//   세션 쿠키 위조 방어가 이 앱 보안의 핵심이다. 로그인은 "사원번호 + 전 직원 공통
//   비밀번호"이므로, 쿠키를 마음대로 만들 수 있다면 로그인 자체가 무의미해진다.
//   서명 검증이 조용히 깨져도 앱은 정상으로 보이기 때문에 자동 검사가 특히 중요하다.
//
// 테스트는 자체 SESSION_SECRET을 설정한다. 실제 운영 값에 의존하지 않아
// 어느 환경에서도(Vercel 빌드 포함) 같은 결과가 나온다.
before(() => {
  process.env.SESSION_SECRET = "테스트용-비밀키-실제-값과-무관";
});

const payload = (over: Partial<SessionPayload> = {}): SessionPayload => ({
  employeeId: "2251325",
  exp: Date.now() + SESSION_TTL_MS,
  ...over,
});

describe("세션 서명", () => {
  test("서명한 세션은 그대로 복원된다", () => {
    const p = payload();
    const restored = verifySession(signSession(p));
    assert.equal(restored?.employeeId, p.employeeId);
    assert.equal(restored?.exp, p.exp);
  });

  test("토큰에 관리자 여부가 담기지 않는다", () => {
    // 권한은 요청마다 DB에서 읽는다(lib/auth.ts). 토큰에 넣으면 관리자 강등이
    // 즉시 반영되지 않는 낡은 값이 되므로, 애초에 담지 않는 것이 규칙이다.
    const token = signSession(payload());
    const body = Buffer.from(token.split(".")[0], "base64url").toString("utf8");
    assert.equal(body.includes("isAdmin"), false, `토큰 본문: ${body}`);
  });

  test("서명을 고치면 거부한다", () => {
    const token = signSession(payload());
    const forged = token.slice(0, -3) + "xxx";
    assert.equal(verifySession(forged), null);
  });

  test("본문만 바꿔치기하면 거부한다 (서명이 맞지 않는다)", () => {
    const token = signSession(payload());
    const signature = token.split(".")[1];
    const otherBody = Buffer.from(
      JSON.stringify(payload({ employeeId: "9999999" })),
    ).toString("base64url");
    assert.equal(verifySession(`${otherBody}.${signature}`), null);
  });

  test("다른 비밀키로 만든 토큰은 거부한다", () => {
    process.env.SESSION_SECRET = "공격자가-쓰는-다른-키";
    const attackerToken = signSession(payload());
    process.env.SESSION_SECRET = "테스트용-비밀키-실제-값과-무관";
    assert.equal(verifySession(attackerToken), null);
  });

  test("만료된 세션은 거부한다", () => {
    const expired = signSession(payload({ exp: Date.now() - 1000 }));
    assert.equal(verifySession(expired), null);
  });

  test("빈 값·형식이 깨진 값은 거부한다", () => {
    for (const bad of [undefined, null, "", "아무값", "a.b.c", ".", "onlybody."]) {
      assert.equal(verifySession(bad as string | undefined | null), null, `거부해야 함: ${bad}`);
    }
  });

  test("SESSION_SECRET이 없으면 오류를 낸다 (조용히 통과시키지 않는다)", () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    assert.throws(() => signSession(payload()), /SESSION_SECRET/);
    process.env.SESSION_SECRET = saved;
  });

  test("세션 유지 시간은 8시간이다", () => {
    assert.equal(SESSION_TTL_MS, 8 * 60 * 60 * 1000);
  });
});
