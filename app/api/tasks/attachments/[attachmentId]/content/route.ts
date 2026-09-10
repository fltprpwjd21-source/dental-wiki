import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createDownloadUrl } from "@/lib/file-storage";
import { isPreviewableMimeType } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";
import { canView, type Task, type TaskAssignee } from "@/lib/tasks";

// 업무지시 첨부를 열어준다. 보관함 첨부(app/api/notes/[id]/content)와 같은 방식이다 —
// 서명 URL 로 리다이렉트하지 않고 바이트를 우리 응답으로 흘려보낸다. 그래야 진짜
// same-origin 이 되고, CSP 로 그 안의 스크립트 실행까지 막을 수 있다 (LESSONS §9-9).
//
// 다른 점은 하나다: 업무지시는 지시자·담당자만 열람할 수 있으므로 여기서도 그 검사를 한다.
// 로그인만 확인하면 링크를 아는 사람이 남의 지시 첨부를 열 수 있다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  return withSession(async (session) => {
    const { attachmentId } = await params;
    if (!isUuid(attachmentId)) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    const supabase = getServerSupabaseClient();
    const { data: attachment } = await supabase
      .from("task_attachments")
      .select("task_id, name, mime_type, storage_path")
      .eq("id", attachmentId)
      .maybeSingle();

    if (!attachment) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    const [taskResult, assigneeResult] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", attachment.task_id).is("deleted_at", null).maybeSingle(),
      supabase.from("task_assignees").select("*").eq("task_id", attachment.task_id),
    ]);

    const task = taskResult.data as Task | null;
    if (!task || !canView(task, (assigneeResult.data ?? []) as TaskAssignee[], session.employeeId)) {
      // 있는데 권한이 없는 것과 없는 것을 구분해 알려주지 않는다.
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    let upstream: Response;
    try {
      upstream = await fetch(await createDownloadUrl(attachment.storage_path as string));
    } catch {
      return NextResponse.json({ error: "첨부파일을 불러오지 못했습니다." }, { status: 500 });
    }
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "첨부파일을 불러오지 못했습니다." }, { status: 502 });
    }

    const contentType = (attachment.mime_type as string) ?? "application/octet-stream";
    const headers = new Headers({
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "script-src 'none'; object-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      // 브라우저가 못 그리는 형식(pptx)은 새 창에 빈 화면으로 뜨므로 처음부터 내려받게 한다.
      "Content-Disposition": `${
        isPreviewableMimeType(contentType) ? "inline" : "attachment"
      }; filename*=UTF-8''${encodeURIComponent(attachment.name as string)}`,
      "Cache-Control": "private, max-age=60",
    });

    // fetch 가 gzip 을 풀어주므로 압축된 응답의 길이를 그대로 붙이면 어긋난다.
    const encoding = upstream.headers.get("content-encoding");
    const length = upstream.headers.get("content-length");
    if (length && !encoding) headers.set("Content-Length", length);

    return new NextResponse(upstream.body, { status: 200, headers });
  });
}
