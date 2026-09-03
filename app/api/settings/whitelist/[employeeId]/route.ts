import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";

// PLAN 15번: 관리자만 사원번호 화이트리스트에서 삭제할 수 있다.
export async function DELETE(
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

  if (employeeId === session.employeeId) {
    return NextResponse.json({ error: "본인 계정은 삭제할 수 없습니다." }, { status: 400 });
  }

  const supabase = getServerSupabaseClient();
  const { error } = await supabase
    .from("employee_whitelist")
    .delete()
    .eq("employee_id", employeeId);

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "이 사원번호는 이미 문서를 작성·수정한 기록이 있어 삭제할 수 없습니다." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
