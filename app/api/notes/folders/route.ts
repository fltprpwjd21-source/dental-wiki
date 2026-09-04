import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

// Design: 폴더 생성은 로그인한 전 스탭 누구나 가능하다 (2026-09-04 확정).
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const parentId = body?.parentId;

    if (!name) {
      return NextResponse.json({ error: "폴더 이름을 입력해주세요." }, { status: 400 });
    }
    if (parentId !== null && parentId !== undefined && !isUuid(parentId)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();

    if (parentId) {
      const { data: parent } = await supabase
        .from("nodes")
        .select("id, type, status")
        .eq("id", parentId)
        .maybeSingle();
      if (!parent || parent.type !== "folder" || parent.status !== "active") {
        return NextResponse.json({ error: "상위 폴더를 찾을 수 없습니다." }, { status: 404 });
      }
    }

    const { data, error } = await supabase.rpc("create_folder", {
      p_parent_id: parentId ?? null,
      p_name: name,
      p_employee_id: session.employeeId,
    });

    if (error || !data?.[0]) {
      return NextResponse.json({ error: "폴더 생성에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ node: data[0] }, { status: 201 });
  });
}
