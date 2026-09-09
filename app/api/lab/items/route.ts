import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { EMPTY_DRAFT } from "@/lib/labwork/types";
import { cleanDraft, LABWORK_SELECT } from "@/lib/labwork/draft";

// 기공물 장부 시제품 — 목록 조회와 새 줄 추가.
//
// 저장은 우리 DB(labwork_items)다. 환자 이름·차트번호 열은 없다
// (20260910130000 마이그레이션 주석 참고).

export async function GET() {
  return withSession(async () => {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("labwork_items")
      .select(LABWORK_SELECT)
      // 넣은 순서 그대로 둔다. 날짜로 다시 줄 세우면 방금 친 줄이 눈앞에서 사라진다.
      .order("seq", { ascending: true });

    if (error) {
      console.error("[lab] 목록 조회 실패:", error);
      return NextResponse.json({ error: "장부를 불러오지 못했습니다." }, { status: 500 });
    }
    return NextResponse.json({ items: data ?? [] });
  });
}

export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    const body = await request.json().catch(() => null);
    // 여러 줄을 한 번에 받는다 — 엑셀에서 붙여넣으면 줄이 한꺼번에 들어온다.
    const drafts: unknown[] = Array.isArray(body?.rows) ? body.rows : [body?.row ?? {}];
    if (drafts.length === 0 || drafts.length > 500) {
      return NextResponse.json({ error: "한 번에 500줄까지 넣을 수 있습니다." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("labwork_items")
      .insert(
        drafts.map((draft) => ({
          ...EMPTY_DRAFT,
          ...cleanDraft(draft),
          arrived_on: null,
          created_by: session.employeeId,
          updated_by: session.employeeId,
        })),
      )
      .select(LABWORK_SELECT);

    if (error) {
      console.error("[lab] 추가 실패:", error);
      return NextResponse.json({ error: "줄을 추가하지 못했습니다." }, { status: 500 });
    }
    return NextResponse.json({ items: data ?? [] }, { status: 201 });
  });
}
