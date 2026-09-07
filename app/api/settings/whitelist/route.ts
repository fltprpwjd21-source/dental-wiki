import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";

// PLAN 15번: 관리자만 사원번호 화이트리스트에 등록할 수 있다.
//
// 등록되는 계정은 항상 일반 권한이다.
//   예전에는 요청 본문의 isAdmin 을 그대로 믿고 관리자를 만들 수 있었다. 관리자는
//   화이트리스트 추가·삭제와 지식 지도 관리를 할 수 있어서, 나눠 가질수록 실수로 남의
//   계정을 지울 경로만 늘어난다. 이제 관리 계정은 하나(00001)로 고정하고, 여기서
//   등록되는 계정은 예외 없이 is_admin=false 로 들어간다.
//   (화면의 "관리자로 등록" 체크박스도 함께 없앴다)
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const employeeId = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
    // 이름은 목록에서 "이 사원번호가 누구인지" 알아보기 위한 표시용 값이다.
    // 비워서 등록하면 나중에 어느 줄을 지워야 할지 알 수 없으므로 필수로 받는다.
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!employeeId) {
      return NextResponse.json({ error: "사원번호를 입력해주세요." }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { data: employee, error } = await supabase
      .from("employee_whitelist")
      .insert({ employee_id: employeeId, name, is_admin: false })
      .select("employee_id, name, is_admin, created_at")
      .single();

    if (error) {
      // 23505 = unique_violation (employee_id가 기본키라 중복 등록 시 발생)
      if (error.code === "23505") {
        return NextResponse.json({ error: "이미 등록된 사원번호입니다." }, { status: 409 });
      }
      return NextResponse.json({ error: "등록에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ employee });
  });
}
