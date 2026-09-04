import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";

// PLAN 15번: 관리자만 사원번호를 화이트리스트에서 삭제할 수 있다.
//
// 삭제해도 기록은 남는다
//   documents.created_by / document_logs.edited_by 는 이제 employee_whitelist를
//   참조하지 않는 스냅샷이다(20260903072111 마이그레이션). 계정을 지워도 문서·로그에
//   남은 "누가 작성·수정했는지"는 그대로 보존된다 (PRD 5번②).
//
// 삭제하면 기존 세션도 즉시 끊긴다
//   lib/auth.ts의 getSession()이 요청마다 계정 존재를 확인하므로, 이미 로그인해 있던
//   사람도 다음 요청에서 바로 로그아웃 처리된다 (PRD 7번).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  return withSession(async (session) => {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
    }

    const { employeeId } = await params;

    // 본인을 지우면 그 즉시 스스로 로그아웃되고, 관리자가 아무도 없는 상태가 될 수 있다.
    // 이 규칙 덕분에 관리자가 최소 한 명은 항상 남는다.
    if (employeeId === session.employeeId) {
      return NextResponse.json(
        { error: "본인 계정은 삭제할 수 없습니다." },
        { status: 400 },
      );
    }

    const supabase = getServerSupabaseClient();
    const { data: deleted, error } = await supabase
      .from("employee_whitelist")
      .delete()
      .eq("employee_id", employeeId)
      .select("employee_id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
    }
    if (!deleted) {
      return NextResponse.json({ error: "등록되지 않은 사원번호입니다." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  });
}
