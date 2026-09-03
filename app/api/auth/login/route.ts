import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, signSession } from "@/lib/session";

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

  if (!isCommonPasswordCorrect(password)) {
    return NextResponse.json({ error: INVALID_LOGIN_MESSAGE }, { status: 401 });
  }

  const supabase = getServerSupabaseClient();
  const { data: employee, error } = await supabase
    .from("employee_whitelist")
    .select("is_admin")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error || !employee) {
    return NextResponse.json({ error: INVALID_LOGIN_MESSAGE }, { status: 401 });
  }

  const token = signSession({
    employeeId,
    isAdmin: employee.is_admin,
    exp: Date.now() + SESSION_TTL_MS,
  });

  const response = NextResponse.json({ employeeId, isAdmin: employee.is_admin });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
  return response;
}
