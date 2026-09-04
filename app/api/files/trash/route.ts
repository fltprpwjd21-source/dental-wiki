import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { TRASH_RETENTION_DAYS } from "@/lib/file-rules";

type TrashedFileRow = {
  id: string;
  folder_id: string;
  name: string;
  size_bytes: number;
  trashed_at: string;
  uploaded_by: string;
  file_folders: { name: string; visibility: "public" | "admin_only" } | null;
};

// Design §4.1·5.4: 접근 가능한 폴더의 휴지통 파일 목록. 복구 가능 기한도 함께 계산해준다.
export async function GET() {
  return withSession(async (session) => {
    const supabase = getServerSupabaseClient();
    let query = supabase
      .from("files")
      .select("id, folder_id, name, size_bytes, trashed_at, uploaded_by, file_folders!inner(name, visibility)")
      .eq("status", "trashed")
      .order("trashed_at", { ascending: false });

    if (!session.isAdmin) {
      query = query.eq("file_folders.visibility", "public");
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "휴지통 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    const files = ((data ?? []) as unknown as TrashedFileRow[]).map((row) => {
      const trashedAt = new Date(row.trashed_at);
      const purgeAt = new Date(trashedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      return {
        id: row.id,
        folderId: row.folder_id,
        folderName: row.file_folders?.name ?? "",
        name: row.name,
        sizeBytes: row.size_bytes,
        uploadedBy: row.uploaded_by,
        trashedAt: row.trashed_at,
        purgeAt: purgeAt.toISOString(),
      };
    });

    return NextResponse.json({ files });
  });
}
