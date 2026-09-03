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

  // 비활성화된 사원번호는 행이 그대로 남아 있다(로그 보존 목적). 그래서 그냥 insert하면
  // 중복 오류가 나므로, 이미 있는 사원번호면 재활성화로 처리한다.
  const { data: existing } = await supabase
    .from("employee_whitelist")
    .select("employee_id, is_active")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (existing) {
    if (existing.is_active) {
      return NextResponse.json({ error: "이미 등록된 사원번호입니다." }, { status: 409 });
    }

    const { data: reactivated, error: updateError } = await supabase
      .from("employee_whitelist")
      .update({ is_active: true, is_admin: isAdmin })
      .eq("employee_id", employeeId)
      .select("employee_id, is_admin, is_active, created_at")
      .single();

    if (updateError || !reactivated) {
      return NextResponse.json({ error: "재활성화에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ employee: reactivated, reactivated: true });
  }

  const { data: employee, error } = await supabase
    .from("employee_whitelist")
    .insert({ employee_id: employeeId, is_admin: isAdmin })
    .select("employee_id, is_admin, is_active, created_at")
    .single();

  if (error) {
    // 위 조회와 insert 사이에 동시 등록이 일어난 경우 (unique 위반)
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 등록된 사원번호입니다." }, { status: 409 });
    }
    return NextResponse.json({ error: "등록에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ employee });
}
