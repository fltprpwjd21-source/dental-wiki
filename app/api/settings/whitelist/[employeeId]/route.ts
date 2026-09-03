import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";

// PLAN 15번: 관리자만 사원번호를 비활성화·재활성화할 수 있다.
//
// 물리 삭제를 제공하지 않는 이유
//   documents.created_by / document_logs.edited_by 가 employee_whitelist(employee_id)를
//   외래키로 참조하므로, 문서를 한 번이라도 작성·수정한 사원번호는 삭제 자체가 불가능하다.
//   또 PRD 5번②에 따라 로그의 "누가 고쳤는지"는 보존되어야 한다.
//   그래서 행은 남기고 is_active만 false로 바꿔 로그인을 막는다.
//   lib/auth.ts가 요청마다 is_active를 확인하므로, 비활성화하면 이미 로그인해 있던
//   세션도 즉시 차단된다 (토큰 만료를 기다리지 않는다).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }

  const { employeeId } = await params;
  const body = await request.json().catch(() => null);

  if (typeof body?.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive 값이 필요합니다." }, { status: 400 });
  }
  const isActive = body.isActive;

  // 본인을 비활성화하면 그 즉시 스스로 로그아웃되고, 관리자가 아무도 없는 상태가 될 수 있다.
  // 이 규칙 덕분에 활성 관리자가 최소 한 명은 항상 남는다.
  if (!isActive && employeeId === session.employeeId) {
    return NextResponse.json(
      { error: "본인 계정은 비활성화할 수 없습니다." },
      { status: 400 },
    );
  }

  const supabase = getServerSupabaseClient();
  const { data: employee, error } = await supabase
    .from("employee_whitelist")
    .update({ is_active: isActive })
    .eq("employee_id", employeeId)
    .select("employee_id, is_admin, is_active, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "변경에 실패했습니다." }, { status: 500 });
  }
  if (!employee) {
    return NextResponse.json({ error: "등록되지 않은 사원번호입니다." }, { status: 404 });
  }

  return NextResponse.json({ employee });
}
