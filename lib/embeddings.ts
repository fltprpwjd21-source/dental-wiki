// scripts/seed-documents.mjs와 반드시 같은 모델을 써야 한다 (마이그레이션의 vector(1536)과도 차원이 일치해야 함)
const EMBEDDING_MODEL = "text-embedding-3-small";

async function requestEmbeddings(input: string | string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 환경변수가 필요합니다.");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI 임베딩 요청 실패: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  // 응답 순서가 보장되지 않으므로 index 로 정렬한다
  return (data.data as { index: number; embedding: number[] }[])
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export async function createEmbedding(text: string): Promise<number[]> {
  const [embedding] = await requestEmbeddings(text);
  return embedding;
}

// 여러 조각을 한 번의 요청으로 처리한다. 문서 하나에 조각이 10개 넘게 나오는데
// 하나씩 호출하면 저장이 그만큼 느려지고 실패 지점도 늘어난다.
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return requestEmbeddings(texts);
}
