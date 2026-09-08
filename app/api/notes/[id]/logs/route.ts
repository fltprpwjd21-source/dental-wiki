import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import { visibleNoteLogs } from "@/lib/note-logs";

// 노트 하단에 보여줄 "누가 언제 무엇을 했는지" 기록.
//
// 데이터는 원래부터 쌓이고 있었다 — 노트를 만들고 고칠 때마다 DB 함수가 node_logs 에
// action·actor·created_at 을 남긴다. 다만 읽는 경로가 없어서 화면에 안 보였을 뿐이다.
// (문서 쪽에는 /api/documents/[id]/logs 로 같은 것이 이미 있다)
//
// 사원번호만으로는 누구인지 알 수 없어 화이트리스트의 이름을 붙여 내려준다.
// 화이트리스트에서 지워진 사람의 기록도 그대로 남아 있으므로(로그는 스냅샷이다)
// 이름을 못 찾는 경우를 정상으로 취급한다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async () => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    const supabase = getServerSupabaseClient();
    const { data: logs, error } = await supabase
      .from("node_logs")
      .select("id, action, actor, detail, created_at")
      .eq("node_id", id)
      // 전부 가져온다 — 무엇을 감추고 무엇을 「업로드」로 부를지는
      // lib/note-logs.ts 가 정한다(그 파일의 주석 참고). 첫 저장을 찾아내려면
      // 만든 기록까지 함께 봐야 하므로 여기서 미리 걸러내지 않는다.
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "기록을 불러오지 못했습니다." }, { status: 500 });
    }

    const shown = visibleNoteLogs(logs ?? []);

    const actors = [...new Set(shown.map((l) => l.actor as string))];
    const { data: people } = await supabase
      .from("employee_whitelist")
      .select("employee_id, name")
      .in("employee_id", actors.length > 0 ? actors : [""]);

    const nameOf = new Map(
      (people ?? []).map((p) => [p.employee_id as string, p.name as string | null]),
    );

    return NextResponse.json({
      logs: shown.map((log) => ({
        id: log.id,
        action: log.action,
        actor: log.actor,
        actorName: nameOf.get(log.actor as string) ?? null,
        createdAt: log.created_at,
      })),
    });
  });
}
