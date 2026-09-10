"use client";

import { useMemo, useState } from "react";
import { buildTree, type FlatNode, type TreeNode } from "@/lib/notes/tree";

// 업무지시에 연결할 보관함 자료를 트리에서 하나 고른다.
//
// 왜 NoteTree 를 그대로 쓰지 않는가
//   보관함의 트리(components/notes/NoteTree)는 고르는 것 말고도 폴더·노트 만들기를
//   함께 들고 있다. 지시를 내는 자리에서 새 폴더를 만들 일은 없고, 그 버튼이 보이면
//   지시 작성 중에 보관함 구조를 건드리게 된다. 여기서는 고르기만 남긴다.
//   트리를 조립하는 규칙(buildTree)은 같은 것을 쓰므로 두 화면의 모양은 어긋나지 않는다.

const TYPE_ICON: Record<"folder" | "note", string> = { folder: "📁", note: "📝" };

function collectAll(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => [node, ...collectAll(node.children)]);
}

function Row({
  node,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNode) => void;
}) {
  const isFolder = node.type === "folder";
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <>
      <div
        className={`flex items-center gap-1 py-0.5 text-[12px] ${
          isSelected ? "bg-l-cal font-medium text-ink" : "text-ink-2 hover:bg-l-cal"
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
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

        <button
          type="button"
          onClick={() => onSelect(node)}
          className="flex min-w-0 flex-1 items-center gap-1 truncate text-left"
        >
          <span aria-hidden className="shrink-0 text-[10px]">
            {TYPE_ICON[node.type as "folder" | "note"]}
          </span>
          <span className="truncate">{node.name}</span>
          {isSelected && <span className="ml-auto shrink-0 text-[9.5px] text-meet-d">연결됨</span>}
        </button>
      </div>

      {isFolder &&
        isOpen &&
        node.children.map((child) => (
          <Row
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export default function ArchivePicker({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: FlatNode[];
  selectedId: string | null;
  onSelect: (node: { id: string; name: string; type: "folder" | "note" } | null) => void;
}) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const [query, setQuery] = useState("");
  // 처음에는 최상위 폴더만 펼쳐 둔다. 전부 펼치면 자료가 많을 때 스크롤만 길어진다.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(tree.filter((n) => n.type === "folder").map((n) => n.id)),
  );

  const trimmed = query.trim().toLowerCase();
  // 트리 전체를 이미 들고 있으므로 검색은 여기서 바로 거른다 (NoteTree 와 같은 방식).
  const results = trimmed
    ? collectAll(tree).filter((n) => n.name.toLowerCase().includes(trimmed))
    : null;

  const selected = useMemo(
    () => (selectedId ? collectAll(tree).find((n) => n.id === selectedId) ?? null : null),
    [tree, selectedId],
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-ink-2">
          보관함 자료 연결 <span className="text-ink-3">(선택)</span>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 검색"
          aria-label="보관함 자료 검색"
          className="w-24 border border-hair-2 bg-l-card px-2 py-1 text-[11px] text-ink"
        />
      </div>

      {selected && (
        <div className="mb-1 flex items-center gap-1.5 border border-meet bg-l-cal px-2 py-1 text-[11.5px]">
          <span aria-hidden className="text-[10px]">
            {TYPE_ICON[selected.type as "folder" | "note"]}
          </span>
          <span className="min-w-0 flex-1 truncate text-ink">{selected.name}</span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 text-[10.5px] text-ink-3 underline hover:text-ink-2"
          >
            해제
          </button>
        </div>
      )}

      <div className="h-56 overflow-y-auto border border-hair-2 bg-l-card py-1">
        {tree.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-ink-3">보관함이 비어 있습니다.</p>
        ) : results ? (
          results.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-ink-3">찾는 자료가 없습니다.</p>
          ) : (
            results.map((node) => (
              <Row
                key={node.id}
                node={{ ...node, children: [] }}
                depth={0}
                selectedId={selectedId}
                expanded={expanded}
                onToggle={toggle}
                onSelect={(n) => onSelect({ id: n.id, name: n.name, type: n.type as "folder" | "note" })}
              />
            ))
          )
        ) : (
          tree.map((node) => (
            <Row
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={toggle}
              onSelect={(n) => onSelect({ id: n.id, name: n.name, type: n.type as "folder" | "note" })}
            />
          ))
        )}
      </div>
    </div>
  );
}
