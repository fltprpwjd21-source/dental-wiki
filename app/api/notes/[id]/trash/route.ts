import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

// Design §4.2: 폴더를 지우면 하위 전체가 함께 휴지통으로 간다 (DB 함수가 재귀 처리).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.rpc("trash_node", {
      p_id: id,
      p_employee_id: session.employeeId,
    });

    if (error) {
      if (error.message?.includes("NODE_NOT_FOUND")) {
        return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
      }
      if (error.message?.includes("ALREADY_TRASHED")) {
        return NextResponse.json({ error: "이미 휴지통에 있습니다." }, { status: 400 });
      }
      return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ nodes: data ?? [] });
  });
}
