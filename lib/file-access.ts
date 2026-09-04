import type { Session } from "@/lib/auth";
import type { getServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof getServerSupabaseClient>;

export type FolderVisibility = "public" | "admin_only";

export type FileFolder = {
  id: string;
  name: string;
  visibility: FolderVisibility;
  created_by: string;
  created_at: string;
};

export type FileEntry = {
  id: string;
  folder_id: string;
  name: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
  version: number;
  status: "active" | "trashed";
  uploaded_by: string;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
};

type AccessDenied = { ok: false; status: 403 | 404; error: string };

// 폴더 접근권한(Design §4.1): admin_only 폴더는 관리자만 접근 가능. 매 요청마다
// DB에서 다시 확인한다 (session에 캐시하지 않음 — lib/auth.ts의 isAdmin과 같은 원칙).
export async function checkFolderAccess(
  supabase: SupabaseClient,
  folderId: string,
  session: Session,
): Promise<{ ok: true; folder: FileFolder } | AccessDenied> {
  const { data: folder, error } = await supabase
    .from("file_folders")
    .select("id, name, visibility, created_by, created_at")
    .eq("id", folderId)
    .maybeSingle();

  if (error || !folder) {
    return { ok: false, status: 404, error: "폴더를 찾을 수 없습니다." };
  }
  if (folder.visibility === "admin_only" && !session.isAdmin) {
    return { ok: false, status: 403, error: "이 폴더에 접근할 권한이 없습니다." };
  }
  return { ok: true, folder };
}

// 파일 하나에 대한 접근권한은 그 파일이 속한 폴더의 visibility를 따른다.
export async function checkFileAccess(
  supabase: SupabaseClient,
  fileId: string,
  session: Session,
): Promise<{ ok: true; file: FileEntry } | AccessDenied> {
  const { data: file, error } = await supabase
    .from("files")
    .select(
      "id, folder_id, name, storage_path, size_bytes, mime_type, version, status, uploaded_by, trashed_at, created_at, updated_at, file_folders(visibility)",
    )
    .eq("id", fileId)
    .maybeSingle();

  if (error || !file) {
    return { ok: false, status: 404, error: "파일을 찾을 수 없습니다." };
  }

  const folder = file.file_folders as unknown as { visibility: FolderVisibility } | null;
  if (folder?.visibility === "admin_only" && !session.isAdmin) {
    return { ok: false, status: 403, error: "이 폴더에 접근할 권한이 없습니다." };
  }

  const {
    id, folder_id, name, storage_path, size_bytes, mime_type,
    version, status, uploaded_by, trashed_at, created_at, updated_at,
  } = file as FileEntry & { file_folders: unknown };

  return {
    ok: true,
    file: {
      id, folder_id, name, storage_path, size_bytes, mime_type,
      version, status, uploaded_by, trashed_at, created_at, updated_at,
    },
  };
}
