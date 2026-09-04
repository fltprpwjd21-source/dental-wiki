import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { buildDocumentPayload } from "@/lib/document-write";
import { isUuid } from "@/lib/uuid";

// PLAN 11번: 로그에서 선택한 이전 버전으로 되돌린다. 되돌리기도 하나의 로그(action: revert)로 남는다.
//
// 문서 갱신과 로그 기록은 revert_document 함수 안에서 한 트랜잭션으로 처리된다.
// 임베딩은 외부 API(OpenAI) 호출이라 함수 안에서 만들 수 없어, 되돌릴 버전의
// 제목·본문을 먼저 읽어 임베딩을 만든 뒤 함수에 넘긴다.
// 로그는 수정·삭제가 불가능하므로, 여기서 읽은 값과 함수가 읽는 값은 항상 같다.
//
// 동시 편집 감지 (낙관적 잠금)
//   화면에 띄운 시점의 expectedVersion을 함께 보낸다. 그 사이 다른 사람이 먼저
//   저장했으면 VERSION_CONFLICT가 나고, 여기서 409로 바꿔 돌려준다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async (session) => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const logId = typeof body?.logId === "string" ? body.logId : "";
    const expectedVersion = Number.isInteger(body?.expectedVersion) ? body.expectedVersion : null;

    if (!logId || !isUuid(logId)) {
      return NextResponse.json({ error: "되돌릴 버전을 선택해주세요." }, { status: 400 });
    }
    if (expectedVersion === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();

    const { data: targetLog, error: logFetchError } = await supabase
      .from("document_logs")
      .select("document_id, new_title, new_content")
      .eq("id", logId)
      .maybeSingle();

    if (logFetchError || !targetLog || targetLog.document_id !== id) {
      return NextResponse.json({ error: "되돌릴 버전을 찾을 수 없습니다." }, { status: 404 });
    }

    const { embedding, chunks } = await buildDocumentPayload(
      targetLog.new_title,
      targetLog.new_content,
    );

    const { data, error } = await supabase.rpc("revert_document", {
      p_id: id,
      p_log_id: logId,
      p_embedding: embedding,
      p_employee_id: session.employeeId,
      p_expected_version: expectedVersion,
      p_chunks: chunks,
    });

    if (error) {
      if (error.message?.includes("LOG_NOT_FOUND")) {
        return NextResponse.json({ error: "되돌릴 버전을 찾을 수 없습니다." }, { status: 404 });
      }
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
        return NextResponse.json({ error: "이미 같은 내용입니다." }, { status: 400 });
      }
      return NextResponse.json({ error: "되돌리기에 실패했습니다." }, { status: 500 });
    }

    if (!data?.[0]) {
      return NextResponse.json({ error: "되돌리기에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ document: data[0] });
  });
}
