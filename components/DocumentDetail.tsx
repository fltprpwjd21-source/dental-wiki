"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, type DocumentCategory } from "@/lib/categories";
import DocumentLogSection from "@/components/DocumentLogSection";

type Document = {
  id: string;
  category: DocumentCategory;
  title: string;
  content: string;
  version: number;
};

// 부모(app/documents/[id]/page.tsx)가 key={document.version} 을 붙여서 렌더링한다.
// router.refresh() 로 새 version이 내려오면(다른 사람이 먼저 고쳤거나, 아래
// "새로고침" 버튼을 눌렀거나) React가 이 컴포넌트를 통째로 다시 마운트해
// title·content·version·isEditing이 새 document 기준으로 깨끗하게 다시 시작된다.
// useEffect로 직접 setState 하는 방법도 있지만, 이 방식(리액트 공식 권장 패턴)이
// 상태가 어긋날 여지가 없고 더 간단하다.
export default function DocumentDetail({ document }: { document: Document }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [version, setVersion] = useState(document.version);
  const [titleDraft, setTitleDraft] = useState(document.title);
  const [contentDraft, setContentDraft] = useState(document.content);
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  function startEditing() {
    setTitleDraft(title);
    setContentDraft(content);
    setError(null);
    setIsConflict(false);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setError(null);
    setIsConflict(false);
  }

  // 되돌리기는 제목과 본문을 함께 복원한다
  function handleReverted(newTitle: string, newContent: string, newVersion: number) {
    setTitle(newTitle);
    setContent(newContent);
    setVersion(newVersion);
    if (isEditing) {
      setIsEditing(false);
    }
    router.refresh();
  }

  async function handleSave() {
    setError(null);
    setIsConflict(false);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleDraft,
          content: contentDraft,
          expectedVersion: version,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "수정에 실패했습니다.");
        // 다른 사람이 먼저 저장한 경우. 지금 입력 중인 내용은 그대로 두고
        // (누르지 않는 한 지우지 않는다) "새로고침" 버튼만 추가로 보여준다.
        setIsConflict(response.status === 409);
        return;
      }

      setTitle(data.document.title);
      setContent(data.document.content);
      setVersion(data.document.version);
      setIsEditing(false);
      setLogRefreshKey((key) => key + 1);
      router.refresh();
    } catch {
      setError("수정 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs text-brand-muted">{CATEGORY_LABELS[document.category]}</p>

      {isEditing ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="documentTitle" className="block text-xs text-gray-500">
              제목
            </label>
            <input
              id="documentTitle"
              type="text"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-semibold focus:border-brand focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="documentContent" className="block text-xs text-gray-500">
              본문
            </label>
            <textarea
              id="documentContent"
              value={contentDraft}
              onChange={(event) => setContentDraft(event.target.value)}
              rows={12}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          {error && (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-red-600">{error}</p>
              {isConflict && (
                <p className="text-xs text-gray-500">
                  지금 작성 중인 내용은 그대로 있습니다. 새로고침하면 최신 내용을
                  볼 수 있지만, 지금 쓰던 내용은 사라집니다.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={isSaving}
              className="rounded border border-gray-300 px-4 py-2 text-sm"
            >
              취소
            </button>
            {isConflict && (
              <button
                type="button"
                onClick={() => router.refresh()}
                className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                새로고침
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h1 className="mb-4 text-lg font-semibold text-brand">{title}</h1>
          <p className="whitespace-pre-wrap text-sm text-gray-800">{content}</p>
          <button
            type="button"
            onClick={startEditing}
            className="rounded border border-brand px-4 py-2 text-sm text-brand hover:bg-surface"
          >
            수정하기
          </button>
        </div>
      )}

      <DocumentLogSection
        key={logRefreshKey}
        documentId={document.id}
        version={version}
        onReverted={handleReverted}
      />
    </main>
  );
}
