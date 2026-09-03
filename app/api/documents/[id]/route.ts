import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createEmbedding } from "@/lib/embeddings";
import { isUuid } from "@/lib/uuid";

// PLAN 7·8번: 문서 수정. 제목과 본문을 모두 고칠 수 있고, 변경 전 값은 로그에 남는다.
//
// 문서 갱신과 로그 기록은 update_document 함수 안에서 한 트랜잭션으로 처리된다.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!title || !content) {
    return NextResponse.json({ error: "제목과 본문을 입력해주세요." }, { status: 400 });
  }

  const embedding = await createEmbedding(`${title}\n\n${content}`);
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase.rpc("update_document", {
    p_id: id,
    p_title: title,
    p_content: content,
    p_embedding: embedding,
    p_employee_id: session.employeeId,
  });

  if (error) {
    if (error.message?.includes("DOCUMENT_NOT_FOUND")) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }
    if (error.message?.includes("NO_CHANGES")) {
      return NextResponse.json({ error: "변경된 내용이 없습니다." }, { status: 400 });
    }
    return NextResponse.json({ error: "문서 수정에 실패했습니다." }, { status: 500 });
  }

  if (!data?.[0]) {
    return NextResponse.json({ error: "문서 수정에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ document: data[0] });
}
