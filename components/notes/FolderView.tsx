"use client";

import { useState } from "react";
import type { FlatNode } from "@/lib/notes/tree";

// Design §4.2: 폴더 보기 — NoteEditor와 같은 이름변경/삭제 패턴을 공유한다.
// 폴더 자체는 내용이 없어 본문 편집만 없을 뿐, 이름 클릭 시 이름변경·삭제 확인
// 2단계 버튼은 노트와 동일하게 제공한다. 삭제하면 하위 폴더·노트가 전부
// 함께 휴지통으로 이동한다(trash_node DB 함수가 재귀 처리).
export default function FolderView({
  node,
  onRenamed,
  onTrashed,
}: {
  node: FlatNode;
  onRenamed: (id: string, name: string, version: number) => void;
  onTrashed: (id: string) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(node.name);
  const [error, setError] = useState<string | null>(null);
  const [confirmingTrash, setConfirmingTrash] = useState(false);
  const [version, setVersion] = useState(node.version);
  const [name, setName] = useState(node.name);

  async function handleRename() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) {
      setIsRenaming(false);
      setNameDraft(name);
      return;
    }
    try {
      const response = await fetch(`/api/notes/${node.id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, expectedVersion: version }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "이름 변경에 실패했습니다.");
        return;
      }
      setName(data.node.name);
      setVersion(data.node.version);
      onRenamed(node.id, data.node.name, data.node.version);
    } catch {
      setError("이름 변경 중 오류가 발생했습니다.");
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleTrash() {
    const response = await fetch(`/api/notes/${node.id}/trash`, { method: "POST" });
    if (response.ok) {
      onTrashed(node.id);
    } else {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "삭제에 실패했습니다.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 p-3">
        {isRenaming ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={handleRename}
            onKeyDown={(event) => event.key === "Enter" && handleRename()}
            className="min-w-0 flex-1 rounded border border-brand px-2 py-1 text-sm font-semibold"
          />
        ) : (
          <h2
            onClick={() => setIsRenaming(true)}
            title="클릭하면 이름을 바꿀 수 있습니다"
            className="min-w-0 flex-1 cursor-text truncate text-sm font-semibold text-brand"
          >
            📁 {name}
          </h2>
        )}

        <div className="flex shrink-0 gap-2 text-xs">
          {confirmingTrash ? (
            <>
              <span className="py-1.5 text-red-600">하위 폴더·노트도 함께 삭제할까요?</span>
              <button
                type="button"
                onClick={handleTrash}
                className="rounded bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={() => setConfirmingTrash(false)}
                className="rounded border border-gray-300 px-3 py-1.5 hover:bg-surface"
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingTrash(true)}
              className="rounded border border-red-300 px-3 py-1.5 text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          )}
        </div>
      </div>

      {error && <p className="border-b border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm text-gray-400">
          &quot;{name}&quot; 폴더입니다. 왼쪽 트리에서 하위 노트나 폴더를 만들어보세요.
        </p>
      </div>
    </div>
  );
}
