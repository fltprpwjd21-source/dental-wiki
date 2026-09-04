"use client";

import { useRef, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

export type UploadedFile = {
  id: string;
  folder_id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  version: number;
  status: "active" | "trashed";
  uploaded_by: string;
  created_at: string;
  updated_at: string;
};

type UploadUrlInfo = { uploadUrl: string; token: string; storagePath: string };

// Design §2.2: signed URL을 발급받아 브라우저가 Supabase Storage에 직접 업로드한다
// (Vercel 함수를 거치지 않음). 업로드 URL 발급/확정 방식은 신규 업로드와 재업로드가
// 서로 다른 API를 쓰므로, 그 차이는 부모가 requestUploadUrl/confirmUpload로 넘겨준다.
const DEFAULT_CLASS_NAME =
  "rounded border border-brand px-3 py-1.5 text-sm text-brand hover:bg-surface disabled:opacity-50";

export default function UploadButton({
  label,
  requestUploadUrl,
  confirmUpload,
  onSuccess,
  onError,
  className = DEFAULT_CLASS_NAME,
}: {
  label: string;
  requestUploadUrl: (file: File) => Promise<UploadUrlInfo | { error: string }>;
  confirmUpload: (file: File, storagePath: string) => Promise<UploadedFile | { error: string }>;
  onSuccess: (file: UploadedFile) => void;
  onError: (message: string) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일을 다시 선택해도 change가 발생하게 초기화
    if (!file) return;

    setIsUploading(true);
    try {
      const urlInfo = await requestUploadUrl(file);
      if ("error" in urlInfo) {
        onError(urlInfo.error);
        return;
      }

      const supabase = getBrowserSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from("file-server")
        .uploadToSignedUrl(urlInfo.storagePath, urlInfo.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) {
        onError("업로드 중 오류가 발생했습니다.");
        return;
      }

      const confirmed = await confirmUpload(file, urlInfo.storagePath);
      if ("error" in confirmed) {
        onError(confirmed.error);
        return;
      }
      onSuccess(confirmed);
    } catch {
      onError("업로드 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className={className}
      >
        {isUploading ? "업로드 중..." : label}
      </button>
    </>
  );
}
