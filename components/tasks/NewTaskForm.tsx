"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FILE_MAX_SIZE_MB, isAllowedExtension, isOversized } from "@/lib/file-rules";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { FlatNode } from "@/lib/notes/tree";
import type { TaskKind } from "@/lib/tasks";
import type { Colleague } from "@/lib/tasks-server";
import ArchivePicker from "@/components/tasks/ArchivePicker";
import FileDropZone from "@/components/tasks/FileDropZone";

// 새 업무지시 작성 (PLAN 8차 36번).
//
// 담당자는 여러 명 고를 수 있고, 고른 지시 하나를 그 사람들이 함께 본다 —
// 사람마다 쪼개진 사본이 아니다 (PRD ⑨).
//
// 2단 배치인 이유 (2026-09-10)
//   지시의 알맹이는 세 갈래로 들어온다 — 직접 쓴 내용, 이미 보관함에 있는 자료,
//   그때그때 올리는 파일. 이 셋을 한 줄로 쌓으면 작성창이 세로로 길어져 아래쪽 칸이
//   화면 밖으로 나간다. 왼쪽에 "가져오는 것"(보관함 트리·첨부), 오른쪽에 "쓰는 것"을
//   나눠 한 화면에 담는다.
export default function NewTaskForm({
  colleagues,
  archiveNodes,
  currentEmployeeId,
  kind,
}: {
  colleagues: Colleague[];
  archiveNodes: FlatNode[];
  currentEmployeeId: string;
  /** 지시인지 보고인지. 탭이 정하고 화면 안에서는 바뀌지 않는다 (2026-09-11). */
  kind: TaskKind;
}) {
  const router = useRouter();
  const isReport = kind === "report";
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // 본인에게 지시하는 일은 없으므로 목록에서 뺀다.
  const candidates = useMemo(
    () => colleagues.filter((c) => c.employeeId !== currentEmployeeId),
    [colleagues, currentEmployeeId],
  );

  // 20명 규모라 목록이 다 보이지만, 이름을 치면 바로 좁혀지는 편이 빠르다.
  // 사원번호로도 찾을 수 있게 둘 다 본다.
  const shownPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(q) || c.employeeId.includes(q));
  }, [candidates, search]);

  function toggle(employeeId: string) {
    // 보고를 받는 사람은 한 명이다 — 고르면 앞의 선택을 밀어낸다.
    if (kind === "report") {
      setPicked((prev) => (prev[0] === employeeId ? [] : [employeeId]));
      return;
    }
    setPicked((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    );
  }

  function addFiles(chosen: FileList | null) {
    if (!chosen) return;
    setError(null);
    const next: File[] = [];
    for (const file of Array.from(chosen)) {
      // 서버가 다시 검사하지만(그게 진짜 강제다), 큰 파일을 올리기 시작한 뒤에
      // 거부당하는 것보다 고르는 순간 알려주는 편이 낫다.
      if (!isAllowedExtension(file.name)) {
        setError(`${file.name} — 사진·PDF·PPTX만 올릴 수 있습니다.`);
        continue;
      }
      if (isOversized(file.size)) {
        setError(`${file.name} — 파일이 너무 큽니다. (최대 ${FILE_MAX_SIZE_MB}MB)`);
        continue;
      }
      next.push(file);
    }
    setFiles((prev) => [...prev, ...next]);
  }

  function reset() {
    setTitle("");
    setBody("");
    setDueOn("");
    setPicked([]);
    setSearch("");
    setSourceId(null);
    setFiles([]);
    setError(null);
  }

  // 첨부는 지시를 만든 뒤에 올린다 — 첨부가 task_id 아래에 놓이는데, 지시를 만들기
  // 전에는 그 id 가 없기 때문이다. 그래서 순서가 등록 → 업로드 → 확정이 된다.
  async function uploadOne(taskId: string, file: File): Promise<string | null> {
    const ticket = await fetch("/api/tasks/attachments/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, fileName: file.name, sizeBytes: file.size }),
    });
    const ticketJson = await ticket.json().catch(() => ({}));
    if (!ticket.ok) return ticketJson.error ?? "업로드 준비에 실패했습니다.";

    // 보관함 첨부(NoteEditor)와 같은 방식으로 올린다.
    // 서명 URL 에 그냥 PUT 하면 스토리지에 형식이 기록되지 않아, 확정 단계에서 서버가
    // 읽은 형식이 application/octet-stream 이 되고 허용 목록 검사에 걸린다.
    const supabase = getBrowserSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from("file-server")
      .uploadToSignedUrl(ticketJson.storagePath, ticketJson.token, file, {
        contentType: file.type || "application/octet-stream",
      });
    if (uploadError) return `${file.name} 업로드에 실패했습니다.`;

    const confirm = await fetch("/api/tasks/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, attachmentId: ticketJson.attachmentId, name: file.name }),
    });
    if (!confirm.ok) {
      const j = await confirm.json().catch(() => ({}));
      return j.error ?? `${file.name} 등록에 실패했습니다.`;
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(kind === "report" ? "보고 등록 중..." : "지시 등록 중...");

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          kind,
          dueOn: dueOn || null,
          // 장기 업무 여부를 더 묻지 않는다 (2026-09-11). 고르는 사람마다 기준이 달라
          // 같은 성격의 업무가 어떤 건 진행률이 있고 어떤 건 없었다. 이제 전부 진행률을
          // 쓰고, 짧은 일은 0 에서 100 으로 한 번에 올리면 된다.
          isLongterm: true,
          assigneeIds: picked,
          sourceNodeId: sourceId,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }

      // 첨부가 실패해도 지시는 이미 만들어졌다. 지시를 되돌리지 않고 무엇이 안 올라갔는지
      // 알려준다 — 지시가 통째로 사라지는 쪽이 훨씬 나쁘고, 첨부는 나중에 다시 올릴 수 있다.
      const failed: string[] = [];
      for (const [index, file] of files.entries()) {
        setBusy(`첨부 올리는 중 (${index + 1}/${files.length})...`);
        const message = await uploadOne(data.id, file);
        if (message) failed.push(message);
      }

      if (failed.length > 0) {
        setError(`${isReport ? "보고는" : "지시는"} 등록됐지만 첨부에 문제가 있습니다 — ${failed[0]}`);
        setFiles([]);
        router.refresh();
        return;
      }

      // 작성 전용 탭이라 등록하고 나면 여기 남아 있을 이유가 없다. 방금 만든 것이
      // 보이는 「내 업무」로 보낸다 (2026-09-11).
      reset();
      router.push("/tasks/mine");
      router.refresh();
    } catch {
      setError("등록 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-hair bg-l-form p-3.5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* 왼쪽 — 가져오는 것: 보관함 트리와 첨부파일 */}
        <div className="space-y-3">
          <ArchivePicker
            nodes={archiveNodes}
            selectedId={sourceId}
            onSelect={(node) => setSourceId(node?.id ?? null)}
          />

          <div>
            <FileDropZone
              onFiles={addFiles}
              label="첨부파일"
              hint={`(선택 · 사진·PDF·PPTX, 최대 ${FILE_MAX_SIZE_MB}MB)`}
            />
            {files.length > 0 && (
              <ul className="mt-1 border border-hair-2 bg-l-card">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 border-b border-hair px-2 py-1 text-[11.5px] last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-3">
                      {(file.size / 1024 / 1024).toFixed(1)}MB
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      className="shrink-0 text-[10.5px] text-ink-3 underline hover:text-late"
                    >
                      빼기
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 오른쪽 — 쓰는 것 */}
        <div className="space-y-3">
          <div>
            <label htmlFor="task-title" className="mb-1 block text-[10.5px] text-ink-2">
              제목
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              className="w-full border border-hair-2 bg-l-card px-2.5 py-1.5 text-[13px] text-ink"
            />
          </div>

          <div>
            <label
              htmlFor="task-body"
              className="mb-1 flex items-baseline gap-2 text-[10.5px] text-ink-2"
            >
              내용
              {/* 지시문은 실무 말로 쓰여 환자 이름이 자연스럽게 섞여 들어온다. 회의록보다
                  위험이 크지만, 칸 하나를 통째로 쓰는 경고는 매번 읽히지 않고 자리만
                  차지한다 — 라벨 옆 한 줄로 줄인다 (PRD 7번). */}
              <span className="text-[10px] font-normal text-ink-3">
                환자 이름·차트번호는 적지 않습니다
              </span>
            </label>
            <textarea
              id="task-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              // 지시문은 보통 여러 줄이다. 다섯 줄짜리 칸은 쓰는 동안 위가 계속 밀려
              // 올라가 앞에 뭘 썼는지 보이지 않았다 (2026-09-11).
              rows={14}
              className="w-full border border-hair-2 bg-l-card px-2.5 py-1.5 text-[13px] leading-relaxed text-ink"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10.5px] text-ink-2">
                {isReport
                  ? "보고 받을 사람 (한 명)"
                  : `담당자 ${picked.length > 0 ? `(${picked.length}명)` : ""}`}
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름 검색"
                aria-label={isReport ? "보고 받을 사람 이름 검색" : "담당자 이름 검색"}
                className="w-24 border border-hair-2 bg-l-card px-2 py-1 text-[11px] text-ink"
              />
            </div>
            <div className="max-h-32 overflow-y-auto border border-hair-2 bg-l-card">
              {shownPeople.length === 0 ? (
                <p className="px-2.5 py-3 text-center text-[11px] text-ink-3">찾는 사람이 없습니다.</p>
              ) : (
                shownPeople.map((c) => (
                  <label
                    key={c.employeeId}
                    className="flex cursor-pointer items-center gap-2 border-b border-hair px-2.5 py-1.5 text-[12px] last:border-b-0 hover:bg-l-cal"
                  >
                    <input
                      type={isReport ? "radio" : "checkbox"}
                      name={isReport ? "task-report-target" : undefined}
                      checked={picked.includes(c.employeeId)}
                      onChange={() => toggle(c.employeeId)}
                      className="h-3.5 w-3.5 accent-navy"
                    />
                    <span className="text-ink">{c.name}</span>
                    <span className="font-mono text-[10px] text-ink-3">{c.employeeId}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* 마감일과 진행률은 앞으로 할 일에 붙는 값이다. 보고는 이미 한 일을 올리는
              것이라 둘 다 물을 것이 없다 — 칸을 비워두느니 감춘다. */}
          <div className={`flex flex-wrap items-end gap-4 ${isReport ? "hidden" : ""}`}>
            <div>
              <label htmlFor="task-due" className="mb-1 block text-[10.5px] text-ink-2">
                마감일
              </label>
              <input
                id="task-due"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                className="border border-hair-2 bg-l-card px-2.5 py-1.5 text-[12px] text-ink"
              />
            </div>

          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2.5 text-[11.5px] text-late">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy !== null}
          className="border border-navy bg-navy px-3 py-1.5 text-[11.5px] text-white hover:bg-head disabled:opacity-50"
        >
          {busy ?? (isReport ? "보고하기" : "지시하기")}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            router.push("/tasks");
          }}
          disabled={busy !== null}
          className="border border-hair-2 px-3 py-1.5 text-[11.5px] text-ink-2 hover:bg-l-cal disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}
