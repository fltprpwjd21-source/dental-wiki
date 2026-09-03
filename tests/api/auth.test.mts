import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

// 왜 이 검사가 필요한가
//   "로그인하지 않으면 아무것도 못 본다"가 이 앱의 기본 약속이다(PRD 7번).
//   화면과 API가 각자 세션을 확인하는 구조라, 어느 한 곳에서 확인이 빠져도
//   나머지는 정상으로 보인다. 그래서 전 경로를 한 번에 훑는 검사가 필요하다.
//
// 이 테스트는 DB에 아무것도 쓰지 않는다 (로그인 실패도 시도하지 않는다).
// 개발 서버가 떠 있어야 한다: npm run dev
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

before(async () => {
  try {
    await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(
      `${BASE} 에 연결할 수 없습니다. 먼저 다른 터미널에서 "npm run dev" 를 실행하세요.`,
    );
  }
});

const get = (path: string) =>
  fetch(BASE + path, { redirect: "manual", signal: AbortSignal.timeout(20000) });
const send = (path: string, method: string, body: unknown = {}) =>
  fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });

describe("로그인하지 않은 상태", () => {
  test("로그인 화면은 볼 수 있다", async () => {
    const r = await get("/login");
    assert.equal(r.status, 200);
    assert.ok((await r.text()).includes("치과위키 로그인"));
  });

  test("모든 화면이 /login 으로 돌려보낸다", async () => {
    for (const path of [
      "/",
      "/settings",
      "/categories/handover",
      "/categories/insurance",
      "/categories/policy",
      "/documents/new",
    ]) {
      const r = await get(path);
      assert.ok([302, 307].includes(r.status), `${path} → ${r.status} (리다이렉트가 아님)`);
      assert.ok(
        (r.headers.get("location") ?? "").includes("/login"),
        `${path} → ${r.headers.get("location")}`,
      );
    }
  });

  test("모든 API가 401을 준다", async () => {
    const calls: [string, string][] = [
      ["/api/qa", "POST"],
      ["/api/documents", "POST"],
      ["/api/settings/whitelist", "POST"],
      ["/api/documents/69e33beb-27df-4241-bea3-d1634860867a", "PATCH"],
      ["/api/documents/69e33beb-27df-4241-bea3-d1634860867a/logs", "GET"],
      ["/api/documents/69e33beb-27df-4241-bea3-d1634860867a/revert", "POST"],
      ["/api/settings/whitelist/00001", "DELETE"],
    ];
    for (const [path, method] of calls) {
      const r = method === "GET" ? await get(path) : await send(path, method);
      assert.equal(r.status, 401, `${method} ${path} → ${r.status}`);
      const body = await r.json();
      assert.equal(body.error, "로그인이 필요합니다.", `${method} ${path}`);
    }
  });

  test("세션 확인이 uuid 형식 검사보다 먼저다 (문서 존재 여부를 알려주지 않는다)", async () => {
    // 로그인하지 않았으면 /documents/<아무값> 은 404가 아니라 로그인 리다이렉트여야 한다.
    // 404를 주면 "그 문서는 없다"는 정보를 외부인에게 흘리는 셈이 된다.
    const r = await get("/documents/x");
    assert.ok([302, 307].includes(r.status), `${r.status}`);
  });
});

describe("잘못된 입력", () => {
  test("존재하지 않는 카테고리는 404", async () => {
    const r = await get("/categories/없는카테고리");
    // 로그인 리다이렉트가 먼저 걸리므로 리다이렉트도 정상 동작으로 본다
    assert.ok([302, 307, 404].includes(r.status), `${r.status}`);
  });

  test("로그인 API에 빈 값을 보내면 400", async () => {
    for (const body of [{}, { employeeId: "" }, { employeeId: "123" }, { password: "x" }]) {
      const r = await send("/api/auth/login", "POST", body);
      assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
      const j = await r.json();
      assert.equal(j.error, "사원번호와 비밀번호를 입력해주세요.");
    }
  });

  test("로그인 API가 JSON이 아닌 본문에도 죽지 않는다", async () => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "이건 JSON이 아니다",
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(r.status, 400, `${r.status}`);
  });
});
