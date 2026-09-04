"use client";

import { useState } from "react";
import UploadButton, { type UploadedFile } from "@/components/files/UploadButton";
import TrashSection from "@/components/files/TrashSection";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function parseJsonOrError(response: Response): Promise<{ error: string } | Record<string, unknown>> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: (data as { error?: string }).error ?? "요청에 실패했습니다." };
  }
  return data;
}

// 업로드/재업로드 확정 API는 { file: {...} } 형태로 감싸서 돌려준다 (문서 API와 동일한 관례).
async function parseFileOrError(response: Response): Promise<UploadedFile | { error: string }> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: (data as { error?: string }).error ?? "요청에 실패했습니다." };
  }
  return (data as { file: UploadedFile }).file;
}

// Design §5.3·5.4: 폴더 상세 화면 — 검색, 업로드, 파일 목록(다운로드/재업로드/삭제), 휴지통.
// 이 화면에 들어올 수 있었다는 것 자체가 폴더 접근권한이 있다는 뜻이므로(서버 컴포넌트가
// 이미 확인함), 업로드/재업로드/삭제 버튼도 그대로 노출한다 — 별도의 쓰기 권한 단계는 없다.
export default function FileList({
  folderId,
  initialFiles,
}: {
  folderId: string;
  initialFiles: UploadedFile[];
}) {
  const [files, setFiles] = useState(initialFiles);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const response = await fetch(
        `/api/files/folders/${folderId}/files${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "파일 목록을 불러오지 못했습니다.");
        return;
      }
      setFiles(data.files);
    } catch {
      setError("검색 중 오류가 발생했습니다.");
    }
  }

  async function handleDownload(fileId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/files/${fileId}/download-url`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "다운로드에 실패했습니다.");
        return;
      }
      window.open(data.downloadUrl, "_blank");
    } catch {
      setError("다운로드 중 오류가 발생했습니다.");
    }
  }

  async function handleTrash(fileId: string) {
    if (!window.confirm("이 파일을 휴지통으로 이동할까요? 30일 안에는 복구할 수 있습니다.")) {
      return;
    }
    setError(null);
    setBusyId(fileId);

    try {
      const response = await fetch(`/api/files/${fileId}/trash`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "삭제에 실패했습니다.");
        return;
      }
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      setError("삭제 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  function handleUploaded(file: UploadedFile) {
    setFiles((prev) => [...prev, file].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function handleReuploaded(file: UploadedFile) {
    setFiles((prev) => prev.map((f) => (f.id === file.id ? file : f)));
  }

  function handleRestored(file: UploadedFile) {
    setFiles((prev) => [...prev, file].sort((a, b) => a.name.localeCompare(b.name)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearch} className="flex flex-1 min-w-[12rem] gap-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="파일명 검색"
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-surface"
          >
            검색
          </button>
        </form>

        <UploadButton
          label="업로드"
          requestUploadUrl={async (file) => {
            const response = await fetch(`/api/files/folders/${folderId}/upload-url`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
            });
            return (await parseJsonOrError(response)) as
              | { uploadUrl: string; token: string; storagePath: string; fileId: string }
              | { error: string };
          }}
          confirmUpload={async (file, storagePath) => {
            // requestUploadUrl 응답의 fileId를 다시 꺼낼 수 없으므로, storagePath에서
            // 뒷부분(uuid)을 그대로 재사용한다 (Design §3.3: storagePath = folderId/fileId).
            const fileId = storagePath.split("/").pop() as string;
            const response = await fetch(`/api/files/folders/${folderId}/files`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileId,
                name: file.name,
                storagePath,
                sizeBytes: file.size,
                mimeType: file.type || "application/octet-stream",
              }),
            });
            return parseFileOrError(response);
          }}
          onSuccess={handleUploaded}
          onError={setError}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {files.length === 0 ? (
        <p className="text-sm text-gray-500">등록된 파일이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-2">파일명</th>
                <th className="py-2">크기</th>
                <th className="py-2">올린 사람</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id} className="border-b border-gray-100">
                  <td className="py-2">
                    {file.name}
                    {file.version > 1 && (
                      <span className="ml-1 text-xs text-gray-400">v{file.version}</span>
                    )}
                  </td>
                  <td className="py-2 text-gray-500">{formatSize(file.size_bytes)}</td>
                  <td className="py-2 text-gray-500">{file.uploaded_by}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap justify-end gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleDownload(file.id)}
                        className="text-brand underline"
                      >
                        다운로드
                      </button>
                      <UploadButton
                        label="재업로드"
                        requestUploadUrl={async (newFile) => {
                          const response = await fetch(`/api/files/${file.id}/reupload-url`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ sizeBytes: newFile.size }),
                          });
                          return (await parseJsonOrError(response)) as
                            | { uploadUrl: string; token: string; storagePath: string }
                            | { error: string };
                        }}
                        confirmUpload={async (newFile) => {
                          const response = await fetch(`/api/files/${file.id}/reupload`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              sizeBytes: newFile.size,
                              mimeType: newFile.type || file.mime_type,
                            }),
                          });
                          return parseFileOrError(response);
                        }}
                        onSuccess={handleReuploaded}
                        onError={setError}
                        className="text-brand underline disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => handleTrash(file.id)}
                        disabled={busyId === file.id}
                        className="text-red-600 underline disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TrashSection folderId={folderId} onRestored={handleRestored} />
    </div>
  );
}
