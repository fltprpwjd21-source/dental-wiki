import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createEmbedding } from "@/lib/embeddings";

// PLAN 7·8번: 문서 수정. 수정 전 내용을 로그에 남기고, 임베딩도 새 내용으로 다시 생성한다.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json({ error: "본문을 입력해주세요." }, { status: 400 });
  }

  const supabase = getServerSupabaseClient();

  const { data: existing, error: fetchError } = await supabase
    .from("documents")
    .select("title, content")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  if (existing.content === content) {
    return NextResponse.json({ error: "변경된 내용이 없습니다." }, { status: 400 });
  }

  const embedding = await createEmbedding(`${existing.title}\n\n${content}`);

  const { data: updated, error: updateError } = await supabase
    .from("documents")
    .update({ content, embedding, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, category, title, content, updated_at")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "문서 수정에 실패했습니다." }, { status: 500 });
  }

  const { error: logError } = await supabase.from("document_logs").insert({
    document_id: id,
    action: "update",
    previous_content: existing.content,
    new_content: content,
    edited_by: session.employeeId,
  });

  if (logError) {
    return NextResponse.json(
      { error: "문서는 수정됐지만 로그 기록에 실패했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ document: updated });
}
