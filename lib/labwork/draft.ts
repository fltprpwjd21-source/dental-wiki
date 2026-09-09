import { EMPTY_DRAFT, type LabworkDraft } from "./types";
import { parseLooseDate } from "./date";

export const LABWORK_SELECT =
  "id, seq, scope, lab, ordered_on, doctor, kind, tooth, tooth_count, ab_count, due_on, note, arrived, arrived_on, oral_scan, updated_at";

// 화면이 보낸 값을 그대로 믿지 않는다. 표에 직접 치는 화면이라 무엇이든 들어온다.
//
// 특히 날짜 두 가지가 실제로 문제를 낸다.
//   빈 문자열: Postgres date 는 "" 를 못 받는다. 날짜를 지우는 순간 500 이 난다.
//   반쯤 친 값("2026-09"): 저장은 되어도 나중에 조회에서 통째로 깨진다.
// 둘 다 null 로 바꾼다 — 화면에서 지우면 지워지고, 덜 친 값은 저장하지 않는다.
export function cleanDraft(body: unknown): Record<string, unknown> {
  const raw = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(EMPTY_DRAFT) as (keyof LabworkDraft)[]) {
    if (!(key in raw)) continue;
    const value = raw[key];

    if (key === "oral_scan") {
      out.oral_scan = value === true;
      continue;
    }

    if (key === "arrived") {
      out.arrived = value === true;
      // 도착 여부와 도착일을 따로 치게 하면 한쪽은 반드시 빈다.
      // 체크하는 순간 오늘로 찍고, 풀면 지운다.
      out.arrived_on = value === true ? todayIso() : null;
      continue;
    }

    if (key === "ordered_on" || key === "due_on") {
      // "9/8", "9월 15일" 처럼 사람이 치는 모양도 받는다 (lib/labwork/date.ts).
      // 읽지 못한 값은 null 로 둔다 — 덜 친 값을 저장하면 나중에 조회가 통째로 깨진다.
      out[key] = parseLooseDate(typeof value === "string" ? value : "");
      continue;
    }

    // 개수 칸은 화면에서 글자로 다루고 여기서 숫자로 바꾼다.
    //   빈 칸은 0 이 아니라 null 이다 — "0개"와 "아직 안 적었다"는 다른 뜻이고,
    //   0 으로 채워두면 나중에 집계할 때 안 적은 줄까지 세게 된다.
    if (key === "tooth_count" || key === "ab_count") {
      const text = typeof value === "string" ? value.trim() : String(value ?? "");
      out[key] = /^\d{1,3}$/.test(text) ? Number(text) : null;
      continue;
    }

    out[key] = typeof value === "string" ? value : "";
  }
  return out;
}

// toISOString() 은 UTC 로 바꾸므로 한국 시간 오전 9시 이전에는 하루 전 날짜가 나온다.
// (lib/notices.ts 의 isoDate 와 같은 이유다)
export function todayIso(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
