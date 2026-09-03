// PLAN 4번: data/seed-docs의 예시 마크다운 문서를 읽어 Supabase에 등록하고 임베딩을 생성한다.
// 실행: npm run seed:docs (내부적으로 node --env-file=.env 로 .env 값을 읽는다)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DOCS_DIR = path.join(__dirname, "..", "data", "seed-docs");
// supabase/seed.sql에 등록된 테스트용 관리자 사원번호. 문서 최초 등록자로 기록된다.
const SEED_AUTHOR_EMPLOYEE_ID = "00001";
const EMBEDDING_MODEL = "text-embedding-3-small";

function parseFrontmatter(raw, fileName) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`${fileName}: "---" 프런트매터(category, title)를 찾을 수 없습니다.`);
  }
  const [, frontmatterBlock, body] = match;
  const fields = {};
  for (const line of frontmatterBlock.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    fields[key] = value;
  }
  return { category: fields.category, title: fields.title, content: body.trim() };
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  }
  return createClient(url, serviceRoleKey);
}

async function createEmbedding(text) {
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
  const body = await response.json();
  return body.data[0].embedding;
}

async function seedOneDocument(supabase, fileName) {
  const raw = await readFile(path.join(SEED_DOCS_DIR, fileName), "utf8");
  const { category, title, content } = parseFrontmatter(raw, fileName);

  if (!category || !title) {
    console.warn(`- 건너뜀: ${fileName} (category 또는 title 없음)`);
    return;
  }

  console.log(`- ${fileName} 임베딩 생성 중...`);
  const embedding = await createEmbedding(`${title}\n\n${content}`);

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({ category, title, content, embedding, created_by: SEED_AUTHOR_EMPLOYEE_ID })
    .select("id")
    .single();

  if (insertError) {
    console.error(`- 실패: ${fileName} 문서 등록 (${insertError.message})`);
    return;
  }

  const { error: logError } = await supabase.from("document_logs").insert({
    document_id: document.id,
    action: "create",
    previous_content: null,
    new_content: content,
    edited_by: SEED_AUTHOR_EMPLOYEE_ID,
  });

  if (logError) {
    console.error(`- 실패: ${fileName} 로그 기록 (${logError.message})`);
    return;
  }

  console.log(`- 완료: ${fileName} (id: ${document.id})`);
}

async function main() {
  const supabase = getSupabaseClient();
  const fileNames = (await readdir(SEED_DOCS_DIR)).filter((name) => name.endsWith(".md"));

  if (fileNames.length === 0) {
    console.log("data/seed-docs 폴더에 등록할 .md 파일이 없습니다.");
    return;
  }

  for (const fileName of fileNames) {
    await seedOneDocument(supabase, fileName);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
