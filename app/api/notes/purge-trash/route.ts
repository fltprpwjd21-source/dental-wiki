import { NextRequest, NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { deleteStorageObject } from "@/lib/file-storage";
import { TRASH_RETENTION_DAYS } from "@/lib/file-rules";

// Design §7·11.1: Vercel Cron 전용. 파일함 때와 동일하게 CRON_SECRET 헤더로 인증한다.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }

  const supabase = getServerSupabaseClient();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired, error } = await supabase
    .from("nodes")
    .select("id, type, storage_path")
    .eq("status", "trashed")
    .lt("trashed_at", cutoff);

  if (error) {
    return NextResponse.json({ error: "휴지통 조회에 실패했습니다." }, { status: 500 });
  }

  // 이미지 실물을 먼저 지운다. 실패한 이미지가 있으면 그 이미지의 id는 삭제
  // 대상에서 빼서 다음 실행 때 다시 시도한다 (폴더/노트는 실물이 없어 항상 안전).
  const purgeIds: string[] = [];
  for (const node of expired ?? []) {
    if (node.type === "image" && node.storage_path) {
      try {
        await deleteStorageObject(node.storage_path);
      } catch {
        continue;
      }
    }
    purgeIds.push(node.id);
  }

  if (purgeIds.length > 0) {
    const { error: purgeError } = await supabase.rpc("purge_nodes", { p_ids: purgeIds });
    if (purgeError) {
      return NextResponse.json({ error: "완전 삭제에 실패했습니다." }, { status: 500 });
    }
  }

  return NextResponse.json({ purged: purgeIds.length, checked: expired?.length ?? 0 });
}
