// 마이그레이션 파일을 Supabase Management API(HTTPS)로 적용한다.
//
// 실행
//   node --env-file=.env scripts/apply-migration.mjs supabase/migrations/2026...._이름.sql
//   node --env-file=.env scripts/apply-migration.mjs --pending      아직 적용 안 된 것 전부
//   node --env-file=.env scripts/apply-migration.mjs --status       적용 현황만 확인
//
// 왜 필요한가
//   `supabase db push` 는 Postgres 직결(포트 5432/6543)을 쓴다. 병원·사내망처럼
//   표준 포트만 열어둔 환경에서는 이 포트가 막혀 push 가 타임아웃된다.
//   Management API 는 HTTPS(443)라 그런 환경에서도 통한다.
//
// 적용 후에는 supabase_migrations.schema_migrations 에 기록해, 나중에 포트가 열린 곳에서
// `supabase db push` 를 실행해도 같은 마이그레이션을 두 번 적용하지 않게 한다.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");
const PROJECT_REF = "oskwrxmsxhrdrgyxpeud";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN 환경변수가 필요합니다.");
  process.exit(1);
}

async function runSql(query) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 500));
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function appliedVersions() {
  const rows = await runSql(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  return new Set(rows.map((r) => r.version));
}

async function localMigrations() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  return files.map((file) => ({
    file,
    version: file.split("_")[0],
    name: file.replace(/^\d+_/, "").replace(/\.sql$/, ""),
    fullPath: path.join(MIGRATIONS_DIR, file),
  }));
}

async function apply(migration) {
  const sql = await readFile(migration.fullPath, "utf8");
  process.stdout.write(`- ${migration.file} 적용 중... `);
  await runSql(sql);
  // 적용 기록. 같은 버전이 이미 있으면 무시한다.
  await runSql(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ('${migration.version}', '${migration.name.replace(/'/g, "''")}')
     on conflict (version) do nothing`,
  );
  console.log("완료");
}

const arg = process.argv[2];
const applied = await appliedVersions();
const local = await localMigrations();

if (!arg || arg === "--status") {
  console.log(`로컬 마이그레이션 ${local.length}개 / 적용됨 ${applied.size}개\n`);
  for (const m of local) {
    console.log(`  ${applied.has(m.version) ? "적용됨" : "대기중"}  ${m.file}`);
  }
  const pending = local.filter((m) => !applied.has(m.version));
  if (pending.length) {
    console.log(`\n대기 중 ${pending.length}개. 적용하려면:`);
    console.log("  node --env-file=.env scripts/apply-migration.mjs --pending");
  }
} else if (arg === "--pending") {
  const pending = local.filter((m) => !applied.has(m.version));
  if (!pending.length) {
    console.log("적용할 마이그레이션이 없습니다.");
  } else {
    console.log(`대기 중 ${pending.length}개를 적용합니다.\n`);
    for (const m of pending) await apply(m);
    console.log("\n완료. 확인: node --env-file=.env scripts/apply-migration.mjs --status");
  }
} else {
  const file = path.basename(arg);
  const migration = local.find((m) => m.file === file);
  if (!migration) {
    console.error(`supabase/migrations 에서 찾을 수 없습니다: ${file}`);
    process.exit(1);
  }
  if (applied.has(migration.version)) {
    console.log(`이미 적용된 마이그레이션입니다: ${migration.file}`);
  } else {
    await apply(migration);
  }
}
