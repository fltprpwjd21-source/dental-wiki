// 심평원 수가표 원본(.xlsx)에서 우리 병원에 해당하는 치과 항목만 뽑아낸다.
//
// 실행
//   node scripts/extract-dental-fees.mjs <엑셀파일>            주제별 요약
//   node scripts/extract-dental-fees.mjs <엑셀파일> 임플란트     주제 상세
//   node scripts/extract-dental-fees.mjs <엑셀파일> --audit     포함/제외 기준 점검
//
// 수가는 매년 바뀐다. 새 원본을 받으면 먼저 --audit 으로 기준이 여전히 맞는지 확인한다.
//
// ── 반드시 원본을 쓸 것 ─────────────────────────────────────────
// "치과 관련 항목만 남겼다"는 가공 파일을 쓰면 안 된다. 실제로 그런 파일에서
// 치면열구전색술(차39)·치면세마(차23) 같은 흔한 급여 항목이 통째로 빠져 있었다.
// 빠진 항목은 이 파일만 봐서는 알 수 없어서, 직원이 "급여가 아니구나"로
// 오해하게 된다. 원본을 넣으면 이 스크립트가 알아서 걸러낸다.
//
// ── 이 스크립트가 다루는 함정 세 가지 ───────────────────────────
//
// 1) 단어로 고르면 안 된다
//    "임플란트"로 고르면 녹내장임플란트삽입술(안과)이, "전색"으로 고르면
//    외이도이구전색제거(이과)가 들어온다. 그래서 분류번호 장(章)과 장구분으로 고른다.
//
// 2) 장(章) 하나만으로도, 장구분 하나만으로도 부족하다
//    치과 처치·수술은 차/찬/처 장에 모여 있지만, 치과 마취(바)·치과 방사선(다)·
//    치과 진찰료(가)는 다른 장에 흩어져 있다. 그래서 핵심 장 + 이름으로 확인한
//    개별 항목을 합친다.
//
// 3) 금액이 들어있는 열이 종별에 따라 다르다
//    같은 항목이 요양기관 종별로 여러 행으로 갈리고, 종별에 따라 금액이
//    `치과병의원단가`에 있거나 `병원급이상단가`에 있다.
//    치과의원·치과병원·부속치과병원   → 치과병의원단가
//    종합병원내치과·상급종합병원내치과 → 병원급이상단가
//    `치과병의원단가` 열만 보면 상급종합병원 내 치과는 전부 0원으로 보인다.
import { readSharedStrings, forEachRow, sheetPaths } from "./lib/xlsx-stream.mjs";

// ── 우리 병원 설정 ──────────────────────────────────────────────
// 종별이 바뀌면 이 두 줄만 고치면 된다.
const OUR_KIND = "상급종합병원내치과";
const OUR_PRICE_COLUMN = "병원급이상단가";

// 치과 항목만 모여 있는 장. 이 장은 전체를 가져온다.
//   차 = 치과 처치·수술 (급여)   찬 = 임플란트·틀니 (급여)
//   처 = 치과 가산·기타          초 = 치과 비급여
const DENTAL_CHAPTERS = ["차", "찬", "처", "초"];

// 의·치과가 섞여 있는 장. 이 장에서만 이름으로 치과 항목을 골라온다.
//   가 = 진찰료   나 = 검사료(치과 검사)   다 = 영상진단(치과 촬영)   바 = 마취
//
// 그 외 장은 아예 보지 않는다. 특히 자·저 장의 구강악안면외과 대수술
// (상악골절제술, 하악골재건술, Le Fort 등)은 의도적으로 제외했다.
// 이 위키의 사용자는 치과위생사·기공사·방사선사이고, 그분들이 묻는 영역이 아니다.
// 또 이름 규칙만으로 그 장을 훑으면 "상악동근치수술"(치수), "팔꿈치관절 의지"(치관)
// 처럼 글자가 겹치는 의과 항목이 계속 섞여 들어온다.
const MIXED_CHAPTERS = ["가", "나", "다", "바"];

// 이름으로 치과 항목을 고르는 규칙 (MIXED_CHAPTERS 안에서만 쓴다)
// `의치`는 넣지 않는다. 실제 의치 항목은 모두 차·찬 장에 있어 장 기준으로 이미 들어오고,
// 이름 규칙에 넣으면 "모의치료"(방사선치료계획)가 걸려 들어온다.
const DENTAL_NAME = /치과|치아|치수|치근|치관|치석|치주|치은|잇몸|구강|악골|악관절|발치|근관|보철|틀니|임플란트|금관|인레이|온레이|매복치|과잉치|유치|영구치|치면|열구|교합|하악골|상악골|측두하악|파노라마/;

// 이름 규칙에 걸리지만 치과가 아닌 항목 (오탐 차단)
//
// 한 글자짜리 장기 이름은 절대 쓰지 않는다. 예전에 `간`을 넣었더니 "간호관리료"가,
// `위`를 넣었더니 "상위"가 걸려서 정상 항목이 조용히 빠졌다.
// 반드시 그 항목만 가리키는 충분히 긴 낱말을 쓴다.
const NOT_DENTAL =
  /녹내장|카테터|외이도|이구전색|내향성|비밸브|요실금|유방|관상동맥|기관내|부비동|비인강|누점|누관|고막|각막|망막|모의치료|체외조사|밀봉소선원|전신조사/;

// 치과 진료 행위가 아닌 병원 공통 항목. 이름에 "치과병원"이 들어가지만
// 수가 문서에 담을 내용이 아니라 따로 제외한다.
const NOT_PROCEDURE = /입원료|간호관리료|기본식사|기본점수|병실|식대|교통비|정액수가/;

const file = process.argv[2];
const arg = process.argv[3] || "";

if (!file) {
  console.error("사용법: node scripts/extract-dental-fees.mjs <엑셀파일> [검색어|--audit]");
  process.exit(1);
}

const chapterOf = (classNo) => (classNo.match(/^[가-힣]+/) || [""])[0];
const toNumber = (s) => Number((s || "0").replace(/,/g, "")) || 0;

// 항목명 끝의 종별 문구를 떼어낸다. 공백 표기가 섞여 있어 공백을 지워 비교한다.
function splitKind(name) {
  const m = name.match(/^(.*)-([^-]*(?:치과|병원|의원|보건의료원)[^-]*)$/);
  if (!m) return { base: name, kind: null };
  return { base: m[1], kind: m[2].replace(/\s+/g, "") };
}

// allChapters: 비급여·100대100 시트에 쓴다. 이 시트들은 장 번호 체계가 급여와 달라
//   (노=검사, 도=영상, 보=마취) 위 MIXED_CHAPTERS 가 맞지 않는다. 대신 전체 행이
//   400여 개뿐이라 이름 규칙을 모든 장에 적용하고 결과를 눈으로 확인할 수 있다.
function isDental(classNo, name, allChapters = false) {
  if (NOT_PROCEDURE.test(name)) return null;
  const chapter = chapterOf(classNo);
  if (DENTAL_CHAPTERS.includes(chapter)) return "장";
  if (!allChapters && !MIXED_CHAPTERS.includes(chapter)) return null;
  if (DENTAL_NAME.test(name) && !NOT_DENTAL.test(name)) return "이름";
  return null;
}

const strings = await readSharedStrings(file);
const sheets = await sheetPaths(file);

const find = (name) => sheets.find((s) => s.name === name);
const SHEETS = {
  급여: find("의치과_급여_전체"),
  비급여: find("의치과_비급여_전체"),
  "100대100": find("의치과_100대100_전체"),
};
for (const [label, sheet] of Object.entries(SHEETS)) {
  if (!sheet) {
    console.error(`시트를 찾을 수 없습니다: 의치과_${label}_전체`);
    console.error(`이 파일의 시트: ${sheets.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }
}

async function collect(sheet, { needKind, allChapters = false }) {
  const items = new Map();
  const excluded = new Map(); // 오탐으로 뺀 것 (감사용)
  let iCode = -1, iDate = -1, iClass = -1, iName = -1, iSur = -1, iPriceOur = -1, iPriceDental = -1;

  await forEachRow(file, sheet.path, strings, (cells, n) => {
    if (n === 1) {
      iCode = cells.indexOf("수가코드");
      iDate = cells.indexOf("적용일자");
      iClass = cells.indexOf("분류번호");
      iName = cells.indexOf("한글명");
      iSur = cells.indexOf("산정명칭");
      iPriceOur = cells.indexOf(OUR_PRICE_COLUMN);
      iPriceDental = cells.indexOf("치과병의원단가");
      return;
    }
    if (!cells[0]) return;

    const classNo = cells[iClass] ?? "";
    const rawName = cells[iName] ?? "";
    const reason = isDental(classNo, rawName, allChapters);
    if (!reason) {
      if (DENTAL_NAME.test(rawName)) excluded.set(rawName, classNo);
      return;
    }

    const { base, kind } = splitKind(rawName);
    // 종별이 붙은 항목은 우리 종별만. 종별이 없는 항목은 모두 대상.
    if (needKind && kind && kind !== OUR_KIND) return;

    const surcharge = cells[iSur] ?? "";
    // 금액은 반드시 우리 종별의 열에서만 읽는다.
    // 예전에 두 열의 큰 값을 쓴 적이 있는데, 종별 표기가 없는 항목에서
    // 치과의원·치과병원 요율(치과병의원단가)이 잡혀 금액이 20%가량 높게 나왔다.
    //   예) 차39 치면열구전색술 — 병원급이상 29,440 / 치과병의원 35,520
    // 금액이 0이면 "우리 종별로는 청구할 수 없는 항목"이라는 뜻이므로 0을 그대로 쓴다.
    const price = toNumber(cells[iPriceOur]);

    const key = `${classNo} ${base}`;
    const prev = items.get(key);
    // 기본 수가 행(산정명칭 빈칸)을 우선하고, 같은 조건이면 큰 금액을 쓴다
    if (!prev || (prev.surcharge && !surcharge) || (!surcharge === !prev.surcharge && price > prev.price)) {
      items.set(key, {
        code: cells[iCode] ?? "",
        date: cells[iDate] ?? "",
        classNo,
        name: base,
        kind,
        price,
        surcharge,
        reason,
      });
    }
  });

  return { items: [...items.values()], excluded };
}

const gy = await collect(SHEETS.급여, { needKind: true });
const bgy = await collect(SHEETS.비급여, { needKind: false, allChapters: true });
const b100 = await collect(SHEETS["100대100"], { needKind: false, allChapters: true });

const sortByClass = (a, b) => a.classNo.localeCompare(b.classNo, "ko", { numeric: true });

if (arg === "--audit") {
  console.log(`파일: ${file}\n`);
  console.log("=== 포함 기준 ===");
  console.log(`  분류번호 장 전체: ${DENTAL_CHAPTERS.join(", ")}`);
  console.log(`  그 외 장: 항목명이 치과 용어에 해당하는 것만`);
  console.log(`  종별: ${OUR_KIND}  (금액은 "${OUR_PRICE_COLUMN}" 열)\n`);

  const byReason = (list) => ({
    장: list.filter((x) => x.reason === "장").length,
    이름: list.filter((x) => x.reason === "이름").length,
  });
  for (const [label, r] of [["급여", gy], ["비급여", bgy], ["100대100", b100]]) {
    const c = byReason(r.items);
    console.log(`  ${label.padEnd(9)} ${String(r.items.length).padStart(4)}개  (장 기준 ${c.장} / 이름 기준 ${c.이름})`);
  }

  console.log("\n=== 이름에 치과 용어가 있지만 제외한 항목 (오탐 차단 확인) ===");
  const ex = [...gy.excluded.entries()].slice(0, 12);
  ex.forEach(([name, cls]) => console.log(`  ${cls.padEnd(11)} ${name.slice(0, 66)}`));
  console.log(`  ... 총 ${gy.excluded.size}종`);

  console.log("\n=== 흔한 치과 급여 항목이 빠지지 않았는지 점검 ===");
  const must = [
    ["보통처치", /보통처치/], ["치아진정처치", /치아진정처치/], ["발수", /발수/],
    ["근관세척", /근관세척/], ["근관충전", /근관충전/], ["치석제거", /치석제거/],
    ["치면세마", /치면세마/], ["치면열구전색술", /치면열구전색술/], ["발치술", /발치술/],
    ["임플란트", /치과임플란트/], ["완전틀니", /완전틀니/], ["부분틀니", /부분틀니/],
    ["치과침윤마취", /치과침윤마취/], ["파노라마", /파노라마/],
  ];
  for (const [label, re] of must) {
    const hit = gy.items.filter((x) => re.test(x.name));
    console.log(`  ${label.padEnd(14)} ${hit.length ? "있음 " + hit.length + "개  " + hit[0].classNo : "❌ 없음"}`);
  }
} else if (arg) {
  const show = (label, list, priced) => {
    const hit = list.filter((x) => x.name.includes(arg) || x.classNo.includes(arg)).sort(sortByClass);
    if (!hit.length) return;
    console.log(`\n=== ${label}: ${hit.length}개 ===`);
    for (const x of hit) {
      const money = priced ? (x.price ? x.price.toLocaleString() + "원" : "-") : "병원 자체 결정";
      console.log(`  ${x.classNo.padEnd(13)}| ${money.padStart(13)} | ${x.name.slice(0, 60)}`);
    }
  };
  console.log(`"${arg}"  (종별: ${OUR_KIND}, 금액 열: ${OUR_PRICE_COLUMN})`);
  show("급여", gy.items, true);
  show("비급여 (금액은 병원이 정한다)", bgy.items, false);
  show("100대100 (급여이지만 환자 전액 부담)", b100.items, true);
} else {
  console.log(`파일: ${file}`);
  console.log(`종별: ${OUR_KIND}  (금액은 "${OUR_PRICE_COLUMN}" 열에서 읽음)\n`);
  console.log(`급여 ${gy.items.length}개 · 비급여 ${bgy.items.length}개 · 100대100 ${b100.items.length}개\n`);

  const topics = {
    임플란트: /임플란트/,
    "틀니·의치": /틀니|의치/,
    "치석제거·치주": /치석|치주|치면세마/,
    "예방(실란트 등)": /치면열구전색술|불소/,
    발치: /발치/,
    근관치료: /근관|발수|치수/,
    "충전·보철": /충전|금관|인레이|온레이|포스트|코어|가공의치/,
    마취: /마취/,
    방사선: /촬영|파노라마|하악골|상악골|치근단/,
    "교정·악관절": /교정|악관절|교합/,
    처치: /처치|치아파절|치관확대/,
  };
  console.log("  주제                | 급여 | 비급여 | 100대100");
  console.log("  " + "-".repeat(52));
  for (const [label, re] of Object.entries(topics)) {
    const a = gy.items.filter((x) => re.test(x.name)).length;
    const b = bgy.items.filter((x) => re.test(x.name)).length;
    const c = b100.items.filter((x) => re.test(x.name)).length;
    console.log(`  ${label.padEnd(20)}| ${String(a).padStart(4)} | ${String(b).padStart(6)} | ${String(c).padStart(8)}`);
  }
  console.log(`\n  기준 점검:  node scripts/extract-dental-fees.mjs "${file}" --audit`);
  console.log(`  주제 상세:  node scripts/extract-dental-fees.mjs "${file}" 임플란트`);
}
