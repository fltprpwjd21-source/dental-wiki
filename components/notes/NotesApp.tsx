"use client";

import { useEffect, useState } from "react";
import NoteTree from "@/components/notes/NoteTree";
import NoteEditor from "@/components/notes/NoteEditor";
import ImageView from "@/components/notes/ImageView";
import TrashPanel from "@/components/notes/TrashPanel";
import { buildTree, type FlatNode, type TreeNode } from "@/lib/notes/tree";

type Selected = { id: string; type: TreeNode["type"]; name: string } | null;

// Design §5.1: 옵시디언식 2단 레이아웃. 좁은 화면에서는 트리/본문 중 하나만
// 보여주고 "← 트리로" 버튼으로 전환한다 (카테고리 앱과 같은 모바일 패턴).
export default function NotesApp() {
  const [flatNodes, setFlatNodes] = useState<FlatNode[] | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"tree" | "content">("tree");

  async function loadTree() {
    try {
      const response = await fetch("/api/notes/tree");
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "트리를 불러오지 못했습니다.");
        return;
      }
      setFlatNodes(data.nodes);
    } catch {
      setError("트리를 불러오는 중 오류가 발생했습니다.");
    }
  }

  // 처음 화면에 들어왔을 때 한 번만 트리를 불러온다 (이후 갱신은 각 동작의
  // 성공 콜백에서 loadTree()를 직접 호출한다 — QaScreen과 같은 패턴).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/notes/tree")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.nodes) setFlatNodes(data.nodes);
        else setError(data.error ?? "트리를 불러오지 못했습니다.");
      })
      .catch(() => {
        if (!cancelled) setError("트리를 불러오는 중 오류가 발생했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectNode(node: TreeNode) {
    setSelected({ id: node.id, type: node.type, name: node.name });
    setMobileView("content");
  }

  async function handleCreateFolder(parentId: string | null) {
    const name = window.prompt("새 폴더 이름을 입력하세요");
    if (!name?.trim()) return;

    const response = await fetch("/api/notes/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, name: name.trim() }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "폴더 생성에 실패했습니다.");
      return;
    }
    await loadTree();
  }

  async function handleCreateNote(parentId: string | null) {
    const name = window.prompt("새 노트 이름을 입력하세요");
    if (!name?.trim()) return;

    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, name: name.trim(), content: "" }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "노트 생성에 실패했습니다.");
      return;
    }
    await loadTree();
    setSelected({ id: data.node.id, type: "note", name: data.node.name });
    setMobileView("content");
  }

  function handleRenamed(id: string, name: string) {
    setFlatNodes((prev) => prev?.map((n) => (n.id === id ? { ...n, name } : n)) ?? null);
    setSelected((prev) => (prev && prev.id === id ? { ...prev, name } : prev));
  }

  function handleTrashed() {
    // 폴더를 지우면 하위 전체가 함께 사라지므로, 트리를 통째로 다시 불러온다.
    setSelected(null);
    setMobileView("tree");
    loadTree();
  }

  const tree = flatNodes ? buildTree(flatNodes) : [];

  // min-h-0: 플렉스 아이템은 기본적으로 min-height:auto라서, 내용이 길어지면
  // 지정한 h-[calc(...)]를 무시하고 페이지 전체가 늘어난다. 트리·본문 각각
  // 안에서만 스크롤되게 하려면 이 두 컨테이너 모두에 min-h-0이 필요하다.
  //
  // 두 칼럼에 h-full을 직접 주지 않는다 — 플렉스 아이템은 cross-size가
  // auto일 때만 부모의 stretch가 적용된다(스펙). h-full(=height:100%)을
  // 명시하면 그 순간부터 stretch 대상에서 빠져 퍼센트 계산으로 넘어가는데,
  // 실제로 렌더링해보면 656px 부모 밑에서도 내용 크기(auto)로 줄어드는
  // 현상이 있었다 — 그냥 아무 높이도 안 주고 stretch에 맡기면 정확히 656px로
  // 채워진다 (직접 확인함).
  return (
    <div className="mx-auto flex h-[calc(100vh-64px)] min-h-0 w-full max-w-5xl flex-1">
      <div
        className={`min-h-0 w-full shrink-0 flex-col border-r border-gray-100 md:flex md:w-64 ${
          mobileView === "tree" ? "flex" : "hidden"
        }`}
      >
        <div className="min-h-0 flex-1">
          <NoteTree
            tree={tree}
            selectedId={selected?.id ?? null}
            onSelect={selectNode}
            onCreateFolder={handleCreateFolder}
            onCreateNote={handleCreateNote}
          />
        </div>
        <TrashPanel onRestored={loadTree} />
      </div>

      <div
        className={`min-h-0 min-w-0 flex-1 flex-col ${
          mobileView === "content" ? "flex" : "hidden md:flex"
        }`}
      >
        <div className="shrink-0 border-b border-gray-100 p-2 md:hidden">
          <button type="button" onClick={() => setMobileView("tree")} className="text-xs text-gray-500 underline">
            ← 트리로
          </button>
        </div>

        {error && <p className="shrink-0 p-3 text-sm text-red-600">{error}</p>}

        <div className="min-h-0 flex-1">
          {!selected && (
            <p className="p-4 text-sm text-gray-400">왼쪽 트리에서 노트나 이미지를 선택하세요.</p>
          )}
          {selected?.type === "note" && (
            <NoteEditor key={selected.id} nodeId={selected.id} onRenamed={handleRenamed} onTrashed={handleTrashed} />
          )}
          {selected?.type === "image" && (
            <ImageView key={selected.id} nodeId={selected.id} name={selected.name} onTrashed={handleTrashed} />
          )}
          {selected?.type === "folder" && (
            <p className="p-4 text-sm text-gray-400">
              &quot;{selected.name}&quot; 폴더입니다. 왼쪽 트리에서 하위 노트나 폴더를 만들어보세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
