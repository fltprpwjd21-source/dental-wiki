// 기공물 시제품용 더미 데이터.
//
// 실행
//   node --env-file=.env scripts/seed-labwork-demo.mjs          외부 20줄 + 내부 6줄 넣는다
//   node --env-file=.env scripts/seed-labwork-demo.mjs --clear   전부 지우고 다시 넣는다
//   node --env-file=.env scripts/seed-labwork-demo.mjs --empty   지우기만 한다
//
// 여기 나오는 이름·등록번호는 전부 지어낸 값이다.
//   실제 환자 정보를 이 스크립트에 넣지 않는다 — 지금 이 DB 는 병원 밖에 있고,
//   스크립트는 저장소에 커밋된다(CLAUDE.md 보안 규칙).
const REF = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_ACCESS_TOKEN 이 필요합니다.");
  process.exit(1);
}

const 성 = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권"];
const 이름 = ["민수", "지훈", "서연", "예은", "도현", "하윤", "준우", "시우", "지아", "은서",
              "채원", "현우", "수빈", "다은", "태윤"];
const 보철물 = ["zir cr", "temp cr", "denture repair", "custom abutment", "study model"];
const 기공소 = ["한양대", "서울기공", "대한덴탈", "미소치기공"];
const 치식후보 = ["16", "26", "36", "46", "14,15", "24,25,26", "11", "37", "17,18"];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const int = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// 오늘을 기준으로 앞뒤로 흩는다 — 지난 것·오늘·앞으로 올 것이 섞여야 화면을 제대로 본다.
function dayFrom(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function makeRow(scope) {
  const 의뢰 = int(-25, -1);
  const 예정 = 의뢰 + int(4, 20);
  // 예정일이 지난 것 중 일부만 도착 처리한다. 전부 도착이면 「안 온 것 찾기」를 못 본다.
  const 도착함 = 예정 < 0 && Math.random() < 0.7;
  const 개수 = int(1, 3);
  return {
    scope,
    lab: scope === "internal" ? "기공실" : pick(기공소),
    patient_chart_no: String(int(10000000, 99999999)),
    ordered_on: dayFrom(의뢰),
    patient_name: pick(성) + pick(이름),
    doctor: pick(성) + pick(이름),
    kind: pick(보철물),
    tooth: pick(치식후보),
    tooth_count: 개수,
    ab_count: Math.random() < 0.4 ? int(1, 2) : null,
    due_on: dayFrom(예정),
    note: Math.random() < 0.35 ? pick(["교합력 셈.", "쉐이드 A2", "재제작", "의뢰서 참고", "당일 필요"]) : "",
    arrived_on: 도착함 ? dayFrom(예정 + int(0, 2)) : null,
    oral_scan: Math.random() < 0.4,
    created_by: "00001",
    updated_by: "00001",
  };
}

const sql = (q) =>
  fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  }).then(async (r) => {
    const t = await r.text();
    if (!r.ok) throw new Error(t.slice(0, 400));
    return JSON.parse(t);
  });

const lit = (v) =>
  v === null || v === undefined ? "null"
  : typeof v === "number" ? String(v)
  : typeof v === "boolean" ? (v ? "true" : "false")
  : `'${String(v).replace(/'/g, "''")}'`;

const args = process.argv.slice(2);
if (args.includes("--clear") || args.includes("--empty")) {
  await sql("delete from labwork_items");
  console.log("기존 줄을 모두 지웠습니다.");
  if (args.includes("--empty")) process.exit(0);
}

const rows = [
  ...Array.from({ length: 20 }, () => makeRow("external")),
  ...Array.from({ length: 6 }, () => makeRow("internal")),
];
const cols = Object.keys(rows[0]);
await sql(
  `insert into labwork_items (${cols.join(", ")}) values ` +
    rows.map((r) => `(${cols.map((c) => lit(r[c])).join(", ")})`).join(", "),
);

const [{ external, internal, 도착 }] = await sql(`
  select count(*) filter (where scope = 'external') as external,
         count(*) filter (where scope = 'internal') as internal,
         count(*) filter (where arrived_on is not null) as 도착
    from labwork_items`);
console.log(`넣었습니다 — 외부 ${external}줄, 내부 ${internal}줄 (그중 도착 ${도착}줄)`);
console.log("이름·등록번호는 전부 지어낸 값입니다.");
