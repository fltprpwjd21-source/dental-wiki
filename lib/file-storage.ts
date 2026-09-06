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

// 스토리지에 실제로 올라간 오브젝트의 크기·형식을 읽는다.
//
// 왜 필요한가
//   업로드 확정(POST /api/notes/attachments)은 지금까지 크기·형식을 요청 본문에서
//   받아 그대로 검사하고 저장했다. 그런데 그 값을 만들어 보내는 쪽이 곧 제한을
//   피하려는 쪽이라, 콘솔에서 sizeBytes: 1 을 보내면 50MB 제한이 그냥 통과했다.
//   "두 번 검사"했지만 두 번 다 같은 거짓말을 검사한 셈이다 (LESSONS §9-3).
//   서버가 스스로 알아낼 수 있는 값은 요청 본문으로 받지 않는다.
//
// 오브젝트가 없거나(업로드가 실제로 일어나지 않음) 크기를 알 수 없으면 null을
// 돌려준다 — 호출부는 이를 실패로 처리한다(fail-closed). 크기를 모르는 채로
// 0 같은 기본값으로 넘어가면 용량 제한이 다시 무의미해지기 때문이다.
export async function getStorageObjectInfo(
  storagePath: string,
): Promise<{ sizeBytes: number; mimeType: string } | null> {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase.storage.from(BUCKET).info(storagePath);

  if (error || !data) return null;

  const sizeBytes = data.size ?? data.metadata?.size;
  if (typeof sizeBytes !== "number") return null;

  return {
    sizeBytes,
    mimeType: data.contentType ?? data.metadata?.mimetype ?? "application/octet-stream",
  };
}

// 휴지통 30일 경과 시 완전 삭제(purge)에서 사용.
export async function deleteStorageObject(storagePath: string): Promise<void> {
  const supabase = getServerSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);

  if (error) {
    throw new Error(`파일 삭제에 실패했습니다: ${error.message}`);
  }
}
