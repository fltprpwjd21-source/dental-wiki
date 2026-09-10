import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { INTERNAL_LAB_NAME, type LabworkScope } from "@/lib/labwork/types";
import { cleanDraft, LABWORK_SELECT } from "@/lib/labwork/draft";
import { isUuid } from "@/lib/uuid";

// 기공물 장부 시제품 — 목록 조회와 새 줄 추가.
//
// 시트가 둘이다(외부·내부). 구조가 같아 한 표에 담고 scope 로 가른다.

function isScope(value: string): value is LabworkScope {
  return value === "external" || value === "internal";
}
//
// 저장은 우리 DB(labwork_items)다. 환자 이름·차트번호 열은 없다
// (20260910130000 마이그레이션 주석 참고).

export async function GET(request: NextRequest) {
  return withSession(async () => {
    // 시트를 안 정하면 외부시트를 본다. 모르는 값이 오면 400 으로 막는다 —
    // 조용히 한쪽으로 떨어지면 "내부시트를 봤는데 외부 줄이 나왔다"를 아무도 모른다.
    const scope = request.nextUrl.searchParams.get("scope") ?? "external";
    if (!isScope(scope)) {
      return NextResponse.json({ error: "없는 시트입니다." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("labwork_items")
      .select(LABWORK_SELECT)
      .eq("scope", scope)
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
    const scope = typeof body?.scope === "string" ? body.scope : "external";
    if (!isScope(scope)) {
      return NextResponse.json({ error: "없는 시트입니다." }, { status: 400 });
    }
    const drafts: unknown[] = Array.isArray(body?.rows) ? body.rows : [body?.row ?? {}];
    if (drafts.length === 0 || drafts.length > 500) {
      return NextResponse.json({ error: "한 번에 500줄까지 넣을 수 있습니다." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("labwork_items")
      .insert(
        // EMPTY_DRAFT 를 그대로 펼치지 않는다.
        //   그건 화면 입력칸의 기본값이라 개수 칸이 빈 문자열("")인데,
        //   DB 의 integer 열은 "" 를 못 받아 줄 추가가 통째로 500 이 된다.
        //   빈 칸은 보내지 않고 DB 기본값에 맡긴다 — 화면 기본값과 DB 기본값은 다른 물건이다.
        drafts.map((draft) => {
          const clean = cleanDraft(draft);
          return {
            ...clean,
            scope,
            // 내부시트는 기공실에서 만든다. 칸을 없애는 대신 미리 채워 둔다 —
            // 두 시트의 열이 같아야 화면·붙여넣기·나중의 합산 통계가 한 벌로 끝난다.
            // 붙여넣기로 값이 함께 들어온 경우에는 그 값을 존중한다.
            lab: (clean.lab as string) || (scope === "internal" ? INTERNAL_LAB_NAME : ""),
            created_by: session.employeeId,
            updated_by: session.employeeId,
          };
        }),
      )
      .select(LABWORK_SELECT);

    if (error) {
      console.error("[lab] 추가 실패:", error);
      return NextResponse.json({ error: "줄을 추가하지 못했습니다." }, { status: 500 });
    }
    return NextResponse.json({ items: data ?? [] }, { status: 201 });
  });
}

// 여러 줄 한 번에 지우기.
//
// 한 줄씩 지우는 요청을 스무 번 보내면, 중간에 하나가 실패했을 때 화면과 DB 가 어긋난다.
// 한 번에 보내면 결과도 하나다.
export async function DELETE(request: NextRequest) {
  return withSession(async () => {
    const body = await request.json().catch(() => null);
    const ids: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
    const valid = ids.filter((id): id is string => typeof id === "string" && isUuid(id));

    if (valid.length === 0) {
      return NextResponse.json({ error: "지울 줄을 고르지 않았습니다." }, { status: 400 });
    }
    if (valid.length !== ids.length) {
      // 하나라도 이상하면 통째로 막는다. 일부만 지우면 무엇이 남았는지 알 수 없다.
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { error } = await supabase.from("labwork_items").delete().in("id", valid);
    if (error) {
      console.error("[lab] 여러 줄 삭제 실패:", error);
      return NextResponse.json({ error: "지우지 못했습니다." }, { status: 500 });
    }
    return NextResponse.json({ deleted: valid.length });
  });
}
