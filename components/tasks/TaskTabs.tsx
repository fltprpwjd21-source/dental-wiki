import Link from "next/link";

// 업무 탭의 하위 탭 줄 (2026-09-11).
//
// 네 갈래다 — 읽는 화면 둘(요약·내 업무)과 쓰는 화면 둘(지시·보고).
// 쓰는 화면을 탭으로 뺀 이유는, 작성창을 목록 위에 얹어 두면 쓰는 동안 아래에 목록이
// 계속 딸려 나와 화면이 길어지기만 하고 아무 도움이 안 되기 때문이다.
//
// 왜 Next 의 layout 이 아니라 컴포넌트인가
//   app/tasks/layout.tsx 를 쓰면 /tasks/[id] 상세까지 감싸서 상세 화면에도 탭 줄이 붙는다.
//   라우트 그룹으로 피할 수는 있지만 파일만 늘어난다 — 각 페이지가 한 줄씩 부르는 편이 낫다.
//
// 왜 ?tab= 이 아니라 경로인가
//   검색 문자열만 다르면 상단 네비의 「업무」를 눌러도 pathname 이 같아서 라우터가 이동으로
//   치지 않는다. 그래서 하위 탭에 들어간 뒤 상단 탭으로 첫 화면에 돌아올 수 없었다.

export type TaskTab = "summary" | "mine" | "assign" | "report";

const TABS: { key: TaskTab; href: string; label: string }[] = [
  { key: "summary", href: "/tasks", label: "한줄 업무 요약" },
  { key: "mine", href: "/tasks/mine", label: "내 업무" },
  { key: "assign", href: "/tasks/assign", label: "업무 지시" },
  { key: "report", href: "/tasks/report", label: "업무 보고" },
];

export default function TaskTabs({ active, mineBadge }: { active: TaskTab; mineBadge: number }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-hair">
      {TABS.map((t) => {
        const on = t.key === active;
        // 쓰는 탭은 오른쪽으로 밀어 읽는 탭과 갈라 놓는다.
        const splits = t.key === "assign";
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] ${
              splits ? "ml-auto" : ""
            } ${
              on ? "border-navy font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {t.label}
            {t.key === "mine" && mineBadge > 0 && (
              <span className="border border-amber px-1 py-px text-[9.5px] text-amber">
                {mineBadge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
