import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, signSession } from "@/lib/session";
import { getClientIp } from "@/lib/client-ip";

// 동일한 오류 메시지를 사용해, 등록되지 않은 사원번호인지 비밀번호가 틀렸는지 구분되지 않게 한다.
const INVALID_LOGIN_MESSAGE = "사원번호 또는 비밀번호가 올바르지 않습니다.";

function isCommonPasswordCorrect(input: string): boolean {
  const commonPassword = process.env.COMMON_LOGIN_PASSWORD;
  if (!commonPassword) {
    throw new Error("COMMON_LOGIN_PASSWORD 환경변수가 필요합니다.");
  }
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(commonPassword);
  return (
    inputBuffer.length === expectedBuffer.length &&
    timingSafeEqual(inputBuffer, expectedBuffer)
  );
}

// 사원번호는 사내 메일 주소나 명찰에서 드러나므로 실질적인 방어선은 공통 비밀번호 하나다.
// 시도 횟수 제한이 없으면 무제한으로 찍어볼 수 있어, 로그인 전에 먼저 한도를 확인한다.
// (기준값과 근거는 20260903142230_login_rate_limit.sql 참고)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!employeeId || !password) {
    return NextResponse.json(
      { error: "사원번호와 비밀번호를 입력해주세요." },
      { status: 400 },
    );
  }

  const ip = getClientIp(request.headers);
  const supabase = getServerSupabaseClient();

  const { data: guard, error: guardError } = await supabase.rpc("login_guard_check", {
    p_ip: ip,
    p_employee_id: employeeId,
  });

  // 한도 확인 자체가 실패하면 로그인을 막는다. 확인 없이 통과시키면 제한이 무의미해진다.
  if (guardError) {
    return NextResponse.json(
      { error: "로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 503 },
    );
  }

  if (guard?.[0]?.blocked) {
    const minutes = Math.max(1, Math.ceil((guard[0].retry_after_seconds ?? 60) / 60));
    return NextResponse.json(
      { error: `로그인 시도가 너무 많습니다. ${minutes}분 후에 다시 시도해주세요.` },
      { status: 429, headers: { "Retry-After": String(guard[0].retry_after_seconds ?? 60) } },
    );
  }

  const recordFailure = async () => {
    await supabase.rpc("login_guard_fail", { p_ip: ip, p_employee_id: employeeId });
  };

  if (!isCommonPasswordCorrect(password)) {
    await recordFailure();
    return NextResponse.json({ error: INVALID_LOGIN_MESSAGE }, { status: 401 });
  }

  const { data: employee, error } = await supabase
    .from("employee_whitelist")
    .select("is_admin")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error || !employee) {
    await recordFailure();
    return NextResponse.json({ error: INVALID_LOGIN_MESSAGE }, { status: 401 });
  }

  // 성공했으므로 이 사번·IP의 실패 기록을 지운다.
  // 비밀번호를 몇 번 틀렸다가 맞춘 직원이 한도에 가까운 상태로 남지 않게 한다.
  await supabase.rpc("login_guard_reset", { p_ip: ip, p_employee_id: employeeId });

  // 토큰에는 사원번호만 담는다. 관리자 여부는 요청마다 DB에서 읽으므로(lib/auth.ts)
  // 여기에 넣으면 강등이 즉시 반영되지 않는 낡은 값이 된다.
  const token = signSession({
    employeeId,
    exp: Date.now() + SESSION_TTL_MS,
  });

  const response = NextResponse.json({ employeeId, isAdmin: employee.is_admin });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // maxAge를 주지 않는다 — 브라우저를 완전히 닫으면(모든 창) 이 쿠키도 함께
    // 사라지게 하기 위해서다(세션 쿠키). 토큰 안의 exp(SESSION_TTL_MS)는 브라우저를
    // 계속 켜둔 채로 오래 방치했을 때를 대비한 상한선으로만 남겨둔다.
    path: "/",
  });
  return response;
}
