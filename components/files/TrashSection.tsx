"use client";

import { useState } from "react";
import type { UploadedFile } from "@/components/files/UploadButton";

type TrashedFile = {
  id: string;
  folderId: string;
  name: string;
  sizeBytes: number;
  trashedAt: string;
  purgeAt: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function daysUntil(iso: string): number {
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

// Design §4.1·Plan FR-05: 폴더 안 휴지통. /api/files/trash는 접근 가능한 폴더 전체를
// 돌려주므로, 이 폴더(folderId)에 속한 것만 걸러서 보여준다.
export default function TrashSection({
  folderId,
  onRestored,
}: {
  folderId: string;
  onRestored: (file: UploadedFile) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<TrashedFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleToggle() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    setError(null);

    try {
      const response = await fetch("/api/files/trash");
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "휴지통을 불러오지 못했습니다.");
        return;
      }
      setFiles((data.files as TrashedFile[]).filter((f) => f.folderId === folderId));
    } catch {
      setError("휴지통을 불러오는 중 오류가 발생했습니다.");
    }
  }

  async function handleRestore(fileId: string) {
    setError(null);
    setRestoringId(fileId);

    try {
      const response = await fetch(`/api/files/${fileId}/restore`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "복구에 실패했습니다.");
        return;
      }
      setFiles((prev) => prev?.filter((f) => f.id !== fileId) ?? null);
      onRestored(data.file as UploadedFile);
    } catch {
      setError("복구 중 오류가 발생했습니다.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="mt-6 border-t border-gray-100 pt-4">
      <button
        type="button"
        onClick={handleToggle}
        className="text-sm text-gray-500 underline hover:text-brand"
      >
        {isOpen ? "휴지통 닫기" : "휴지통 보기"}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-2">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {files && files.length === 0 && (
            <p className="text-sm text-gray-500">휴지통이 비어 있습니다.</p>
          )}
          {files?.map((file) => (
            <div
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 px-3 py-2 text-sm"
            >
              <div>
                <p className="text-ink">{file.name}</p>
                <p className="text-xs text-gray-500">
                  {formatSize(file.sizeBytes)} · {daysUntil(file.purgeAt)}일 후 완전 삭제
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(file.id)}
                disabled={restoringId === file.id}
                className="rounded border border-brand px-3 py-1 text-xs text-brand hover:bg-surface disabled:opacity-50"
              >
                {restoringId === file.id ? "복구 중..." : "복구"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
