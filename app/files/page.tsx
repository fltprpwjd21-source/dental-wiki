import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import FolderList from "@/components/files/FolderList";

// Design §4.1: 일반 스탭은 public 폴더만, 관리자는 전체를 본다.
export default async function FilesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = getServerSupabaseClient();
  let query = supabase
    .from("file_folders")
    .select("id, name, visibility, created_at")
    .order("created_at", { ascending: true });

  if (!session.isAdmin) {
    query = query.eq("visibility", "public");
  }

  const { data: folders } = await query;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-brand">파일함</h1>
      <FolderList initialFolders={folders ?? []} isAdmin={session.isAdmin} />
    </main>
  );
}
