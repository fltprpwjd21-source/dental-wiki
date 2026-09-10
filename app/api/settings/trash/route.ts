import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { deleteStorageObject } from "@/lib/file-storage";
import { TRASH_RETENTION_DAYS } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";
import type { NodeType } from "@/lib/notes/tree";
import { fetchEmployeeNames } from "@/lib/employee-names-server";

// 관리자 휴지통. 노트 화면의 "최근 삭제된 항목"이 본인 것만 보여주는 것과 달리,
// 여기서는 전 스탭이 버린 것을 전부 보고 직접 비울 수 있다.
//
// 사원번호만으로는 누가 버렸는지 알 수 없어 이름을 함께 붙여 내려준다
// (화이트리스트의 name — 설정 화면에서 이미 같은 이유로 추가한 값이다).
export async function GET() {
  return withSession(async (session) => {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
    }

    const supabase = getServerSupabaseClient();
    const nodesResult = await supabase
      .from("nodes")
      .select("id, parent_id, type, name, size_bytes, created_by, trashed_by, trashed_at")
      .eq("status", "trashed")
      .order("trashed_at", { ascending: false });

    if (nodesResult.error) {
      return NextResponse.json({ error: "휴지통 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    // 올린 사람·버린 사람 모두 실명으로 보여준다 (2026-09-10 규칙).
    const rows = nodesResult.data ?? [];
    const nameOf = await fetchEmployeeNames(
      rows.flatMap((row) => [row.created_by as string, row.trashed_by as string | null])
        .filter((id): id is string => typeof id === "string"),
    );

    const nodes = rows.map((row) => {
      const trashedAt = new Date(row.trashed_at as string);
      const purgeAt = new Date(trashedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      return {
        ...row,
        // 화이트리스트에서 지워진 사람이 버린 항목도 남아 있을 수 있다 — 그때는 이름이 없고
        // 화면이 사원번호로 떨어진다 (lib/employee-names.ts 의 displayName).
        trashedByName: row.trashed_by ? nameOf.get(row.trashed_by as string) ?? null : null,
        createdByName: nameOf.get(row.created_by as string) ?? null,
        purgeAt: purgeAt.toISOString(),
      };
    });

    return NextResponse.json({ nodes, retentionDays: TRASH_RETENTION_DAYS });
  });
}

// 선택한 항목을 완전 삭제한다. 되돌릴 수 없다.
//
// 크론(purge-trash)과 같은 순서를 지킨다.
//   ① 첨부 실물을 먼저 지우고, 실패한 것은 이번 회차에서 뺀다
//   ② 건너뛴 첨부의 조상도 함께 뺀다 — purge_nodes 는 "넘겨받은 목록 안에서 자식이 없는
//      것"만 리프로 보므로, 자식만 빠지고 부모가 남으면 부모를 리프로 착각해 지우려다
//      외래키 위반이 나고 그 회차 전체가 롤백된다
// 이 순서를 크론에서 어겼다가 실제로 고아 파일과 롤백을 겪었다 (LESSONS §9-1).
export async function POST(request: NextRequest) {
  return withSession(async (session) => {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const ids: unknown = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && isUuid(id))) {
      return NextResponse.json({ error: "지울 항목을 선택해주세요." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();

    // 고른 항목이 정말 휴지통에 있는지 확인한다. 활성 항목을 여기서 지울 수는 없어야 한다.
    const { data: targets, error: lookupError } = await supabase
      .from("nodes")
      .select("id, parent_id, type, storage_path")
      .in("id", ids as string[])
      .eq("status", "trashed");

    if (lookupError) {
      return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
    }
    if (!targets || targets.length === 0) {
      return NextResponse.json({ error: "휴지통에서 찾을 수 없습니다." }, { status: 404 });
    }

    const rows = targets as Array<{
      id: string;
      parent_id: string | null;
      type: NodeType;
      storage_path: string | null;
    }>;

    // ① 첨부 실물 먼저
    const skipped = new Set<string>();
    for (const node of rows) {
      if (node.type === "attachment" && node.storage_path) {
        try {
          await deleteStorageObject(node.storage_path);
        } catch {
          skipped.add(node.id);
        }
      }
    }

    // ② 건너뛴 것의 조상도 뺀다
    const byId = new Map(rows.map((n) => [n.id, n]));
    for (const id of [...skipped]) {
      let parentId = byId.get(id)?.parent_id ?? null;
      while (parentId && byId.has(parentId) && !skipped.has(parentId)) {
        skipped.add(parentId);
        parentId = byId.get(parentId)?.parent_id ?? null;
      }
    }

    const purgeIds = rows.filter((n) => !skipped.has(n.id)).map((n) => n.id);
    if (purgeIds.length === 0) {
      return NextResponse.json(
        { error: "파일을 지우지 못해 이번에는 아무것도 삭제하지 않았습니다. 잠시 후 다시 시도해주세요." },
        { status: 502 },
      );
    }

    const { data: purged, error } = await supabase.rpc("purge_nodes", {
      p_ids: purgeIds,
      p_actor: session.employeeId,
    });

    if (error) {
      return NextResponse.json({ error: "완전 삭제에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      purged: purged ?? 0,
      requested: ids.length,
      skipped: skipped.size,
    });
  });
}
