import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { TRASH_RETENTION_DAYS } from "@/lib/file-rules";
import AdminTrashPanel from "@/components/AdminTrashPanel";

// 관리자 휴지통.
//
// 노트 화면의 "최근 삭제된 항목"은 본인이 버린 것만 보여준다. 되돌리기는 대부분
// 방금 내가 잘못 지운 것을 되살리는 일이라 그게 맞다.
// 전체를 보고 정리하는 일은 관리자의 몫이라 여기로 분리했다.
//
// 인가는 이 redirect 하나가 관문이다 — 데이터 조회가 이 아래에서 일어나므로,
// 통과하지 못하면 조회 자체가 시작되지 않는다.
export default async function AdminTrashPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!session.isAdmin) {
    redirect("/");
  }

  const supabase = getServerSupabaseClient();
  const [nodesResult, peopleResult] = await Promise.all([
    supabase
      .from("nodes")
      .select("id, type, name, size_bytes, created_by, trashed_by, trashed_at")
      .eq("status", "trashed")
      .order("trashed_at", { ascending: false }),
    supabase.from("employee_whitelist").select("employee_id, name"),
  ]);

  const nameOf = new Map(
    (peopleResult.data ?? []).map((p) => [p.employee_id as string, p.name as string | null]),
  );

  const nodes = (nodesResult.data ?? []).map((row) => {
    const trashedAt = new Date(row.trashed_at as string);
    const purgeAt = new Date(trashedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return {
      ...row,
      trashedByName: row.trashed_by ? nameOf.get(row.trashed_by as string) ?? null : null,
      purgeAt: purgeAt.toISOString(),
    };
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link href="/settings" className="text-xs text-gray-500 underline hover:text-brand">
        ← 설정
      </Link>
      <h1 className="mt-2 mb-1 text-lg font-semibold text-brand">휴지통</h1>
      <p className="mb-6 text-sm text-gray-500">
        전 스탭이 버린 노트·폴더·첨부를 모두 보여줍니다. 스탭 각자의 노트 화면에는 본인이
        버린 것만 보입니다.
      </p>

      {nodesResult.error ? (
        <p className="text-sm text-red-600">휴지통 목록을 불러오지 못했습니다.</p>
      ) : (
        <AdminTrashPanel initialNodes={nodes} retentionDays={TRASH_RETENTION_DAYS} />
      )}
    </main>
  );
}
