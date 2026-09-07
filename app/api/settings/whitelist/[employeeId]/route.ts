import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";

// PLAN 15번: 관리자만 사원번호 화이트리스트를 수정·삭제할 수 있다.
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
    if (employeeId === session.employeeId) {
      return NextResponse.json(
        { error: "본인 계정은 삭제할 수 없습니다." },
        { status: 400 },
      );
    }

    const supabase = getServerSupabaseClient();

    // 관리자 계정은 아예 지울 수 없게 막는다.
    //   화면에서 관리자 권한을 부여할 방법이 없어졌기 때문에(체크박스 제거), 관리자
    //   계정을 한 번 지우면 되살릴 수 있는 경로가 DB 직접 수정밖에 없다. "본인은 삭제
    //   불가" 규칙만으로는 관리자가 둘 이상일 때 서로를 지우는 것을 막지 못한다.
    const { data: target, error: lookupError } = await supabase
      .from("employee_whitelist")
      .select("employee_id, is_admin")
      .eq("employee_id", employeeId)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
    }
    if (!target) {
      return NextResponse.json({ error: "등록되지 않은 사원번호입니다." }, { status: 404 });
    }
    if (target.is_admin) {
      return NextResponse.json(
        { error: "관리자 계정은 삭제할 수 없습니다." },
        { status: 400 },
      );
    }

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

// 이름만 고친다.
//   이 기능이 생기기 전에 등록된 사원번호에는 이름이 비어 있고(마이그레이션에서
//   nullable 로 추가했다), 개명·오타도 있을 수 있다. 이름을 못 고치면 그런 줄은
//   지웠다가 다시 등록하는 수밖에 없는데, 삭제는 로그인 차단을 동반하므로 과하다.
//   권한(is_admin)과 사원번호는 여기서 바뀌지 않는다.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  return withSession(async (session) => {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
    }

    const { employeeId } = await params;
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { data: updated, error } = await supabase
      .from("employee_whitelist")
      .update({ name })
      .eq("employee_id", employeeId)
      .select("employee_id, name, is_admin, created_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "이름 변경에 실패했습니다." }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "등록되지 않은 사원번호입니다." }, { status: 404 });
    }

    return NextResponse.json({ employee: updated });
  });
}
