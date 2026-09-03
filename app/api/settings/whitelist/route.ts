import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";

// PLAN 15번: 관리자만 사원번호 화이트리스트에 등록할 수 있다.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
  const isAdmin = body?.isAdmin === true;

  if (!employeeId) {
    return NextResponse.json({ error: "사원번호를 입력해주세요." }, { status: 400 });
  }

  const supabase = getServerSupabaseClient();
  const { data: employee, error } = await supabase
    .from("employee_whitelist")
    .insert({ employee_id: employeeId, is_admin: isAdmin })
    .select("employee_id, is_admin, created_at")
    .single();

  if (error) {
    // 23505 = unique_violation (employee_id가 기본키라 중복 등록 시 발생)
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 등록된 사원번호입니다." }, { status: 409 });
    }
    return NextResponse.json({ error: "등록에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ employee });
}
