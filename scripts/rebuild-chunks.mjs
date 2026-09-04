// 이미 등록된 문서의 검색용 조각(청크)을 다시 만든다.
//
// 실행
//   node --env-file=.env scripts/rebuild-chunks.mjs           조각이 없는 문서만
//   node --env-file=.env scripts/rebuild-chunks.mjs --all     모든 문서 다시 만들기
//   node --env-file=.env scripts/rebuild-chunks.mjs --status  현황만 확인
//
// 언제 쓰는가
//   - 청킹을 도입하기 전에 등록된 문서에 조각을 채워 넣을 때
//   - lib/chunks.ts 의 자르는 규칙을 바꿔 전체를 다시 만들어야 할 때
//
// 문서 본문은 건드리지 않는다. 조각은 검색용 파생 데이터라 지우고 다시 만들어도
// 수정 이력(document_logs)에 영향이 없다.
import { createClient } from "@supabase/supabase-js";
import { buildChunks } from "../lib/chunks.ts";

const EMBEDDING_MODEL = "text-embedding-3-small";
const REBUILD_ALL = process.argv.includes("--all");
const STATUS_ONLY = process.argv.includes("--status");

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  }
  return createClient(url, key);
}

async function requestEmbeddings(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 환경변수가 필요합니다.");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI 임베딩 요청 실패: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  return body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

const supabase = getSupabaseClient();

const { data: documents, error } = await supabase
  .from("documents")
  .select("id, title, content")
  .order("created_at");
if (error) throw new Error(`문서 조회 실패: ${error.message}`);

const { data: chunkRows, error: chunkError } = await supabase
  .from("document_chunks")
  .select("document_id");
if (chunkError) throw new Error(`조각 조회 실패: ${chunkError.message}`);

const chunkCount = new Map();
for (const row of chunkRows ?? []) {
  chunkCount.set(row.document_id, (chunkCount.get(row.document_id) ?? 0) + 1);
}

console.log(`문서 ${documents.length}건 / 조각 ${chunkRows?.length ?? 0}개\n`);

if (STATUS_ONLY) {
  for (const doc of documents) {
    const n = chunkCount.get(doc.id) ?? 0;
    console.log(`  ${n === 0 ? "없음 " : String(n).padStart(2) + "개 "}  ${doc.title.slice(0, 52)}`);
  }
  const missing = documents.filter((d) => !chunkCount.get(d.id)).length;
  if (missing) {
    console.log(`\n조각이 없는 문서 ${missing}건. 만들려면:`);
    console.log("  node --env-file=.env scripts/rebuild-chunks.mjs");
  }
  process.exit(0);
}

const targets = REBUILD_ALL ? documents : documents.filter((d) => !chunkCount.get(d.id));

if (targets.length === 0) {
  console.log("모든 문서에 조각이 있습니다. 전부 다시 만들려면 --all 을 붙이세요.");
  process.exit(0);
}

console.log(`${targets.length}건의 조각을 ${REBUILD_ALL ? "다시" : ""} 만듭니다.\n`);

let done = 0;
let failed = 0;
for (const doc of targets) {
  try {
    const chunkList = buildChunks(doc.title, doc.content);
    if (chunkList.length === 0) {
      console.log(`- 건너뜀: ${doc.title.slice(0, 40)} (본문이 비어 있습니다)`);
      continue;
    }
    process.stdout.write(`- ${doc.title.slice(0, 44)} … 조각 ${chunkList.length}개 `);
    const embeddings = await requestEmbeddings(chunkList.map((c) => c.content));
    const chunks = chunkList.map((c, i) => ({ content: c.content, embedding: embeddings[i] }));

    const { error: rpcError } = await supabase.rpc("replace_document_chunks", {
      p_document_id: doc.id,
      p_chunks: chunks,
    });
    if (rpcError) throw new Error(rpcError.message);

    console.log("완료");
    done++;
  } catch (e) {
    console.log(`실패 (${e.message})`);
    failed++;
  }
}

console.log(`\n완료 ${done}건 / 실패 ${failed}건`);
if (failed > 0) process.exitCode = 1;
