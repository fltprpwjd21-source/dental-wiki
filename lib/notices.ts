// 공지 분류. 색은 globals.css 의 토큰과 짝을 이룬다.
//
// 「필독」은 없앴다. 분류 하나를 통째로 쓰기엔 남발될 위험이 크고, 실제로 필요한 건
// "이 공지는 읽음 확인을 받겠다"는 스위치 하나였다 (notices.needs_ack).
export type NoticeCategory = "sched" | "meet" | "rule";

export const NOTICE_CATEGORIES: NoticeCategory[] = ["sched", "meet", "rule"];

export const NOTICE_LABELS: Record<NoticeCategory, string> = {
  sched: "일정",
  meet: "회의",
  rule: "지침 변경",
};

// 어두운 카드 위에서 쓰는 밝은 값 / 흰 바탕에서 쓰는 진한 값.
// 같은 파랑 계열 안에서 색상만 갈린다 — 밝기로 나누면 남색 위에서 구별이 안 되고,
// 초록·주황을 섞으면 병원 색(파랑)을 벗어난다.
export const NOTICE_DOT: Record<NoticeCategory, string> = {
  sched: "var(--sched)",
  meet: "var(--meet)",
  rule: "var(--rule)",
};
export const NOTICE_DOT_DARK: Record<NoticeCategory, string> = {
  sched: "var(--sched-d)",
  meet: "var(--meet-d)",
  rule: "var(--rule-d)",
};

export type Notice = {
  id: string;
  category: NoticeCategory;
  title: string;
  summary: string;
  body: string;
  source_note_id: string | null;
  source_document_id: string | null;
  starts_on: string;
  ends_on: string;
  event_on: string | null;
  needs_ack: boolean;
  author_id: string;
  author_name: string | null;
  created_at: string;
  updated_at: string;
};

export function isNoticeCategory(value: unknown): value is NoticeCategory {
  return typeof value === "string" && (NOTICE_CATEGORIES as string[]).includes(value);
}

// 게시 기간 기본값. 비워두는 사람이 반드시 나오므로 30일로 채워둔다.
export const DEFAULT_NOTICE_DAYS = 30;

// 홈 배너에 띄우는 최대 장수. 넘으면 「전체 보기」로 넘긴다.
// 폭 992px 기준으로 한 장이 약 190px — 명조 제목이 두 줄에 앉는 최소 폭이다.
export const HOME_NOTICE_LIMIT = 5;

export function todayIso(): string {
  return isoDate(new Date());
}

export function defaultEndsOn(): string {
  const d = new Date();
  d.setDate(d.getDate() + DEFAULT_NOTICE_DAYS);
  return isoDate(d);
}

// toISOString() 은 UTC 로 바꾸므로 한국 시간 오전 9시 이전에는 하루 전 날짜가 나온다.
// 게시 기간·캘린더는 "오늘이 며칠인가"가 전부라서, 로컬 날짜를 그대로 쓴다.
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 마크다운 기호를 걷어내고 첫 문단을 잘라 카드 한 줄로 쓴다.
// 요약을 따로 적게 하면 아무도 안 쓴다.
export function makeSummary(text: string, limit = 60): string {
  const line = text
    .split("\n")
    .map((l) => l.replace(/^[#>\-*\s]+/, "").trim())
    .find((l) => l.length > 0);
  if (!line) return "";
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
}

// "09-05" 처럼 짧게. 카드와 목록에서 쓴다.
export function shortDate(iso: string): string {
  return iso.slice(5).replace("-", "-");
}

// 최근에 고쳐졌는지. 수가는 자주 바뀌는데 옛날 내용을 그대로 믿고 청구하는 게
// 이 앱이 막아야 할 사고라, 목록에서 눈에 띄게 표시한다.
//
// "지금"을 읽는 일은 렌더 중에 하면 안 된다(같은 렌더가 매번 다른 값을 낸다).
// 그래서 컴포넌트 밖 이 함수에 가둔다.
export function isRecentlyUpdated(iso: string, days = 7): boolean {
  return new Date(iso).getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}
