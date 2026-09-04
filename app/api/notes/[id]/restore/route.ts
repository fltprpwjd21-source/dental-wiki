import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

// Design §4.2: 복구도 하위 전체를 함께 되돌린다 (부분 복구는 지원하지 않음).
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
    const { data, error } = await supabase.rpc("restore_node", {
      p_id: id,
      p_employee_id: session.employeeId,
    });

    if (error) {
      if (error.message?.includes("NODE_NOT_FOUND")) {
        return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
      }
      if (error.message?.includes("NOT_TRASHED")) {
        return NextResponse.json({ error: "휴지통에 있는 항목이 아닙니다." }, { status: 400 });
      }
      return NextResponse.json({ error: "복구에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ nodes: data ?? [] });
  });
}
