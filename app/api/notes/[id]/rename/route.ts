import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const expectedVersion = Number.isInteger(body?.expectedVersion) ? body.expectedVersion : null;

    if (!name || expectedVersion === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.rpc("rename_node", {
      p_id: id,
      p_name: name,
      p_expected_version: expectedVersion,
      p_employee_id: session.employeeId,
    });

    if (error) {
      if (error.message?.includes("NODE_NOT_FOUND")) {
        return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
      }
      if (error.message?.includes("NODE_TRASHED")) {
        return NextResponse.json({ error: "휴지통에 있는 항목은 이름을 바꿀 수 없습니다." }, { status: 422 });
      }
      if (error.message?.includes("VERSION_CONFLICT")) {
        return NextResponse.json(
          { error: "다른 사람이 방금 이 항목을 바꿨습니다. 새로고침한 뒤 다시 시도해주세요." },
          { status: 409 },
        );
      }
      if (error.message?.includes("NO_CHANGES")) {
        return NextResponse.json({ error: "변경된 내용이 없습니다." }, { status: 400 });
      }
      return NextResponse.json({ error: "이름 변경에 실패했습니다." }, { status: 500 });
    }
    if (!data?.[0]) {
      return NextResponse.json({ error: "이름 변경에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ node: data[0] });
  });
}
