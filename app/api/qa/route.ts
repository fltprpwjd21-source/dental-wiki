import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createEmbedding } from "@/lib/embeddings";

const MATCH_THRESHOLD = 0.5;
const MATCH_COUNT = 5;
const NO_MATCH_ANSWER = "위키에 등록된 정보가 없습니다.";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

type MatchedDocument = {
  id: string;
  category: "handover" | "insurance" | "policy";
  title: string;
  content: string;
  similarity: number;
};

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "질문을 입력해주세요." }, { status: 400 });
  }

  const queryEmbedding = await createEmbedding(question);

  const supabase = getServerSupabaseClient();
  const { data: matches, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
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

  const answer = await createAnswer(question, matchedDocuments);

  return NextResponse.json({
    answer,
    sources: matchedDocuments.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
    })),
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
          content:
            "너는 치과위키의 Q&A 도우미다. 아래 제공된 문서 내용만 근거로 답변하고, 문서에 없는 내용은 추측하지 말고 모른다고 답해라. 한국어로 간결하게 답한다.",
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
