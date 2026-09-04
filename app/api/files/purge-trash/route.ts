import { NextRequest, NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { deleteStorageObject } from "@/lib/file-storage";
import { TRASH_RETENTION_DAYS } from "@/lib/file-rules";

// Design §7·11.1: Vercel Cron 전용 엔드포인트. CRON_SECRET 헤더가 없으면 거부한다
// (Vercel Cron이 요청마다 Authorization: Bearer {CRON_SECRET}을 자동으로 붙여준다).
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }

  const supabase = getServerSupabaseClient();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired, error } = await supabase
    .from("files")
    .select("id, storage_path")
    .eq("status", "trashed")
    .lt("trashed_at", cutoff);

  if (error) {
    return NextResponse.json({ error: "휴지통 조회에 실패했습니다." }, { status: 500 });
  }

  let purged = 0;
  const failed: string[] = [];

  // Storage 실물을 먼저 지우고, 성공한 것만 메타데이터+로그를 지운다. 순서를 반대로
  // 하면 Storage 삭제가 실패했을 때 메타데이터 없이 실물만 남는(추적 불가능한) 상태가
  // 될 수 있다 — 지금 순서는 최악의 경우에도 "메타데이터는 있는데 이미 지워진 실물"
  // 정도라 다음 실행에서 다시 시도할 수 있다.
  for (const file of expired ?? []) {
    try {
      await deleteStorageObject(file.storage_path);
    } catch {
      failed.push(file.id);
      continue;
    }
    const { error: purgeError } = await supabase.rpc("purge_file", { p_file_id: file.id });
    if (purgeError) {
      failed.push(file.id);
      continue;
    }
    purged += 1;
  }

  return NextResponse.json({ purged, failed, checked: expired?.length ?? 0 });
}
