import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import FileList from "@/components/files/FileList";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { folderId } = await params;
  if (!isUuid(folderId)) {
    notFound();
  }

  const supabase = getServerSupabaseClient();
  const { data: folder } = await supabase
    .from("file_folders")
    .select("id, name, visibility")
    .eq("id", folderId)
    .maybeSingle();

  if (!folder) {
    notFound();
  }
  // admin_only 폴더는 URL을 직접 입력해 들어와도 접근할 수 없다 (API와 동일한 규칙).
  if (folder.visibility === "admin_only" && !session.isAdmin) {
    redirect("/files");
  }

  const { data: files } = await supabase
    .from("files")
    .select("id, folder_id, name, size_bytes, mime_type, version, status, uploaded_by, created_at, updated_at")
    .eq("folder_id", folderId)
    .eq("status", "active")
    .order("name", { ascending: true });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/files" className="mb-2 inline-block text-xs text-gray-500 hover:underline">
        ← 파일함
      </Link>
      <h1 className="mb-6 text-lg font-semibold text-brand">
        {folder.name}
        <span className="ml-2 text-xs font-normal text-gray-400">
          {folder.visibility === "admin_only" ? "관리자전용" : "전체공개"}
        </span>
      </h1>
      <FileList folderId={folder.id} initialFiles={files ?? []} />
    </main>
  );
}
