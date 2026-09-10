import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import type { Task, TaskAssignee } from "@/lib/tasks";

// 업무지시 조작 라우트들이 똑같이 반복하는 앞부분을 모은다 (PLAN 8차 37번).
//
// 어느 라우트든 시작이 같다 — id 검사, 지시와 담당자 읽기, 없으면 404.
// 이걸 라우트마다 베껴 쓰면 한 곳에서 담당자 조회를 빠뜨려도 드러나지 않는다.

export type TaskContext = { task: Task; assignees: TaskAssignee[] };

export async function loadTask(taskId: string): Promise<TaskContext | NextResponse> {
  if (!isUuid(taskId)) {
    return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  }

  const supabase = getServerSupabaseClient();
  const [taskResult, assigneeResult] = await Promise.all([
    supabase.from("tasks").select("*").eq("id", taskId).is("deleted_at", null).maybeSingle(),
    supabase.from("task_assignees").select("*").eq("task_id", taskId),
  ]);

  const task = taskResult.data as Task | null;
  if (!task) {
    return NextResponse.json({ error: "업무지시를 찾을 수 없습니다." }, { status: 404 });
  }

  return { task, assignees: (assigneeResult.data ?? []) as TaskAssignee[] };
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

// 진행 기록을 남기고, 지시 쪽 값도 함께 고친다.
//
// 두 표를 잇달아 쓰므로 중간에 실패하면 어긋난다. 트랜잭션을 쓰려면 DB 함수를 만들어야
// 하는데, 여기서 어긋났을 때의 결과는 "기록은 남았는데 상태가 안 바뀜" 정도라
// 되돌릴 수 없는 손해가 아니다. 기록을 먼저 남기고 상태를 나중에 고친다 —
// 반대로 하면 상태만 바뀌고 왜 그랬는지가 대화에서 사라진다.
export async function appendUpdate(params: {
  taskId: string;
  authorId: string;
  authorName: string | null;
  kind: "note" | "submit" | "reject";
  body: string;
  progress?: number | null;
  taskPatch?: Record<string, unknown>;
}): Promise<{ id: string } | NextResponse> {
  const supabase = getServerSupabaseClient();

  const { data: update, error } = await supabase
    .from("task_updates")
    .insert({
      task_id: params.taskId,
      author_id: params.authorId,
      author_name: params.authorName,
      kind: params.kind,
      body: params.body,
      progress: params.progress ?? null,
    })
    .select("id")
    .single();

  if (error || !update) {
    console.error("[tasks] 기록 등록 실패", error);
    return NextResponse.json({ error: "기록에 실패했습니다." }, { status: 500 });
  }

  const patch = { ...(params.taskPatch ?? {}), updated_at: new Date().toISOString() };
  const { error: patchError } = await supabase.from("tasks").update(patch).eq("id", params.taskId);
  if (patchError) {
    console.error("[tasks] 상태 갱신 실패", patchError);
    return NextResponse.json({ error: "상태를 바꾸지 못했습니다." }, { status: 500 });
  }

  return { id: update.id as string };
}

/** 지시·기록에 남길 작성자 이름 스냅샷을 화이트리스트에서 읽는다. */
export async function snapshotName(employeeId: string): Promise<string | null> {
  const supabase = getServerSupabaseClient();
  const { data } = await supabase
    .from("employee_whitelist")
    .select("name")
    .eq("employee_id", employeeId)
    .maybeSingle();
  return (data?.name as string | null) ?? null;
}
