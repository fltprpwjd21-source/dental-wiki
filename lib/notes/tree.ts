export type NodeType = "folder" | "note" | "attachment";

export type FlatNode = {
  id: string;
  parent_id: string | null;
  type: NodeType;
  name: string;
  version: number;
  size_bytes: number | null;
  mime_type: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TreeNode = FlatNode & { children: TreeNode[] };

// Design §2.2: /api/notes/tree는 평면 배열을 돌려주고, 화면에서 parent_id
// 기준으로 트리를 조립한다. 이름순 정렬(폴더가 먼저 오도록)로 고정한다.
//
// attachment(사진·PDF)는 "노트에 속한 첨부파일"이지 트리에서 독립적으로 탐색할
// 대상이 아니므로(노트 앱과 같은 개념), 여기서 아예 제외하고 folder/note만
// 트리로 조립한다 — 노트 편집 화면에서 이 노트의 첨부파일을 보여줄 땐 원본
// flatNodes를 parent_id로 직접 필터링해서 쓴다.
export function buildTree(flatNodes: FlatNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const node of flatNodes) {
    if (node.type === "attachment") continue;
    byId.set(node.id, { ...node, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (list: TreeNode[]) => {
    list.sort((a, b) => {
      if (a.type !== b.type) {
        if (a.type === "folder") return -1;
        if (b.type === "folder") return 1;
      }
      return a.name.localeCompare(b.name, "ko");
    });
    for (const child of list) sortChildren(child.children);
  };
  sortChildren(roots);

  return roots;
}
