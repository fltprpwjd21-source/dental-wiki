"use client";

import { useEffect, useRef, useState } from "react";
import MarkdownView from "@/components/notes/MarkdownView";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

type NoteDetail = {
  id: string;
  parent_id: string | null;
  name: string;
  content: string;
  version: number;
};

// Design §4.2·§5: 노트 보기/편집 — 저장은 문서 편집과 동일한 낙관적 잠금 패턴.
// 이미지 삽입은 편집 모드에서만 가능하다 (커서 위치에 마크다운 문법을 끼워 넣는다).
export default function NoteEditor({
  nodeId,
  onRenamed,
  onTrashed,
}: {
  nodeId: string;
  onRenamed: (id: string, name: string, version: number) => void;
  onTrashed: (id: string) => void;
}) {
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // 부모(NotesApp)가 key={nodeId}로 렌더링하므로, 노트를 바꿔 선택하면 이
  // 컴포넌트가 통째로 새로 마운트된다 — 그래서 상태를 직접 초기화할 필요 없이
  // 아래 조회만 한 번 하면 된다 (DocumentDetail과 같은 "key로 리셋" 패턴).
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/notes/${nodeId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.node) {
          setNote(data.node);
          setDraft(data.node.content);
          setNameDraft(data.node.name);
        } else {
          setError(data.error ?? "노트를 불러오지 못했습니다.");
        }
      })
      .catch(() => !cancelled && setError("노트를 불러오는 중 오류가 발생했습니다."));

    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  function startEditing() {
    if (!note) return;
    setDraft(note.content);
    setError(null);
    setIsConflict(false);
    setMode("edit");
  }

  async function handleSave() {
    if (!note) return;
    setError(null);
    setIsConflict(false);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft, expectedVersion: note.version }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        setIsConflict(response.status === 409);
        return;
      }

      setNote(data.node);
      setMode("view");
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRename() {
    if (!note || !nameDraft.trim() || nameDraft === note.name) {
      setIsRenaming(false);
      return;
    }
    try {
      const response = await fetch(`/api/notes/${note.id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft.trim(), expectedVersion: note.version }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "이름 변경에 실패했습니다.");
        return;
      }
      setNote(data.node);
      onRenamed(note.id, data.node.name, data.node.version);
    } catch {
      setError("이름 변경 중 오류가 발생했습니다.");
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleTrash() {
    if (!note) return;
    if (!window.confirm(`"${note.name}" 노트를 휴지통으로 옮길까요?`)) return;

    const response = await fetch(`/api/notes/${note.id}/trash`, { method: "POST" });
    if (response.ok) {
      onTrashed(note.id);
    } else {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "삭제에 실패했습니다.");
    }
  }

  async function handleImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !note) return;

    setIsUploadingImage(true);
    setError(null);
    try {
      const urlRes = await fetch("/api/notes/images/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: note.parent_id, fileName: file.name, sizeBytes: file.size }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) {
        setError(urlData.error ?? "업로드에 실패했습니다.");
        return;
      }

      const supabase = getBrowserSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from("file-server")
        .uploadToSignedUrl(urlData.storagePath, urlData.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) {
        setError("이미지 업로드 중 오류가 발생했습니다.");
        return;
      }

      const confirmRes = await fetch("/api/notes/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: note.parent_id,
          imageId: urlData.imageId,
          name: file.name,
          storagePath: urlData.storagePath,
          sizeBytes: file.size,
          mimeType: file.type || "application/octet-stream",
        }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        setError(confirmData.error ?? "이미지 등록에 실패했습니다.");
        return;
      }

      // 커서 위치에 마크다운 이미지 문법을 끼워 넣는다.
      const markdown = `![${file.name}](/api/notes/${urlData.imageId}/content)`;
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        setDraft((prev) => prev.slice(0, start) + markdown + prev.slice(end));
      } else {
        setDraft((prev) => `${prev}\n${markdown}\n`);
      }
    } catch {
      setError("이미지 업로드 중 오류가 발생했습니다.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  if (error && !note) {
    return <p className="p-4 text-sm text-red-600">{error}</p>;
  }
  if (!note) {
    return <p className="p-4 text-sm text-gray-400">불러오는 중...</p>;
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
            {note.name}
          </h2>
        )}

        <div className="flex shrink-0 gap-2 text-xs">
          {mode === "view" ? (
            <button type="button" onClick={startEditing} className="rounded border border-brand px-3 py-1.5 text-brand hover:bg-surface">
              편집
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={isUploadingImage}
                className="rounded border border-gray-300 px-3 py-1.5 hover:bg-surface disabled:opacity-50"
              >
                {isUploadingImage ? "업로드 중..." : "🖼 이미지"}
              </button>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rounded bg-brand px-3 py-1.5 text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {isSaving ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={() => setMode("view")}
                disabled={isSaving}
                className="rounded border border-gray-300 px-3 py-1.5 hover:bg-surface"
              >
                취소
              </button>
            </>
          )}
          <button type="button" onClick={handleTrash} className="rounded border border-red-300 px-3 py-1.5 text-red-600 hover:bg-red-50">
            삭제
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="space-y-1 border-b border-red-100 bg-red-50 p-3">
          <p className="text-sm text-red-600">{error}</p>
          {isConflict && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-100"
            >
              새로고침
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {mode === "edit" ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="h-full w-full resize-none rounded border border-gray-200 p-3 font-mono text-sm focus:border-brand focus:outline-none"
            placeholder="마크다운으로 작성하세요..."
          />
        ) : (
          <MarkdownView content={note.content} />
        )}
      </div>
    </div>
  );
}
