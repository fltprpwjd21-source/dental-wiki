// Supabase 프로젝트 간 데이터 이관 (리전 이전용, 2026-09-05 시드니 → 서울)
//
// 실행
//   node --env-file=.env scripts/migrate-project.mjs --check    현재 상태만 비교
//   node --env-file=.env scripts/migrate-project.mjs            실제 이관
//
// 전제
//   .env 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 이미 새 프로젝트(서울)를
//   가리키고 있고, 옛 프로젝트(시드니)는 OLD_ 접두사로 따로 들어 있어야 한다.
//     OLD_SUPABASE_URL / OLD_SUPABASE_SERVICE_ROLE_KEY
//   그리고 새 프로젝트에는 마이그레이션이 이미 전부 적용돼 있어야 한다.
//     SUPABASE_PROJECT_REF=<새 ref> node --env-file=.env scripts/apply-migration.mjs --pending
//
// 원칙
//   - 옛 프로젝트는 읽기만 한다. 실패해도 원본은 그대로이므로 롤백은 .env 를 되돌리는 것뿐이다.
//   - 순서가 중요하다: 참조되는 쪽(문서·노드)을 먼저, 참조하는 쪽(조각·로그)을 나중에.
//   - node_logs / document_logs 는 불변 트리거가 UPDATE·DELETE 만 막고 INSERT 는 허용하므로
//     그대로 옮길 수 있다.
import { createClient } from "@supabase/supabase-js";

const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`${k} 환경변수가 필요합니다.`);
    process.exit(1);
  }
  return v;
};

const oldDb = createClient(need("OLD_SUPABASE_URL"), need("OLD_SUPABASE_SERVICE_ROLE_KEY"));
const newDb = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"));
const checkOnly = process.argv.includes("--check");
const BUCKET = "file-server";

// 참조되는 쪽부터. document_chunks 는 documents 를, node_logs 는 nodes 를 참조한다.
const TABLES = [
  "employee_whitelist",
  "documents",
  "document_logs",
  "document_chunks",
  "nodes",
  "node_logs",
];

async function countAll(db, label) {
  const out = {};
  for (const t of TABLES) {
    const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
    out[t] = error ? `오류(${error.message.slice(0, 40)})` : count;
  }
  const { data: files } = await db.storage.from(BUCKET).list("", { limit: 1000 });
  out["storage(폴더)"] = files ? files.length : "오류";
  console.log(`[${label}]`, JSON.stringify(out));
  return out;
}

// 생성 컬럼(generated always as ... stored)은 값을 직접 넣을 수 없다.
// 원본 컬럼(content)만 넣으면 DB가 알아서 다시 계산한다.
const GENERATED_COLUMNS = { document_chunks: ["content_tsv"] };

async function copyTable(name) {
  const { data, error } = await oldDb.from(name).select("*");
  if (error) throw new Error(`${name} 읽기 실패: ${error.message}`);
  if (!data.length) {
    console.log(`  ${name}: 0건 (건너뜀)`);
    return;
  }

  const drop = GENERATED_COLUMNS[name] ?? [];
  const rows = drop.length
    ? data.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !drop.includes(k))))
    : data;

  // ignoreDuplicates: 이미 있는 행은 건드리지 않고 넘어간다(= on conflict do nothing).
  // 그냥 upsert 를 쓰면 충돌 시 UPDATE 가 나가는데, document_logs·node_logs 는 불변
  // 트리거가 UPDATE 를 막고 있어 재실행이 실패한다. 이 방식이라야 몇 번을 돌려도 안전하다.
  const { error: insErr } = await newDb.from(name).upsert(rows, { ignoreDuplicates: true });
  if (insErr) throw new Error(`${name} 쓰기 실패: ${insErr.message}`);
  console.log(`  ${name}: ${rows.length}건 이관${drop.length ? ` (생성 컬럼 ${drop.join(",")} 제외)` : ""}`);
}

// 스토리지는 노트 id 폴더 아래에 첨부 id 로 저장된다 → 폴더를 훑어 파일을 하나씩 옮긴다.
async function copyStorage() {
  const { data: folders, error } = await oldDb.storage.from(BUCKET).list("", { limit: 1000 });
  if (error) throw new Error(`스토리지 목록 실패: ${error.message}`);

  let moved = 0;
  for (const folder of folders ?? []) {
    const { data: files } = await oldDb.storage.from(BUCKET).list(folder.name, { limit: 1000 });
    for (const file of files ?? []) {
      const path = `${folder.name}/${file.name}`;
      const { data: blob, error: dlErr } = await oldDb.storage.from(BUCKET).download(path);
      if (dlErr) throw new Error(`${path} 내려받기 실패: ${dlErr.message}`);
      const buffer = Buffer.from(await blob.arrayBuffer());
      const { error: upErr } = await newDb.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: blob.type || "application/octet-stream", upsert: true });
      if (upErr) throw new Error(`${path} 올리기 실패: ${upErr.message}`);
      moved += 1;
      console.log(`  파일 ${path} (${buffer.length}바이트)`);
    }
  }
  console.log(`  스토리지 ${moved}개 이관`);
}

console.log("이관 전 상태");
const before = await countAll(oldDb, "옛 프로젝트(시드니)");
await countAll(newDb, "새 프로젝트(서울)");

if (checkOnly) {
  console.log("\n--check 모드라 아무것도 바꾸지 않았습니다.");
  process.exit(0);
}

console.log("\n테이블 이관");
for (const t of TABLES) await copyTable(t);

console.log("\n스토리지 이관");
await copyStorage();

console.log("\n이관 후 대조");
const after = await countAll(newDb, "새 프로젝트(서울)");

let mismatch = false;
for (const t of TABLES) {
  if (before[t] !== after[t]) {
    console.log(`❌ ${t}: 옛 ${before[t]}건 vs 새 ${after[t]}건`);
    mismatch = true;
  }
}
console.log(mismatch ? "\n건수가 어긋납니다. 확인이 필요합니다." : "\n✅ 모든 테이블 건수 일치");
