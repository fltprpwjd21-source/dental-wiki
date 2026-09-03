// scripts/seed-documents.mjs와 반드시 같은 모델을 써야 한다 (마이그레이션의 vector(1536)과도 차원이 일치해야 함)
const EMBEDDING_MODEL = "text-embedding-3-small";

export async function createEmbedding(text: string): Promise<number[]> {
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
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI 임베딩 요청 실패: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding as number[];
}
