// 문서를 검색 단위로 쪼갠다 (청킹).
//
// 왜 필요한가
//   문서 하나를 임베딩 하나로 만들면, 문서가 길수록 특정 단어의 신호가 묻힌다.
//   실제로 2,000자짜리 수가 문서에 "사랑니 빼는 거 얼마예요?"가 그대로 적혀 있는데도
//   같은 질문의 유사도가 0.27에 그쳤다. 281자짜리 짧은 예시 문서가 0.58을 받은 것과 대비된다.
//   절 단위로 쪼개면 각 조각이 짧아져 신호가 살아난다.
//
// 자르는 기준
//   마크다운의 `## ` 제목을 경계로 삼는다. 문서를 쓸 때 이미 주제별로 절을 나누므로
//   의미 단위와 일치한다. (data/templates/README.md 의 작성 요령 참고)
//
// 각 조각에 문서 제목을 붙이는 이유
//   조각만 떼어 놓으면 무엇에 대한 이야기인지 알 수 없다. "장애인 가산" 절만 보면
//   발치 얘기인지 근관치료 얘기인지 알 수 없어, 엉뚱한 문서가 근거로 잡힌다.
//   그래서 모든 조각 앞에 문서 제목을 붙여 임베딩한다.

/** 한 조각이 이보다 길면 문단 단위로 한 번 더 나눈다 */
const MAX_CHUNK_LENGTH = 1200;

/** 이보다 짧은 조각은 앞 조각에 붙인다 (제목만 있는 절 등) */
const MIN_CHUNK_LENGTH = 40;

export type DocumentChunk = {
  /** 문서 안에서의 순서 (0부터) */
  index: number;
  /** 임베딩에 넣을 본문. 맨 앞에 문서 제목이 붙어 있다 */
  content: string;
};

function splitLongSection(section: string): string[] {
  if (section.length <= MAX_CHUNK_LENGTH) return [section];

  const paragraphs = section.split(/\n\s*\n/);
  const out: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > MAX_CHUNK_LENGTH) {
      out.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + paragraph;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * 문서를 검색용 조각으로 나눈다.
 * 절(`## `)이 하나도 없는 짧은 문서는 통째로 한 조각이 된다.
 */
export function buildChunks(title: string, content: string): DocumentChunk[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // `## ` 제목 앞에서 자른다. 제목 줄은 뒤따르는 조각에 포함시킨다.
  const sections = trimmed
    .split(/\n(?=##\s)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const pieces: string[] = [];
  for (const section of sections) {
    for (const part of splitLongSection(section)) {
      // 너무 짧은 조각은 앞 조각에 붙인다
      if (pieces.length > 0 && part.length < MIN_CHUNK_LENGTH) {
        pieces[pieces.length - 1] += "\n\n" + part;
      } else {
        pieces.push(part);
      }
    }
  }

  if (pieces.length === 0) pieces.push(trimmed);

  return pieces.map((piece, index) => ({
    index,
    // 조각만 봐도 무슨 문서인지 알 수 있게 제목을 앞에 붙인다
    content: `${title}\n\n${piece}`,
  }));
}
