"use client";

import { useEffect, useState } from "react";
import NoteTree from "@/components/notes/NoteTree";
import NoteEditor from "@/components/notes/NoteEditor";
import FolderView from "@/components/notes/FolderView";
import TrashPanel from "@/components/notes/TrashPanel";
import { buildTree, type FlatNode, type TreeNode } from "@/lib/notes/tree";

type Selected = { id: string; type: "folder" | "note"; name: string } | null;

// Design §5.1: 옵시디언식 2단 레이아웃. 좁은 화면에서는 트리/본문 중 하나만
// 보여주고 "← 트리로" 버튼으로 전환한다 (카테고리 앱과 같은 모바일 패턴).
//
// 사진·PDF(attachment)는 트리에서 독립적으로 선택할 대상이 아니다 — 노트 안에
// 딸린 첨부파일이라, 트리에는 folder/note만 보이고 선택도 그 둘만 가능하다.
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
    // buildTree()가 attachment 타입은 애초에 트리에서 걸러내므로, 여기 들어오는
    // node.type은 실제로는 항상 folder/note다 (TypeScript는 그걸 모를 뿐).
    if (node.type !== "folder" && node.type !== "note") return;
    setSelected({ id: node.id, type: node.type, name: node.name });
    setMobileView("content");
  }

  async function handleCreateFolder(parentId: string | null, name: string) {
    const response = await fetch("/api/notes/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, name }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "폴더 생성에 실패했습니다.");
      return;
    }
    await loadTree();
  }

  async function handleCreateNote(parentId: string | null, name: string) {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, name, content: "" }),
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

  // version 을 반드시 함께 받아 캐시에 반영한다.
  //
  // 예전에는 (id, name) 두 개만 받았다. 호출부는 세 번째로 새 version 을 넘기고
  // 있었지만 조용히 버려졌다 — 인자를 덜 받는 함수는 더 넘기는 자리에 넣어도
  // TypeScript 가 합법으로 보기 때문에 컴파일도 통과했다.
  // 그 결과 flatNodes 에는 옛 version 이 남고, FolderView 는 그 값으로 상태를
  // 초기화하므로(useState(node.version)) 다른 노드를 골랐다가 돌아와 리마운트되면
  // 낡은 version 으로 저장을 시도해 항상 409 "다른 사람이 방금 바꿨습니다" 가 떴다.
  function handleRenamed(id: string, name: string, version: number) {
    setFlatNodes((prev) => prev?.map((n) => (n.id === id ? { ...n, name, version } : n)) ?? null);
    setSelected((prev) => (prev && prev.id === id ? { ...prev, name } : prev));
  }

  function handleTrashed() {
    // 폴더를 지우면 하위 전체가 함께 사라지므로, 트리를 통째로 다시 불러온다.
    setSelected(null);
    setMobileView("tree");
    loadTree();
  }

  const tree = flatNodes ? buildTree(flatNodes) : [];
  const attachments = selected
    ? (flatNodes ?? []).filter((n) => n.type === "attachment" && n.parent_id === selected.id)
    : [];
  const selectedFolderNode =
    selected?.type === "folder" ? flatNodes?.find((n) => n.id === selected.id) ?? null : null;

  // 높이를 h-[calc(100vh-64px)] 로 잡지 않는다 — 헤더에 탭 줄이 생기거나 좁은 화면에서
  // 헤더가 두 줄로 접히면 그 64px 가 바로 틀어져 화면이 잘리거나 남는다.
  // body(flex column) → main(flex-1) → 여기(flex-1) 로 이어받아 남는 높이를 그대로 쓴다.
  //
  // min-h-0: 플렉스 아이템은 기본적으로 min-height:auto라서, 내용이 길어지면
  // 지정한 높이를 무시하고 페이지 전체가 늘어난다. 트리·본문 각각
  // 안에서만 스크롤되게 하려면 이 두 컨테이너 모두에 min-h-0이 필요하다.
  //
  // 두 칼럼에 h-full을 직접 주지 않는다 — 플렉스 아이템은 cross-size가
  // auto일 때만 부모의 stretch가 적용된다(스펙). h-full(=height:100%)을
  // 명시하면 그 순간부터 stretch 대상에서 빠져 퍼센트 계산으로 넘어가는데,
  // 실제로 렌더링해보면 656px 부모 밑에서도 내용 크기(auto)로 줄어드는
  // 현상이 있었다 — 그냥 아무 높이도 안 주고 stretch에 맡기면 정확히 656px로
  // 채워진다 (직접 확인함).
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 bg-l-card">
      <div
        className={`min-h-0 w-full shrink-0 flex-col border-r border-hair bg-l-cal md:flex md:w-64 ${
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
        <div className="shrink-0 border-b border-hair p-2 md:hidden">
          <button type="button" onClick={() => setMobileView("tree")} className="text-xs text-ink-2 underline">
            ← 트리로
          </button>
        </div>

        {error && <p className="shrink-0 p-3 text-sm text-late">{error}</p>}

        <div className="min-h-0 flex-1">
          {!selected && (
            <p className="p-4 text-sm text-ink-2">왼쪽 트리에서 폴더나 노트를 선택하세요.</p>
          )}
          {selected?.type === "note" && (
            <NoteEditor
              key={selected.id}
              nodeId={selected.id}
              attachments={attachments}
              onRenamed={handleRenamed}
              onTrashed={handleTrashed}
              onAttachmentsChanged={loadTree}
            />
          )}
          {selected?.type === "folder" && selectedFolderNode && (
            <FolderView
              key={selected.id}
              node={selectedFolderNode}
              onRenamed={handleRenamed}
              onTrashed={handleTrashed}
            />
          )}
        </div>
      </div>
    </div>
  );
}
