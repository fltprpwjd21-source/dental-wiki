import { buildChunks } from "@/lib/chunks";
import { createEmbedding, createEmbeddings } from "@/lib/embeddings";

// 문서 저장 함수(create_document / update_document / revert_document)에 넘길
// 조각 목록을 만든다. 조각마다 임베딩이 필요해 OpenAI 를 한 번 더 호출한다.
//
// 문서 전체 임베딩도 함께 만든다. 검색에는 조각을 쓰지만, 조각이 없는 문서를
// 찾아내는 용도로 documents.embedding 을 남겨두고 있다.
export async function buildDocumentPayload(title: string, content: string) {
  const chunks = buildChunks(title, content);

  const [documentEmbedding, chunkEmbeddings] = await Promise.all([
    createEmbedding(`${title}\n\n${content}`),
    createEmbeddings(chunks.map((c) => c.content)),
  ]);

  return {
    embedding: documentEmbedding,
    chunks: chunks.map((chunk, i) => ({
      content: chunk.content,
      embedding: chunkEmbeddings[i],
    })),
  };
}
