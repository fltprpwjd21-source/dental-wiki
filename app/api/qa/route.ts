import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createEmbedding } from "@/lib/embeddings";

// 하이브리드 검색(의미 0.6 + 키워드 0.4) 점수 기준.
// 실제 질문 14개로 측정해 정한 값이다.
//   정답이 있어야 하는 질문 10개: 최저 0.2172 ~ 최고 0.4530  (전부 1위 정답)
//   위키에 없는 질문 4개:        최고 0.2713
// 두 구간이 조금 겹쳐서 문턱값만으로는 완전히 못 가른다. 그래서 방어선을 두 겹으로 둔다.
//   1차: 이 문턱값이 명백히 무관한 문서를 거른다
//   2차: 근거가 넘어가도 아래 프롬프트가 "문서에 없으면 추측하지 말라"고 지시한다
// 0.22 이상으로 올리면 정답인 질문이 탈락하기 시작해 0.2 로 둔다.
const MATCH_THRESHOLD = 0.2;
const MATCH_COUNT = 5;
const NO_MATCH_ANSWER = "위키에 등록된 정보가 없습니다.";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
const AI_UNAVAILABLE_MESSAGE = "질문 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

type MatchedDocument = {
  id: string;
  category: "handover" | "insurance" | "policy";
  title: string;
  content: string;
  similarity: number;
};

export async function POST(request: NextRequest) {
  return withSession(async () => {
    const body = await request.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "질문을 입력해주세요." }, { status: 400 });
    }

    // 질문 임베딩·답변 생성은 둘 다 OpenAI 호출이다. 여기를 감싸지 않으면 OpenAI
    // 장애·요금 한도 초과 시 처리되지 않은 예외가 그대로 500으로 나가고, 클라이언트는
    // 어떤 오류인지 알 수 없는 빈 응답을 받는다. 하나의 문구로 묶어 안내한다.
    let queryEmbedding: number[];
    try {
      queryEmbedding = await createEmbedding(question);
    } catch (error) {
      console.error("[qa] 질문 임베딩 생성 실패:", error);
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    const supabase = getServerSupabaseClient();
    // 의미(임베딩)와 키워드를 함께 쓴다. 임베딩만으로는 "사랑니"·"실란트" 같은
    // 한국어 고유명사를 놓쳐 엉뚱한 문서가 1위로 올라온다 (20260904000701 마이그레이션 참고)
    const { data: matches, error } = await supabase.rpc("match_documents", {
      query_embedding: queryEmbedding,
      query_text: question,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT,
    });

    if (error) {
      return NextResponse.json({ error: "검색 중 오류가 발생했습니다." }, { status: 500 });
    }

    const matchedDocuments = (matches ?? []) as MatchedDocument[];

    // PRD 5번①: 근거 문서가 없으면 추측하지 않고 정해진 문장만 답한다
    if (matchedDocuments.length === 0) {
      return NextResponse.json({ answer: NO_MATCH_ANSWER, sources: [] });
    }

    let answer: string;
    try {
      answer = await createAnswer(question, matchedDocuments);
    } catch (error) {
      console.error("[qa] 답변 생성 실패:", error);
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    return NextResponse.json({
      answer,
      sources: matchedDocuments.map((doc) => ({
        id: doc.id,
        title: doc.title,
        category: doc.category,
      })),
    });
  });
}

async function createAnswer(question: string, documents: MatchedDocument[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 환경변수가 필요합니다.");
  }

  const context = documents
    .map((doc, index) => `[문서 ${index + 1}] ${doc.title}\n${doc.content}`)
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          // PRD 5번①의 규칙을 그대로 지시한다.
          // "모른다고 답해라"만 적었더니 AI가 "모릅니다"라고 제멋대로 답해,
          // 화면에 정해진 문구가 나오지 않았다. 그래서 문구를 그대로 못박는다.
          // 또 문서의 "자주 나오는 질문" 절을 베껴 "A: "를 붙이는 일이 있어 함께 막는다.
          content: [
            "너는 치과위키의 Q&A 도우미다.",
            "아래 제공된 문서 내용만 근거로 답한다. 문서에 없는 내용은 절대 추측하지 않는다.",
            `문서에서 답을 찾을 수 없으면 다른 말을 덧붙이지 말고 정확히 이 문장만 답한다: "${NO_MATCH_ANSWER}"`,
            "금액·수치는 문서에 적힌 값을 그대로 옮긴다. 계산하거나 반올림하지 않는다.",
            "한국어로 간결하게 답한다.",
            '"Q:" 나 "A:" 같은 접두사를 붙이지 않는다. 문장으로만 답한다.',
          ].join("\n"),
        },
        { role: "user", content: `문서:\n${context}\n\n질문: ${question}` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI 응답 요청 실패: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content ?? "").trim() || NO_MATCH_ANSWER;
}
