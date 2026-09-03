import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getClientIp } from "../../lib/client-ip.ts";

// 왜 이 검사가 필요한가
//   로그인 시도 횟수 제한이 IP를 기준으로도 센다. 여기서 IP를 잘못 뽑으면
//   (예: 프록시 체인을 그대로 문자열로 쓰거나, 항상 unknown이 되거나)
//   모든 요청이 한 덩어리로 묶여 정상 직원이 잠기거나, 반대로 제한이 무력해진다.
describe("getClientIp", () => {
  test("x-forwarded-for 값을 쓴다", () => {
    assert.equal(getClientIp(new Headers({ "x-forwarded-for": "222.109.234.226" })), "222.109.234.226");
  });

  test("프록시를 여러 번 거치면 맨 앞(실제 클라이언트)을 쓴다", () => {
    const h = new Headers({ "x-forwarded-for": "222.109.234.226, 10.0.0.1, 172.16.0.5" });
    assert.equal(getClientIp(h), "222.109.234.226");
  });

  test("공백을 제거한다", () => {
    assert.equal(getClientIp(new Headers({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" })), "1.2.3.4");
  });

  test("x-forwarded-for가 없으면 x-real-ip를 쓴다", () => {
    assert.equal(getClientIp(new Headers({ "x-real-ip": "9.8.7.6" })), "9.8.7.6");
  });

  test("둘 다 없으면 unknown 으로 묶는다", () => {
    assert.equal(getClientIp(new Headers()), "unknown");
  });

  test("빈 문자열이면 unknown 으로 묶는다 (빈 값을 IP로 쓰지 않는다)", () => {
    assert.equal(getClientIp(new Headers({ "x-forwarded-for": "" })), "unknown");
    assert.equal(getClientIp(new Headers({ "x-forwarded-for": "   " })), "unknown");
  });

  test("IPv6도 그대로 쓴다", () => {
    assert.equal(getClientIp(new Headers({ "x-forwarded-for": "::1" })), "::1");
  });
});
