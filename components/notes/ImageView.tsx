"use client";

import { useState } from "react";

// Design §2.2: 이미지 노드를 선택하면 인증된 리다이렉트 경로로 바로 크게 보여준다.
export default function ImageView({
  nodeId,
  name,
  onTrashed,
}: {
  nodeId: string;
  name: string;
  onTrashed: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleTrash() {
    if (!window.confirm(`"${name}" 이미지를 휴지통으로 옮길까요?`)) return;
    const response = await fetch(`/api/notes/${nodeId}/trash`, { method: "POST" });
    if (response.ok) {
      onTrashed(nodeId);
    } else {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "삭제에 실패했습니다.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 p-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-brand">{name}</h2>
        <button
          type="button"
          onClick={handleTrash}
          className="shrink-0 rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
        >
          삭제
        </button>
      </div>
      {error && <p className="border-b border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <div className="flex-1 overflow-auto p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- 인증 리다이렉트 경로라 next/image 최적화 대상이 아님 */}
        <img src={`/api/notes/${nodeId}/content`} alt={name} className="max-w-full rounded border border-gray-200" />
      </div>
    </div>
  );
}
