"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildTree, type FlatNode, type TreeNode } from "@/lib/notes/tree";

// 지시 옆에 함께 띄우는 보관함 가지 (2026-09-10).
//
// 고르는 트리(ArchivePicker)와 달리 여기서는 누르면 보관함으로 넘어간다. 지시를 받은
// 사람이 "그 폴더 어디였지"를 찾아 나가지 않아도 되게 하려는 것이다.
//
// 연결한 자료는 굵게 표시한다 — 가지에 여러 개가 보이므로 어느 것이 지시 대상인지
// 구분되지 않으면 곁에 띄운 의미가 없다.

const TYPE_ICON: Record<"folder" | "note", string> = { folder: "📁", note: "📝" };

function Row({
  node,
  depth,
  sourceId,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  sourceId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isFolder = node.type === "folder";
  const isOpen = expanded.has(node.id);
  const isSource = node.id === sourceId;

  return (
    <>
      <div
        className={`flex items-center gap-1 py-0.5 text-[11.5px] ${
          isSource ? "bg-l-cal font-medium text-ink" : "text-ink-2"
        }`}
        style={{ paddingLeft: `${depth * 11 + 4}px` }}
      >
        {isFolder ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={`${node.name} ${isOpen ? "접기" : "펼치기"}`}
            className="w-3 shrink-0 text-[9px] text-ink-3"
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        <Link
          href={`/notes?node=${node.id}`}
          className="flex min-w-0 flex-1 items-center gap-1 truncate hover:underline"
        >
          <span aria-hidden className="shrink-0 text-[10px]">
            {TYPE_ICON[node.type as "folder" | "note"]}
          </span>
          <span className="truncate">{node.name}</span>
        </Link>
      </div>

      {isFolder &&
        isOpen &&
        node.children.map((child) => (
          <Row
            key={child.id}
            node={child}
            depth={depth + 1}
            sourceId={sourceId}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

export default function SourceTree({
  nodes,
  rootId,
  sourceId,
}: {
  nodes: FlatNode[];
  rootId: string;
  sourceId: string;
}) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  // 곁에 띄우는 목적이 "펼쳐서 보여주기"이므로 폴더는 전부 열어둔 채로 시작한다.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(nodes.filter((n) => n.type === "folder").map((n) => n.id)),
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const roots = tree.filter((n) => n.id === rootId);
  const shown = roots.length > 0 ? roots : tree;

  return (
    <div className="border border-hair bg-l-card">
      <div className="flex items-center justify-between gap-2 border-b border-hair px-2.5 py-1.5">
        <span className="text-[10.5px] text-ink-2">연결된 보관함 자료</span>
        <Link
          href={`/notes?node=${sourceId}`}
          className="shrink-0 text-[10px] text-ink-3 underline hover:text-ink-2"
        >
          보관함에서 열기 →
        </Link>
      </div>
      <div className="max-h-[26rem] overflow-y-auto py-1">
        {shown.map((node) => (
          <Row
            key={node.id}
            node={node}
            depth={0}
            sourceId={sourceId}
            expanded={expanded}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}
