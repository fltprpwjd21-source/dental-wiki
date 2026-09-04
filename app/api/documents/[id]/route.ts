import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { buildDocumentPayload } from "@/lib/document-write";
import { isUuid } from "@/lib/uuid";

// PLAN 7·8번: 문서 수정. 제목과 본문을 모두 고칠 수 있고, 변경 전 값은 로그에 남는다.
//
// 문서 갱신과 로그 기록은 update_document 함수 안에서 한 트랜잭션으로 처리된다.
//
// 동시 편집 감지 (낙관적 잠금)
//   클라이언트는 화면에 띄운 시점의 expectedVersion을 함께 보낸다. 그 사이 다른
//   사람이 먼저 저장해 버전이 바뀌었으면 update_document가 VERSION_CONFLICT를
//   던지고, 여기서 409로 바꿔 돌려준다. 자세한 이유는 마이그레이션 파일 참고
//   (20260904010000_optimistic_concurrency.sql).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const expectedVersion = Number.isInteger(body?.expectedVersion) ? body.expectedVersion : null;

    if (!title || !content) {
      return NextResponse.json({ error: "제목과 본문을 입력해주세요." }, { status: 400 });
    }
    if (expectedVersion === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const { embedding, chunks } = await buildDocumentPayload(title, content);
    const supabase = getServerSupabaseClient();

    const { data, error } = await supabase.rpc("update_document", {
      p_id: id,
      p_title: title,
      p_content: content,
      p_embedding: embedding,
      p_employee_id: session.employeeId,
      p_expected_version: expectedVersion,
      p_chunks: chunks,
    });

    if (error) {
      if (error.message?.includes("DOCUMENT_NOT_FOUND")) {
        return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
      }
      if (error.message?.includes("VERSION_CONFLICT")) {
        return NextResponse.json(
          { error: "다른 사람이 방금 이 문서를 수정했습니다. 새로고침한 뒤 다시 시도해주세요." },
          { status: 409 },
        );
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
  });
}
