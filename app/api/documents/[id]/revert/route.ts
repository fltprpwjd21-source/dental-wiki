import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createEmbedding } from "@/lib/embeddings";

// PLAN 11번: 로그에서 선택한 이전 버전으로 되돌린다. 되돌리기도 하나의 로그(action: revert)로 남는다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const logId = typeof body?.logId === "string" ? body.logId : "";

  if (!logId) {
    return NextResponse.json({ error: "되돌릴 버전을 선택해주세요." }, { status: 400 });
  }

  const supabase = getServerSupabaseClient();

  const { data: targetLog, error: logFetchError } = await supabase
    .from("document_logs")
    .select("document_id, new_content")
    .eq("id", logId)
    .maybeSingle();

  if (logFetchError || !targetLog || targetLog.document_id !== id) {
    return NextResponse.json({ error: "되돌릴 버전을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: current, error: currentFetchError } = await supabase
    .from("documents")
    .select("title, content")
    .eq("id", id)
    .maybeSingle();

  if (currentFetchError || !current) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  if (current.content === targetLog.new_content) {
    return NextResponse.json({ error: "이미 같은 내용입니다." }, { status: 400 });
  }

  const embedding = await createEmbedding(`${current.title}\n\n${targetLog.new_content}`);

  const { data: updated, error: updateError } = await supabase
    .from("documents")
    .update({ content: targetLog.new_content, embedding, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, category, title, content, updated_at")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "되돌리기에 실패했습니다." }, { status: 500 });
  }

  const { error: revertLogError } = await supabase.from("document_logs").insert({
    document_id: id,
    action: "revert",
    previous_content: current.content,
    new_content: targetLog.new_content,
    edited_by: session.employeeId,
  });

  if (revertLogError) {
    return NextResponse.json(
      { error: "되돌리기는 됐지만 로그 기록에 실패했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ document: updated });
}
