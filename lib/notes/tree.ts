export type NodeType = "folder" | "note" | "image";

export type FlatNode = {
  id: string;
  parent_id: string | null;
  type: NodeType;
  name: string;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TreeNode = FlatNode & { children: TreeNode[] };

// Design §2.2: /api/notes/tree는 평면 배열을 돌려주고, 화면에서 parent_id
// 기준으로 트리를 조립한다. 이름순 정렬(폴더가 먼저 오도록)로 고정한다.
export function buildTree(flatNodes: FlatNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const node of flatNodes) {
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
