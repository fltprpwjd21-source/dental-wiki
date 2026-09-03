// 큰 .xlsx 를 메모리에 다 올리지 않고 한 행씩 읽는다.
//
// 심평원 전체판의 "의치과_급여_전체" 시트는 압축을 풀면 400MB가 넘는다.
// 통째로 문자열로 읽으면 메모리가 두 배로 들고(자바스크립트 문자열은 UTF-16),
// 정규식을 그 위에 돌리면 매우 느려진다. 그래서 unzip 출력을 파이프로 받아
// `</row>` 단위로 잘라가며 처리한다.
import { spawn } from "node:child_process";

export function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

export function columnIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// zip 안의 한 항목을 줄 단위가 아니라 구분자 단위로 흘려보낸다
async function* chunksBySeparator(file, entry, separator) {
  const child = spawn("unzip", ["-p", file, entry], { stdio: ["ignore", "pipe", "ignore"] });
  let buffer = "";
  for await (const chunk of child.stdout) {
    buffer += chunk.toString("utf8");
    let idx;
    while ((idx = buffer.indexOf(separator)) !== -1) {
      yield buffer.slice(0, idx + separator.length);
      buffer = buffer.slice(idx + separator.length);
    }
  }
  if (buffer) yield buffer;
}

// 공유 문자열 표. 큰 파일에서도 이것만은 전부 필요하다(셀이 인덱스로 참조한다).
export async function readSharedStrings(file) {
  const strings = [];
  for await (const part of chunksBySeparator(file, "xl/sharedStrings.xml", "</si>")) {
    const m = part.match(/<si>([\s\S]*)<\/si>/);
    if (!m) continue;
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
    strings.push(texts.map((t) => decodeXml(t[1])).join(""));
  }
  return strings;
}

// 시트를 한 행씩 넘겨준다. onRow(cells, rowNumber) 가 false 를 돌려주면 멈춘다.
export async function forEachRow(file, sheetPath, strings, onRow) {
  let rowNumber = 0;
  for await (const part of chunksBySeparator(file, sheetPath, "</row>")) {
    const rowMatch = part.match(/<row[^>]*>([\s\S]*)<\/row>/);
    if (!rowMatch) continue;
    rowNumber++;
    const cells = [];
    for (const c of rowMatch[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, inner = ""] = c;
      const v = inner.match(/<v>([\s\S]*?)<\/v>/);
      const texts = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
      let value = "";
      if (/t="s"/.test(attrs) && v) value = strings[Number(v[1])] ?? "";
      else if (texts.length) value = texts.map((t) => decodeXml(t[1])).join("");
      else if (v) value = decodeXml(v[1]);
      cells[columnIndex(ref)] = value;
    }
    const normalized = [];
    for (let i = 0; i < cells.length; i++) normalized[i] = (cells[i] ?? "").toString().trim();
    if (onRow(normalized, rowNumber) === false) return;
  }
}

// 시트 이름 -> xl/worksheets/sheetN.xml 경로
export async function sheetPaths(file) {
  const { execFileSync } = await import("node:child_process");
  const wb = execFileSync("unzip", ["-p", file, "xl/workbook.xml"], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  const rels = execFileSync("unzip", ["-p", file, "xl/_rels/workbook.xml.rels"], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  const relMap = new Map();
  for (const m of rels.matchAll(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]*)"/g)) {
    relMap.set(m[1], m[2].replace(/^\/?xl\//, "").replace(/^\.\//, ""));
  }
  const out = [];
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g)) {
    const target = relMap.get(m[2]);
    if (target) out.push({ name: decodeXml(m[1]), path: `xl/${target}` });
  }
  return out;
}
