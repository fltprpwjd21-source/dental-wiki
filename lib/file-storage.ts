import { getServerSupabaseClient } from "@/lib/supabase/server";

// Design §3.3: private 버킷. 공개 URL이 없고 signed URL로만 접근한다.
const BUCKET = "file-server";
// Design §7: signed URL은 발급 후 60초 내에만 유효하다.
const SIGNED_URL_EXPIRES_IN_SECONDS = 60;

// Storage 오브젝트 경로는 UUID로만 구성한다 (Design §3.3: 경로 조작/인코딩 문제 차단).
// 사용자가 올린 원래 파일명은 DB(files.name)에만 저장한다.
export function buildStoragePath(folderId: string, fileId: string): string {
  return `${folderId}/${fileId}`;
}

// 브라우저가 이 URL로 파일을 직접 업로드한다 (Vercel 함수를 거치지 않음).
// upsert: 재업로드(덮어쓰기)일 때 true — 같은 경로에 이미 있는 오브젝트를 교체한다.
export async function createUploadUrl(storagePath: string, options?: { upsert: boolean }) {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath, options);

  if (error) {
    throw new Error(`업로드 URL 발급에 실패했습니다: ${error.message}`);
  }
  return data;
}

// 브라우저가 이 URL로 파일을 직접 다운로드한다.
export async function createDownloadUrl(storagePath: string): Promise<string> {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error) {
    throw new Error(`다운로드 URL 발급에 실패했습니다: ${error.message}`);
  }
  return data.signedUrl;
}

// 휴지통 30일 경과 시 완전 삭제(purge)에서 사용.
export async function deleteStorageObject(storagePath: string): Promise<void> {
  const supabase = getServerSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);

  if (error) {
    throw new Error(`파일 삭제에 실패했습니다: ${error.message}`);
  }
}
