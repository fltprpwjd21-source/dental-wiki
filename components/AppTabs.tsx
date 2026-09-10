"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 탭 일곱 개. 좁은 화면에서는 옆으로 흐른다.
//
// 「인수인계」는 뺐다 — 인수인계 자료는 보관함에서 꺼내 쓴다.
//
// 「노트」는 보관함으로 이름을 바꿨다 — 폴더에 문서·사진·PDF를 넣어 두는 곳이라
// '노트'보다 하는 일에 가깝다.
// 「업무지시」에는 배지가 붙는다 — 내가 지금 눌러야 할 것의 개수다.
// 어느 화면에 있든 보여야 해서 탭에 둔다 (지시를 받았거나 완료 보고가 올라온 것을
// 바로 못 볼 수도 있으므로, 누르기 전까지 사라지지 않는다).
const TABS = [
  { href: "/", label: "홈" },
  { href: "/notices", label: "공지" },
  { href: "/categories/meeting", label: "회의록" },
  { href: "/categories/insurance", label: "수가·비보험" },
  { href: "/categories/policy", label: "내규" },
  { href: "/notes", label: "보관함" },
  { href: "/lab", label: "기공물확인" },
  { href: "/tasks", label: "업무지시" },
];

export default function AppTabs({ taskBadge = 0 }: { taskBadge?: number }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="bg-tab">
      <div className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 text-xs">
        {TABS.map((tab) => {
          const on = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? "page" : undefined}
              className={`group relative whitespace-nowrap py-2.5 transition-colors ${
                on ? "font-medium text-white" : "text-white/55 hover:text-white/90"
              }`}
            >
              {tab.label}
              {tab.href === "/tasks" && taskBadge > 0 && (
                <span className="ml-1 inline-flex min-w-[14px] justify-center rounded-full bg-amber px-1 py-px text-[9px] leading-[1.3] font-medium text-white">
                  {taskBadge}
                </span>
              )}
              {/* 밑줄이 왼쪽에서 오른쪽으로 자란다 */}
              <span
                aria-hidden
                className={`absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white transition-transform duration-300 ${
                  on ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                }`}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
