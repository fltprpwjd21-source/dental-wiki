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
    .select("employee_id, is_admin, is_active, created_at")
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-brand">설정 - 사원번호 화이트리스트</h1>
      <SettingsWhitelist
        initialWhitelist={whitelist ?? []}
        currentEmployeeId={session.employeeId}
      />
    </main>
  );
}
