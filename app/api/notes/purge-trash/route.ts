import { NextRequest, NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { deleteStorageObject } from "@/lib/file-storage";
import { TRASH_RETENTION_DAYS } from "@/lib/file-rules";
import type { NodeType } from "@/lib/notes/tree";

// Supabase 클라이언트는 Database 제네릭 없이 만들어서 조회 결과의 type 이 string 으로
// 느슨하게 추론된다. NodeType 으로 좁혀서 받아야 'image' 처럼 더 이상 존재하지 않는
// 값과 비교했을 때 컴파일이 깨진다 — 실제로 그 비교가 조용히 죽어 있어서 첨부 실물이
// 지워지지 않고 스토리지에 남는 버그가 있었다 (2026-09-05 수정).
type ExpiredNode = {
  id: string;
  parent_id: string | null;
  type: NodeType;
  storage_path: string | null;
};

// Design §7·11.1: Vercel Cron 전용. 파일함 때와 동일하게 CRON_SECRET 헤더로 인증한다.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }

  const supabase = getServerSupabaseClient();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("nodes")
    .select("id, parent_id, type, storage_path")
    .eq("status", "trashed")
    .lt("trashed_at", cutoff);

  if (error) {
    return NextResponse.json({ error: "휴지통 조회에 실패했습니다." }, { status: 500 });
  }
  const expired = (data ?? []) as ExpiredNode[];

  // ① 첨부 실물을 먼저 지운다. 실패하면 그 첨부는 이번 회차에서 빼고 다음 실행 때
  //    다시 시도한다 (폴더/노트는 실물이 없어 항상 안전).
  const skipped = new Set<string>();
  for (const node of expired) {
    if (node.type === "attachment" && node.storage_path) {
      try {
        await deleteStorageObject(node.storage_path);
      } catch {
        skipped.add(node.id);
      }
    }
  }

  // ② 건너뛴 첨부의 조상도 함께 뺀다.
  //    purge_nodes 는 "넘겨받은 목록 안에서 자식이 없는 것"을 리프로 보므로, 자식만
  //    빠지고 부모가 남으면 부모를 리프로 착각해 지우려다 parent_id 외래키 위반이
  //    나고 그 회차 전체가 롤백된다. 부모를 함께 남겨 다음 회차에서 같이 정리한다.
  const byId = new Map(expired.map((node) => [node.id, node]));
  for (const id of [...skipped]) {
    let parentId = byId.get(id)?.parent_id ?? null;
    while (parentId && byId.has(parentId) && !skipped.has(parentId)) {
      skipped.add(parentId);
      parentId = byId.get(parentId)?.parent_id ?? null;
    }
  }

  const purgeIds = expired.filter((node) => !skipped.has(node.id)).map((node) => node.id);

  if (purgeIds.length > 0) {
    const { error: purgeError } = await supabase.rpc("purge_nodes", { p_ids: purgeIds });
    if (purgeError) {
      return NextResponse.json({ error: "완전 삭제에 실패했습니다." }, { status: 500 });
    }
  }

  return NextResponse.json({
    purged: purgeIds.length,
    checked: expired.length,
    skipped: skipped.size,
  });
}
