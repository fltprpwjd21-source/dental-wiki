"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ACTION_LABELS: Record<string, string> = {
  create: "최초 등록",
  update: "수정",
  revert: "되돌리기",
};

type LogEntry = {
  id: string;
  action: "create" | "update" | "revert";
  previous_title: string | null;
  previous_content: string | null;
  new_title: string;
  new_content: string;
  edited_by: string;
  edited_at: string;
};

// DESIGN.md: 문서 화면 하단에 접혀있고, 펼치면 이전 수정 이력과 되돌리기 버튼을 확인할 수 있다.
//
// version(낙관적 잠금): 부모(DocumentDetail)가 지금 화면에 띄운 문서의 버전 번호를
// 내려준다. 되돌리기를 누른 사이 다른 사람이 먼저 문서를 고쳤으면 서버가 409를
// 돌려주는데, 여기서는 되돌리기가 텍스트 입력이 아니라 버튼 클릭 하나라 잃을
// 초안이 없으므로 곧바로 새로고침한다(DocumentDetail의 수정 화면과는 다르게
// 사용자에게 "새로고침 할지" 물어볼 필요가 없다).
export default function DocumentLogSection({
  documentId,
  version,
  onReverted,
}: {
  documentId: string;
  version: number;
  onReverted: (newTitle: string, newContent: string, newVersion: number) => void;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  async function toggleOpen() {
    const next = !isOpen;
    setIsOpen(next);
    if (next && logs === null) {
      await loadLogs();
    }
  }

  async function loadLogs() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/logs`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "로그를 불러오지 못했습니다.");
        return;
      }
      setLogs(data.logs);
    } catch {
      setError("로그를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRevert(logId: string) {
    setRevertingId(logId);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, expectedVersion: version }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "되돌리기에 실패했습니다.");
        if (response.status === 409) {
          // 되돌리기는 버튼 클릭 하나라 잃을 초안이 없다. 바로 최신 상태로 맞춘다.
          router.refresh();
        }
        return;
      }
      onReverted(data.document.title, data.document.content, data.document.version);
      await loadLogs();
    } catch {
      setError("되돌리기 중 오류가 발생했습니다.");
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <div className="mt-6 border-t border-gray-100 pt-4">
      <button
        type="button"
        onClick={toggleOpen}
        className="text-xs text-gray-500 underline hover:text-gray-700"
      >
        {isOpen ? "수정 로그 접기" : "수정 로그 보기"}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {isLoading && <p className="text-xs text-gray-500">불러오는 중...</p>}
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          {logs && logs.length === 0 && (
            <p className="text-xs text-gray-500">기록된 수정 이력이 없습니다.</p>
          )}
          {logs?.map((log, index) => {
            // 제목이 바뀐 수정이면 어떻게 바뀌었는지 함께 보여준다
            const titleChanged =
              log.previous_title !== null && log.previous_title !== log.new_title;

            return (
              <div
                key={log.id}
                className="rounded border border-gray-100 p-3 text-xs text-gray-600"
              >
                <p className="mb-1 text-gray-500">
                  {new Date(log.edited_at).toLocaleString("ko-KR")} · {log.edited_by} ·{" "}
                  {ACTION_LABELS[log.action]}
                </p>

                {titleChanged ? (
                  <p className="mb-1">
                    <span className="text-gray-500">제목: </span>
                    <span className="line-through text-gray-400">{log.previous_title}</span>
                    <span className="text-gray-500"> → </span>
                    <span className="font-medium text-gray-800">{log.new_title}</span>
                  </p>
                ) : (
                  <p className="mb-1">
                    <span className="text-gray-500">제목: </span>
                    {log.new_title}
                  </p>
                )}

                <p className="whitespace-pre-wrap">{log.new_content}</p>

                {index !== 0 && (
                  <button
                    type="button"
                    onClick={() => handleRevert(log.id)}
                    disabled={revertingId !== null}
                    className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {revertingId === log.id ? "되돌리는 중..." : "이 버전으로 되돌리기"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
