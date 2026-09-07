import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import type { Notice } from "@/lib/notices";
import NoticeForm from "@/components/notices/NoticeForm";
import NoticeFormShell from "@/components/notices/NoticeFormShell";

// 수정은 쓴 사람과 관리자만. 화면에서 막고, 저장할 때 서버에서 한 번 더 확인한다.
export default async function EditNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = getServerSupabaseClient();
  const { data } = await supabase
    .from("notices")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) notFound();
  const notice = data as Notice;

  if (notice.author_id !== session.employeeId && !session.isAdmin) {
    redirect(`/notices/${id}`);
  }

  return (
    <NoticeFormShell heading="공지 수정">
      <NoticeForm notice={notice} />
    </NoticeFormShell>
  );
}
