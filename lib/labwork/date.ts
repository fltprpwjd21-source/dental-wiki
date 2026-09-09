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

// 화면에 보여줄 모양. 올해면 연도를 빼서 짧게 둔다 — 표에서는 한 칸이라도 좁은 게 낫다.
export function formatDate(isoDate: string | null, today: Date = new Date()): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return y === today.getFullYear() ? `${m}/${d}` : `${y}. ${m}/${d}`;
}
