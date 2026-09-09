import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import { cleanDraft, LABWORK_SELECT } from "@/lib/labwork/draft";

// 한 줄 고치기·지우기.
//
// 칸 하나를 고칠 때마다 그 줄 전체가 아니라 바뀐 칸만 보낸다(PATCH).
// 표는 여러 사람이 같이 볼 수 있는데, 줄 전체를 덮어쓰면 내가 안 건드린 칸까지
// 내 화면의 옛 값으로 되돌려 놓는다.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    const patch = cleanDraft(await request.json().catch(() => null));
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "고칠 내용이 없습니다." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("labwork_items")
      .update({ ...patch, updated_by: session.employeeId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(LABWORK_SELECT)
      .maybeSingle();

    if (error) {
      console.error("[lab] 수정 실패:", error);
      return NextResponse.json({ error: "저장하지 못했습니다." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ item: data });
  });
}

// 시제품이라 되돌리기를 두지 않는다. 화면에서 지울 때 한 번 더 묻는다.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async () => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    const supabase = getServerSupabaseClient();
    const { error } = await supabase.from("labwork_items").delete().eq("id", id);
    if (error) {
      console.error("[lab] 삭제 실패:", error);
      return NextResponse.json({ error: "지우지 못했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  });
}
