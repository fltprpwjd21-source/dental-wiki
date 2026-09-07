import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import SettingsWhitelist from "@/components/SettingsWhitelist";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  // DESIGN.md: 관리자로 표시된 사원번호로 로그인했을 때만 보이고, 아니면 접근 자체가 안 된다.
  if (!session.isAdmin) {
    redirect("/");
  }

  const supabase = getServerSupabaseClient();
  const { data: whitelist } = await supabase
    .from("employee_whitelist")
    .select("employee_id, name, is_admin, created_at")
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-brand">설정</h1>

      {/*
        지도는 2026-09-07 에 설정 밖(/map)으로 나가 전 스탭에게 열렸다.
        설정에서도 바로 갈 수 있게 링크는 남겨둔다 — 관리자가 화이트리스트를 보다가
        "고립된 문서 없나" 를 확인하러 넘어가는 흐름이 자연스럽기 때문이다.
      */}
      <Link
        href="/map"
        className="mb-8 flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4 hover:bg-surface"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">지식 지도</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
            문서끼리 얼마나 가까운지 보고, 연결 문턱값을 조절하고, 아무와도 이어지지 않은
            문서를 찾습니다.
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-gray-400">
          →
        </span>
      </Link>

      <h2 className="mb-4 text-base font-semibold text-brand">사원번호 화이트리스트</h2>
      <SettingsWhitelist
        initialWhitelist={whitelist ?? []}
        currentEmployeeId={session.employeeId}
      />
    </main>
  );
}
