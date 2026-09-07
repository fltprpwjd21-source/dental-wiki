import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isNoticeCategory, makeSummary } from "@/lib/notices";
import { isUuid } from "@/lib/uuid";

// 고치고 지우는 건 작성자와 관리자만.
//
// 화면에서 버튼을 숨기는 것만으로는 부족하다 — 주소를 직접 쳐서 부르면 그만이다.
// 그래서 서버에서 매번 다시 확인한다.
async function loadAndAuthorize(id: string, employeeId: string, isAdmin: boolean) {
  const supabase = getServerSupabaseClient();
  const { data: notice, error } = await supabase
    .from("notices")
    .select("id, author_id, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (error) return { status: 500 as const, message: "공지를 불러오지 못했습니다." };
  if (!notice || notice.deleted_at) return { status: 404 as const, message: "없는 공지입니다." };
  if (notice.author_id !== employeeId && !isAdmin) {
    return { status: 403 as const, message: "쓴 사람과 관리자만 고칠 수 있습니다." };
  }
  return { status: 200 as const, supabase };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "없는 공지입니다." }, { status: 404 });
    }

    const auth = await loadAndAuthorize(id, session.employeeId, session.isAdmin);
    if (auth.status !== 200) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body?.category !== undefined) {
      if (!isNoticeCategory(body.category)) {
        return NextResponse.json({ error: "분류를 골라주세요." }, { status: 400 });
      }
      patch.category = body.category;
    }
    if (typeof body?.title === "string") {
      const title = body.title.trim();
      if (!title) return NextResponse.json({ error: "제목을 입력해주세요." }, { status: 400 });
      patch.title = title;
    }
    if (typeof body?.body === "string") {
      patch.body = body.body;
      // 본문을 고치면 카드에 보이는 한 줄도 같이 따라와야 한다.
      patch.summary = makeSummary(body.body);
    }
    if (typeof body?.startsOn === "string") patch.starts_on = body.startsOn;
    if (typeof body?.endsOn === "string") patch.ends_on = body.endsOn;
    if (body?.eventOn !== undefined) patch.event_on = body.eventOn || null;
    if (body?.needsAck !== undefined) patch.needs_ack = body.needsAck === true;

    const { data: notice, error } = await auth.supabase
      .from("notices")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ notice });
  });
}

// 완전 삭제가 아니라 휴지통. 노트와 같은 규칙이다 — 실수로 지운 걸 되살릴 수 있어야 한다.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "없는 공지입니다." }, { status: 404 });
    }

    const auth = await loadAndAuthorize(id, session.employeeId, session.isAdmin);
    if (auth.status !== 200) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { error } = await auth.supabase
      .from("notices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  });
}
