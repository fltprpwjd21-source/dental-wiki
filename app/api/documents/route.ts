import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { buildDocumentPayload } from "@/lib/document-write";
import type { DocumentCategory } from "@/lib/categories";

const VALID_CATEGORIES: DocumentCategory[] = ["handover", "insurance", "policy"];

// PLAN 7·8번: 신규 문서 등록. 최초 등록도 하나의 수정 이력(action: create)으로 남긴다.
//
// 문서 저장과 로그 기록은 create_document 함수 안에서 한 트랜잭션으로 처리된다.
// 예전처럼 따로 쓰면 문서만 저장되고 로그가 빠지는 상태가 생길 수 있었다.
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    const body = await request.json().catch(() => null);
    const category = body?.category;
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "올바른 카테고리를 선택해주세요." }, { status: 400 });
    }
    if (!title || !content) {
      return NextResponse.json({ error: "제목과 본문을 입력해주세요." }, { status: 400 });
    }

    // 검색은 문서 전체가 아니라 절 단위 조각으로 한다 (lib/chunks.ts 참고)
    const { embedding, chunks } = await buildDocumentPayload(title, content);
    const supabase = getServerSupabaseClient();

    const { data, error } = await supabase.rpc("create_document", {
      p_category: category,
      p_title: title,
      p_content: content,
      p_embedding: embedding,
      p_employee_id: session.employeeId,
      p_chunks: chunks,
    });

    if (error || !data?.[0]) {
      return NextResponse.json({ error: "문서 등록에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ document: data[0] });
  });
}
