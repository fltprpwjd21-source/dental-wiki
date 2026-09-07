import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import HeaderSearch from "@/components/HeaderSearch";
import LogoutButton from "@/components/LogoutButton";
import AppTabs from "@/components/AppTabs";

// 층 1·2 — 화면에서 어두운 곳은 여기와 공지 카드뿐이다.
//
// 검색창만 흰색이다. 이 화면에서 가장 자주 쓰는 칸이라, 남색 머리에서 유일하게 밝다.
// 질문 입력칸을 따로 두지 않는다 — 검색과 질문은 같은 동작인데 칸이 둘이면
// 어디에 쳐야 하나를 매번 고민하게 된다.
export default async function AppHeader() {
  const session = await getSession();

  return (
    <header>
      <div className="bg-head text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <Image
              src="/brand/hyumc-logo.png"
              alt="한양대학교병원"
              width={144}
              height={39}
              priority
              /* 로고가 원래 남색 글씨라 남색 바탕에서 안 보인다. 흰색으로 뒤집는다. */
              className="h-6 w-auto brightness-0 invert sm:h-7"
            />
            <span className="font-display text-[15px] font-extrabold tracking-tight">
              치과위키
            </span>
          </Link>

          {session && (
            <>
              {/* 좁은 화면: 로고와 같은 줄 오른쪽 끝 → 검색창은 둘째 줄 전체 폭 */}
              <div className="order-1 ml-auto flex items-center gap-3 text-[11px] text-white/60 md:order-2">
                <span className="whitespace-nowrap">
                  {session.employeeId}
                  {session.isAdmin ? " (관리자)" : ""}
                </span>
                <LogoutButton />
                {session.isAdmin && (
                  <Link href="/settings" className="whitespace-nowrap hover:text-white">
                    설정
                  </Link>
                )}
              </div>

              <div className="order-2 w-full min-w-0 md:order-1 md:w-auto md:flex-1">
                <HeaderSearch />
              </div>
            </>
          )}
        </div>
      </div>

      {session && <AppTabs />}
    </header>
  );
}
