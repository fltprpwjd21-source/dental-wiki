import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import HeaderSearch from "@/components/HeaderSearch";
import LogoutButton from "@/components/LogoutButton";

// 레이아웃: [로고] --- [검색창] --- [로그인 정보] [설정]
export default async function AppHeader() {
  const session = await getSession();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="shrink-0">
          <Image
            src="/brand/hyumc-logo.png"
            alt="한양대학교병원"
            width={144}
            height={39}
            priority
          />
        </Link>

        {session && (
          <>
            <div className="flex-1">
              <HeaderSearch />
            </div>

            <nav className="flex shrink-0 items-center gap-4 text-sm">
              <span className="flex items-center gap-2 text-ink">
                {session.employeeId}
                {session.isAdmin ? " (관리자)" : ""}
                <LogoutButton />
              </span>
              {session.isAdmin && (
                <Link href="/settings" className="text-brand hover:underline">
                  설정
                </Link>
              )}
            </nav>
          </>
        )}
      </div>
    </header>
  );
}
