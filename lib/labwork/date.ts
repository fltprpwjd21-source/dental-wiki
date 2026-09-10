// 사람이 치는 대로 받아서 날짜 하나로 만든다.
//
// 왜 필요한가
//   지금 쓰는 시트에는 같은 뜻을 다른 모양으로 적은 칸이 섞여 있다 — "9/8", "9월 15일".
//   달력 위젯(input type=date)을 쓰면 이걸 아예 칠 수가 없다. 마우스로 날짜를 골라야 하는데,
//   표를 훑으며 치던 사람에게는 그게 엑셀보다 확실히 불편하다.
//   그래서 칸은 그냥 글자로 두고, 여기서 알아서 읽는다.
//
// 연도를 안 적는 게 보통이라 추측해야 한다
//   "9/8" 에는 연도가 없다. 그냥 올해로 두면 12월에 "1/5"(내년 1월)를 적을 때 작년이 된다.
//   그래서 오늘로부터 6개월 넘게 지난 과거가 되면 다음 해로 본다 —
//   기공물은 몇 달 뒤까지 잡지, 몇 달 전으로 새로 잡지 않는다.
const PATTERNS: RegExp[] = [
  /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/,        // 2026-09-08, 2026.9.8
  /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일?$/,      // 2026년 9월 8일
  // 화면이 보여주는 모양(formatDate) 그대로 다시 읽을 수 있어야 한다.
  //   칸을 열면 "2025. 12/31" 이 입력칸에 들어가는데, 이걸 못 읽으면
  //   아무것도 안 고치고 딴 데를 눌렀을 뿐인데 날짜가 지워진다.
  //   tests/unit/labwork-date.test.mts 의 왕복 검사가 이 짝을 지킨다.
  /^(\d{4})\.\s*(\d{1,2})[-./](\d{1,2})$/,       // 2025. 12/31
];

const SHORT: RegExp[] = [
  /^(\d{1,2})[-./](\d{1,2})$/,                     // 9/8, 9-8
  /^(\d{1,2})월\s*(\d{1,2})일?$/,                  // 9월 8일
];

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // 2월 31일 같은 값은 Date 가 3월로 넘겨 버린다. 넘어갔으면 없는 날짜다.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseLooseDate(input: string, today: Date = new Date()): string | null {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return null;

  for (const re of PATTERNS) {
    const m = text.match(re);
    if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  // 0908 처럼 네 자리로 치는 사람도 있다
  const four = text.match(/^(\d{2})(\d{2})$/);
  const short = SHORT.map((re) => text.match(re)).find(Boolean);
  const parts = short ? [Number(short[1]), Number(short[2])] : four ? [Number(four[1]), Number(four[2])] : null;
  if (!parts) return null;

  const [month, day] = parts;
  const thisYear = iso(today.getFullYear(), month, day);
  if (!thisYear) return null;

  // 반년 넘게 지난 과거로 읽혔으면 내년을 뜻한 것으로 본다.
  const SIX_MONTHS = 183 * 24 * 60 * 60 * 1000;
  if (today.getTime() - new Date(thisYear).getTime() > SIX_MONTHS) {
    return iso(today.getFullYear() + 1, month, day);
  }
  return thisYear;
}

// 화면에 보여줄 모양. 짧게 줄이되, 줄인 글자를 다시 읽어 같은 날이 나올 때만 줄인다.
//
// 왜 "올해면 연도 생략"이 아닌가
//   칸을 열면 이 결과가 그대로 입력칸에 들어간다. 손대지 않고 지나가도 같은 날로 읽혀야 한다.
//   그런데 연말에 "1/5" 를 내년으로 보는 규칙이 있어서, 9월에 올해 1월 날짜를 "1/1" 로
//   줄이면 다시 읽을 때 내년 1월이 된다 — 아무것도 안 고쳤는데 날짜가 한 해 밀린다.
//   그래서 줄인 뒤 직접 읽어 보고, 같은 날이 안 나오면 연도를 붙인다.
//   두 함수가 서로를 검사하므로 한쪽만 고쳐도 어긋나지 않는다.
//   (tests/unit/labwork-date.test.mts 의 왕복 검사가 이 짝을 지킨다)
export function formatDate(isoDate: string | null, today: Date = new Date()): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;

  const short = `${m}/${d}`;
  if (parseLooseDate(short, today) === isoDate) return short;
  return `${y}. ${m}/${d}`;
}
