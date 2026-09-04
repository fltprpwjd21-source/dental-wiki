"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

type Folder = {
  id: string;
  name: string;
  visibility: "public" | "admin_only";
  created_at: string;
};

// Design §5.1·Plan FR-01: 최상위 폴더 목록. 관리자에게만 생성 폼이 보인다
// (서버도 POST /api/files/folders에서 다시 한번 관리자 여부를 확인한다).
export default function FolderList({
  initialFolders,
  isAdmin,
}: {
  initialFolders: Folder[];
  isAdmin: boolean;
}) {
  const [folders, setFolders] = useState(initialFolders);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "admin_only">("admin_only");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/files/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, visibility }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "폴더 생성에 실패했습니다.");
        return;
      }

      setFolders((prev) => [...prev, data.folder]);
      setName("");
      setVisibility("admin_only");
    } catch {
      setError("폴더 생성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {folders.length === 0 ? (
        <p className="text-sm text-gray-500">아직 만들어진 폴더가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {folders.map((folder) => (
            <li key={folder.id}>
              <Link
                href={`/files/${folder.id}`}
                className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50"
              >
                <span>{folder.name}</span>
                <span className="text-xs text-gray-400">
                  {folder.visibility === "admin_only" ? "관리자전용" : "전체공개"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4"
        >
          <div className="space-y-1">
            <label htmlFor="folderName" className="block text-xs text-gray-500">
              새 폴더 이름
            </label>
            <input
              id="folderName"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="folderVisibility" className="block text-xs text-gray-500">
              공개범위
            </label>
            <select
              id="folderVisibility"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as "public" | "admin_only")}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="admin_only">관리자전용</option>
              <option value="public">전체공개</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {isSubmitting ? "만드는 중..." : "+ 새 폴더"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
