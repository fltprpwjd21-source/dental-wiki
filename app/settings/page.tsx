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
    .select("employee_id, is_admin, created_at")
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-brand">설정</h1>

      {/*
        PRD 6장(범위): 지도의 "조작·분석은 설정 탭 안 관리자 전용 화면에서".
        그런데 /settings/map 으로 들어가는 길이 메인 화면 배너에만 있어서, 설정 탭에서
        시작하면 그 화면의 존재를 알 수 없었다. /settings/map 은 "← 설정" 으로 여기
        돌아오는데 여기서는 다시 갈 수 없는, 한쪽만 뚫린 통로였다.
      */}
      <Link
        href="/settings/map"
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
