"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/notes/tree";

const TYPE_ICON: Record<TreeNode["type"], string> = {
  folder: "📁",
  note: "📝",
  image: "🖼",
};

function collectAll(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => [node, ...collectAll(node.children)]);
}

// Design §5.1·§4.1: 왼쪽 트리 — 폴더 펼치기/접기, 노트/이미지 선택, 이름 검색.
export default function NoteTree({
  tree,
  selectedId,
  onSelect,
  onCreateFolder,
  onCreateNote,
}: {
  tree: TreeNode[];
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
  onCreateFolder: (parentId: string | null) => void;
  onCreateNote: (parentId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();

  // 서버 검색 API(/api/notes/search)도 있지만, 이미 트리 전체를 메모리에
  // 들고 있으므로 이름 필터링은 그냥 클라이언트에서 바로 한다 — 왕복이 없어 더 빠르다.
  const searchResults = trimmedQuery
    ? collectAll(tree).filter((node) => node.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 p-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름으로 검색"
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-brand focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {searchResults ? (
          <SearchResultList results={searchResults} selectedId={selectedId} onSelect={onSelect} />
        ) : (
          <TreeLevel
            nodes={tree}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            onCreateNote={onCreateNote}
          />
        )}
      </div>
      <div className="flex gap-2 border-t border-gray-100 p-2">
        <button
          type="button"
          onClick={() => onCreateFolder(null)}
          className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs hover:bg-surface"
        >
          + 새 폴더
        </button>
        <button
          type="button"
          onClick={() => onCreateNote(null)}
          className="flex-1 rounded border border-brand px-2 py-1.5 text-xs text-brand hover:bg-surface"
        >
          + 새 노트
        </button>
      </div>
    </div>
  );
}

function TreeLevel({
  nodes,
  depth,
  selectedId,
  onSelect,
  onCreateFolder,
  onCreateNote,
}: {
  nodes: TreeNode[];
  depth: number;
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
  onCreateFolder: (parentId: string | null) => void;
  onCreateNote: (parentId: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (nodes.length === 0 && depth === 0) {
    return <p className="p-3 text-xs text-gray-400">아직 만들어진 폴더·노트가 없습니다.</p>;
  }

  return (
    <ul>
      {nodes.map((node) => {
        const isFolder = node.type === "folder";
        const isOpen = !collapsed[node.id];
        return (
          <li key={node.id}>
            <div
              className={`group flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-surface ${
                selectedId === node.id ? "bg-surface font-medium text-brand" : "text-ink"
              }`}
              style={{ paddingLeft: `${depth * 14 + 4}px` }}
            >
              {isFolder ? (
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [node.id]: !prev[node.id] }))}
                  className="w-4 shrink-0 text-xs text-gray-400"
                >
                  {isOpen ? "▾" : "▸"}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => onSelect(node)}
                className="flex min-w-0 flex-1 items-center gap-1 truncate text-left"
              >
                <span>{TYPE_ICON[node.type]}</span>
                <span className="truncate">{node.name}</span>
              </button>
              {isFolder && (
                <span className="hidden shrink-0 gap-1 text-[10px] text-gray-400 group-hover:flex">
                  <button
                    type="button"
                    title="이 폴더에 새 폴더"
                    onClick={() => onCreateFolder(node.id)}
                    className="hover:text-brand"
                  >
                    📁+
                  </button>
                  <button
                    type="button"
                    title="이 폴더에 새 노트"
                    onClick={() => onCreateNote(node.id)}
                    className="hover:text-brand"
                  >
                    📝+
                  </button>
                </span>
              )}
            </div>
            {isFolder && isOpen && node.children.length > 0 && (
              <TreeLevel
                nodes={node.children}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onCreateFolder={onCreateFolder}
                onCreateNote={onCreateNote}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SearchResultList({
  results,
  selectedId,
  onSelect,
}: {
  results: TreeNode[];
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
}) {
  if (results.length === 0) {
    return <p className="p-3 text-xs text-gray-400">검색 결과가 없습니다.</p>;
  }

  return (
    <ul className="p-1">
      {results.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            onClick={() => onSelect(node)}
            className={`flex w-full items-center gap-1 truncate rounded px-2 py-1 text-left text-sm hover:bg-surface ${
              selectedId === node.id ? "bg-surface font-medium text-brand" : "text-ink"
            }`}
          >
            <span>{TYPE_ICON[node.type]}</span>
            <span className="truncate">{node.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
