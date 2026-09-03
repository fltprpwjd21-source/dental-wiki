import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import HeaderSearch from "@/components/HeaderSearch";
import LogoutButton from "@/components/LogoutButton";

// 레이아웃
//   넓은 화면: [로고] [   검색창   ] [로그인 정보] [설정]
//   좁은 화면: [로고]              [로그인 정보] [설정]
//              [        검색창 (한 줄 전체)        ]
//
// 한 줄에 모두 넣으면 로고와 우측 정보가 자리를 차지해 검색창이 짜부라진다
// (375px에서 입력칸 폭이 34px까지 줄고 가로 스크롤이 생겼다).
// flex-wrap + order로 좁은 화면에서는 검색창을 두 번째 줄로 내린다.
export default async function AppHeader() {
  const session = await getSession();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="shrink-0">
          <Image
            src="/brand/hyumc-logo.png"
            alt="한양대학교병원"
            width={144}
            height={39}
            priority
            className="h-7 w-auto sm:h-[39px]"
          />
        </Link>

        {session && (
          <>
            {/* 좁은 화면에서는 로고와 같은 줄 오른쪽 끝, 넓은 화면에서는 맨 오른쪽 */}
            <nav className="order-1 ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm md:order-2">
              <span className="flex items-center gap-2 text-ink">
                <span>
                  {session.employeeId}
                  {session.isAdmin ? " (관리자)" : ""}
                </span>
                <LogoutButton />
              </span>
              {session.isAdmin && (
                <Link href="/settings" className="text-brand hover:underline">
                  설정
                </Link>
              )}
            </nav>

            {/* 좁은 화면에서는 두 번째 줄 전체 폭, 넓은 화면에서는 가운데 */}
            <div className="order-2 w-full min-w-0 md:order-1 md:w-auto md:flex-1">
              <HeaderSearch />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
