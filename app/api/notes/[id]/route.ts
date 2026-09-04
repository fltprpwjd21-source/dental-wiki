import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async () => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "노트를 찾을 수 없습니다." }, { status: 404 });
    }

    const supabase = getServerSupabaseClient();
    const { data: node } = await supabase
      .from("nodes")
      .select("id, parent_id, type, name, content, version, created_by, created_at, updated_at")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();

    if (!node || node.type !== "note") {
      return NextResponse.json({ error: "노트를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ node });
  });
}

// Design §4.2: 문서 편집과 동일한 낙관적 잠금 패턴 (expectedVersion 필수).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "노트를 찾을 수 없습니다." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const content = typeof body?.content === "string" ? body.content : null;
    const expectedVersion = Number.isInteger(body?.expectedVersion) ? body.expectedVersion : null;

    if (content === null || expectedVersion === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.rpc("update_note", {
      p_id: id,
      p_content: content,
      p_expected_version: expectedVersion,
      p_employee_id: session.employeeId,
    });

    if (error) {
      if (error.message?.includes("NODE_NOT_FOUND") || error.message?.includes("NOT_A_NOTE")) {
        return NextResponse.json({ error: "노트를 찾을 수 없습니다." }, { status: 404 });
      }
      if (error.message?.includes("NODE_TRASHED")) {
        return NextResponse.json({ error: "휴지통에 있는 노트는 수정할 수 없습니다." }, { status: 422 });
      }
      if (error.message?.includes("VERSION_CONFLICT")) {
        return NextResponse.json(
          { error: "다른 사람이 방금 이 노트를 수정했습니다. 새로고침한 뒤 다시 시도해주세요." },
          { status: 409 },
        );
      }
      if (error.message?.includes("NO_CHANGES")) {
        return NextResponse.json({ error: "변경된 내용이 없습니다." }, { status: 400 });
      }
      return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
    }
    if (!data?.[0]) {
      return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ node: data[0] });
  });
}
