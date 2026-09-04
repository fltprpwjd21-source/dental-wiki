"use client";

import { useState } from "react";

type TrashedNode = {
  id: string;
  type: "folder" | "note" | "image";
  name: string;
  trashedAt: string;
  purgeAt: string;
};

const TYPE_ICON: Record<TrashedNode["type"], string> = { folder: "📁", note: "📝", image: "🖼" };

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

// Design §5.4: 휴지통은 폴더별이 아니라 전체 트리 기준 하나로 통합해서 보여준다.
export default function TrashPanel({ onRestored }: { onRestored: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [nodes, setNodes] = useState<TrashedNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const response = await fetch("/api/notes/trash");
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "휴지통을 불러오지 못했습니다.");
        return;
      }
      setNodes(
        (data.nodes as Array<{ id: string; type: TrashedNode["type"]; name: string; trashed_at: string; purgeAt: string }>).map(
          (n) => ({ id: n.id, type: n.type, name: n.name, trashedAt: n.trashed_at, purgeAt: n.purgeAt }),
        ),
      );
    } catch {
      setError("휴지통을 불러오는 중 오류가 발생했습니다.");
    }
  }

  async function handleToggle() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    await load();
  }

  async function handleRestore(id: string) {
    setRestoringId(id);
    try {
      const response = await fetch(`/api/notes/${id}/restore`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "복구에 실패했습니다.");
        return;
      }
      await load();
      onRestored();
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="border-t border-gray-100 p-2">
      <button type="button" onClick={handleToggle} className="text-xs text-gray-500 underline hover:text-brand">
        {isOpen ? "휴지통 닫기" : "휴지통 보기"}
      </button>

      {isOpen && (
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {error && <p className="text-xs text-red-600">{error}</p>}
          {nodes?.length === 0 && <p className="text-xs text-gray-400">휴지통이 비어 있습니다.</p>}
          {nodes?.map((node) => (
            <div key={node.id} className="flex items-center justify-between gap-2 rounded px-1 py-1 text-xs hover:bg-surface">
              <span className="min-w-0 flex-1 truncate">
                {TYPE_ICON[node.type]} {node.name}
                <span className="ml-1 text-gray-400">{daysUntil(node.purgeAt)}일 후 삭제</span>
              </span>
              <button
                type="button"
                onClick={() => handleRestore(node.id)}
                disabled={restoringId === node.id}
                className="shrink-0 rounded border border-brand px-2 py-0.5 text-brand hover:bg-surface disabled:opacity-50"
              >
                복구
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
