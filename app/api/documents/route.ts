import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createEmbedding } from "@/lib/embeddings";
import type { DocumentCategory } from "@/lib/categories";

const VALID_CATEGORIES: DocumentCategory[] = ["handover", "insurance", "policy"];

// PLAN 7·8번: 신규 문서 등록. 최초 등록도 하나의 수정 이력(action: create)으로 남긴다.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

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

  const embedding = await createEmbedding(`${title}\n\n${content}`);
  const supabase = getServerSupabaseClient();

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({ category, title, content, embedding, created_by: session.employeeId })
    .select("id, category, title, content, created_at")
    .single();

  if (insertError || !document) {
    return NextResponse.json({ error: "문서 등록에 실패했습니다." }, { status: 500 });
  }

  const { error: logError } = await supabase.from("document_logs").insert({
    document_id: document.id,
    action: "create",
    previous_content: null,
    new_content: content,
    edited_by: session.employeeId,
  });

  if (logError) {
    return NextResponse.json(
      { error: "문서는 등록됐지만 로그 기록에 실패했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ document });
}
