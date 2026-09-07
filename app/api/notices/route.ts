import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isNoticeCategory, makeSummary, todayIso, defaultEndsOn } from "@/lib/notices";

// 공지 목록. 기본은 게시 중인 것만, ?all=1 이면 지난 것까지.
export async function GET(request: NextRequest) {
  return withSession(async () => {
    const all = request.nextUrl.searchParams.get("all") === "1";
    const supabase = getServerSupabaseClient();

    let query = supabase
      .from("notices")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    // 게시 기간이 끝나면 홈에서 내려가지만 목록에는 남는다.
    // 배치가 아니라 조회할 때 날짜로 거른다 — 배치는 한 번도 안 도는 사고가 난다
    // (실제로 휴지통 자동삭제가 그래서 한 번도 실행되지 않았다).
    if (!all) {
      const today = todayIso();
      query = query.lte("starts_on", today).gte("ends_on", today);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "공지를 불러오지 못했습니다." }, { status: 500 });
    }
    return NextResponse.json({ notices: data ?? [] });
  });
}

// 공지 작성 — 로그인한 누구나.
//
// 작성을 관리자로 묶으면 기공소 연락 하나 공유하려고 관리자를 찾아야 한다.
// 대신 고치고 지우는 건 작성자와 관리자만 ([id]/route.ts).
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    const body = await request.json().catch(() => null);

    const category = body?.category;
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!isNoticeCategory(category)) {
      return NextResponse.json({ error: "분류를 골라주세요." }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "제목을 입력해주세요." }, { status: 400 });
    }

    const text = typeof body?.body === "string" ? body.body : "";
    const sourceNoteId = typeof body?.sourceNoteId === "string" ? body.sourceNoteId : null;
    const sourceDocumentId =
      typeof body?.sourceDocumentId === "string" ? body.sourceDocumentId : null;

    const supabase = getServerSupabaseClient();

    // 연결한 노트가 있으면 그 본문에서 요약을 뽑는다.
    //   내용을 복사하지는 않는다 — 원본을 고치면 공지에서도 최신 내용이 보여야 한다.
    //   요약만 저장하는 이유는 카드 다섯 장을 그릴 때마다 노트를 다시 읽지 않기 위해서다.
    let summary = makeSummary(text);
    if (!summary && sourceNoteId) {
      const { data: note } = await supabase
        .from("nodes")
        .select("content")
        .eq("id", sourceNoteId)
        .maybeSingle();
      summary = makeSummary(note?.content ?? "");
    }
    if (!summary && sourceDocumentId) {
      const { data: doc } = await supabase
        .from("documents")
        .select("content")
        .eq("id", sourceDocumentId)
        .maybeSingle();
      summary = makeSummary(doc?.content ?? "");
    }

    const { data: employee } = await supabase
      .from("employee_whitelist")
      .select("name")
      .eq("employee_id", session.employeeId)
      .maybeSingle();

    const { data: notice, error } = await supabase
      .from("notices")
      .insert({
        category,
        title,
        summary,
        body: text,
        source_note_id: sourceNoteId,
        source_document_id: sourceDocumentId,
        starts_on: typeof body?.startsOn === "string" ? body.startsOn : todayIso(),
        ends_on: typeof body?.endsOn === "string" ? body.endsOn : defaultEndsOn(),
        event_on: typeof body?.eventOn === "string" && body.eventOn ? body.eventOn : null,
        needs_ack: body?.needsAck === true,
        author_id: session.employeeId,
        author_name: employee?.name ?? null,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[notices] 작성 실패", error);
      return NextResponse.json({ error: "공지 등록에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ notice });
  });
}
