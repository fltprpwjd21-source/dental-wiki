"use client";

import { useMemo, useState } from "react";

// 관리자 휴지통. 전 스탭이 버린 것을 전부 보고 직접 비운다.
//
// 완전 삭제는 되돌릴 수 없으므로 두 가지를 지킨다.
//   - 실행 전에 "몇 건을 지우는지" 숫자로 보여주고 한 번 더 확인받는다
//   - window.confirm 은 쓰지 않는다 (병원 브라우저에서 조용히 실패한다 — LESSONS §9-5)
type TrashNode = {
  id: string;
  type: "folder" | "note" | "attachment";
  name: string;
  size_bytes: number | null;
  created_by: string;
  trashed_by: string | null;
  trashedByName: string | null;
  trashed_at: string;
  purgeAt: string;
};

const TYPE_LABEL: Record<TrashNode["type"], string> = {
  folder: "폴더",
  note: "노트",
  attachment: "첨부",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function daysLeft(purgeAt: string): number {
  return Math.ceil((new Date(purgeAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function AdminTrashPanel({
  initialNodes,
  retentionDays,
}: {
  initialNodes: TrashNode[];
  retentionDays: number;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allSelected = nodes.length > 0 && selected.size === nodes.length;

  const selectedNodes = useMemo(
    () => nodes.filter((n) => selected.has(n.id)),
    [nodes, selected],
  );

  function toggle(id: string) {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setConfirming(false);
    setSelected(allSelected ? new Set() : new Set(nodes.map((n) => n.id)));
  }

  async function handlePurge() {
    setConfirming(false);
    setError(null);
    setNotice(null);
    setIsPurging(true);

    try {
      const response = await fetch("/api/settings/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "완전 삭제에 실패했습니다.");
        return;
      }

      // 서버는 "실제로 지운 개수"를 돌려준다. 자식이 남아 건너뛴 가지가 있을 수 있으므로
      // 요청한 개수를 그대로 보고하지 않는다.
      const purged: number = data.purged ?? 0;
      const skipped: number = data.skipped ?? 0;
      setNotice(
        skipped > 0
          ? `${purged}건을 완전히 지웠습니다. ${skipped}건은 파일을 지우지 못해 남겨뒀습니다 — 잠시 후 다시 시도해주세요.`
          : `${purged}건을 완전히 지웠습니다.`,
      );

      // 서버가 실제로 지운 것만 화면에서 뺀다. 목록을 다시 받아 정확히 맞춘다.
      const refreshed = await fetch("/api/settings/trash").then((r) => r.json());
      if (refreshed.nodes) setNodes(refreshed.nodes);
      setSelected(new Set());
    } catch {
      setError("완전 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsPurging(false);
    }
  }

  if (nodes.length === 0) {
    return <p className="text-sm text-gray-400">휴지통이 비어 있습니다.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 accent-brand"
          />
          전체 선택 ({nodes.length}건)
        </label>

        {selected.size > 0 &&
          (confirming ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-red-600">
                {selected.size}건을 완전히 지웁니다. 되돌릴 수 없습니다.
              </span>
              <button
                type="button"
                onClick={handlePurge}
                disabled={isPurging}
                className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPurging ? "지우는 중..." : "완전 삭제"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-surface"
              >
                취소
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              선택한 {selected.size}건 완전 삭제
            </button>
          ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-brand">{notice}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="w-8 py-2" />
              <th className="py-2">이름</th>
              <th className="py-2">종류</th>
              <th className="py-2">버린 사람</th>
              <th className="py-2">버린 시각</th>
              <th className="py-2">자동 삭제까지</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr key={node.id} className="border-b border-gray-100">
                <td className="py-2">
                  <label className="sr-only" htmlFor={`sel-${node.id}`}>
                    {node.name} 선택
                  </label>
                  <input
                    id={`sel-${node.id}`}
                    type="checkbox"
                    checked={selected.has(node.id)}
                    onChange={() => toggle(node.id)}
                    className="h-4 w-4 accent-brand"
                  />
                </td>
                <td className="max-w-[16rem] truncate py-2 text-ink">{node.name}</td>
                <td className="py-2 text-gray-500">{TYPE_LABEL[node.type]}</td>
                <td className="py-2 text-gray-500">
                  {node.trashed_by ?? "-"}
                  {node.trashedByName && <span className="ml-1">{node.trashedByName}</span>}
                </td>
                <td className="py-2 font-mono text-xs tabular-nums text-gray-500">
                  {formatWhen(node.trashed_at)}
                </td>
                <td className="py-2 text-gray-500">
                  {daysLeft(node.purgeAt) <= 0 ? (
                    <span className="text-red-600">곧 삭제</span>
                  ) : (
                    `${daysLeft(node.purgeAt)}일`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        휴지통 항목은 버린 지 {retentionDays}일이 지나면 자동으로 완전 삭제됩니다. 여기서
        고른 항목은 그 전에 직접 지울 수 있으며, <b>되돌릴 수 없습니다.</b> 폴더를 지우면
        그 안에 살아 있는 항목이 남아 있는 동안은 건너뛰고, 안쪽부터 차례로 지워집니다.
      </p>
      {selectedNodes.some((n) => n.type === "folder") && (
        <p className="text-xs text-gray-500">
          선택 항목에 폴더가 있습니다 — 폴더는 그 안이 모두 비워진 뒤에 지워집니다.
        </p>
      )}
    </div>
  );
}
