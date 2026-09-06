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
//
// GET 과 POST 를 모두 받는다.
//   Vercel Cron 은 스케줄에 걸린 경로를 **GET** 으로 호출한다(메서드를 지정하는 항목이
//   vercel.json 에 아예 없다). 그런데 이 라우트는 POST 만 export 하고 있어서, 매일
//   18:00 UTC 에 405 만 받고 라우트 안에 들어오지도 못했다 — 401 도 아니라 로그조차
//   남지 않아, "30일 뒤 자동 완전삭제"가 **한 번도 실행된 적이 없다**는 걸 아무도 몰랐다
//   (2026-09-06 배포본에 직접 GET 을 쏴서 405 를 확인하고 고침).
//   POST 는 손으로 돌려볼 때를 위해 남겨둔다.
async function purgeExpiredTrash(request: NextRequest) {
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
      } catch (storageError) {
        // 조용히 넘어가면 "왜 이 첨부만 30일이 지나도 안 지워지지"를 나중에 추적할
        // 근거가 없다. 하루 한 번 도는 배치라 로그가 유일한 단서다.
        console.error(
          `[purge-trash] 스토리지 삭제 실패 — 다음 회차에 재시도합니다. node=${node.id} path=${node.storage_path}`,
          storageError,
        );
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

  // purge_nodes 는 "실제로 지운 개수"를 돌려준다. 넘긴 개수를 그대로 보고하면,
  // 살아 있는 자식이 딸려 건너뛴 가지까지 지운 것처럼 보인다.
  let purged = 0;
  if (purgeIds.length > 0) {
    const { data: purgedCount, error: purgeError } = await supabase.rpc("purge_nodes", {
      p_ids: purgeIds,
    });
    if (purgeError) {
      console.error("[purge-trash] 완전 삭제 실패", purgeError);
      return NextResponse.json({ error: "완전 삭제에 실패했습니다." }, { status: 500 });
    }
    purged = typeof purgedCount === "number" ? purgedCount : 0;
    if (purged < purgeIds.length) {
      console.warn(
        `[purge-trash] ${purgeIds.length}건을 넘겼지만 ${purged}건만 지웠습니다. ` +
          "살아 있는 자식이 딸린 가지는 다음 회차로 미룹니다.",
      );
    }
  }

  return NextResponse.json({
    purged,
    submitted: purgeIds.length,
    checked: expired.length,
    skipped: skipped.size,
  });
}

export const GET = purgeExpiredTrash;
export const POST = purgeExpiredTrash;
