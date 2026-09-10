"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FILE_MAX_SIZE_MB, isAllowedExtension, isOversized } from "@/lib/file-rules";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { DEFAULT_SUBMIT_BODY, PROGRESS_STEPS } from "@/lib/tasks";
import type { TaskDetail, TaskUpdateView } from "@/lib/tasks-server";
import FileDropZone from "@/components/tasks/FileDropZone";

// 업무지시 대화창 (PLAN 8차 37번).
//
// 왜 채팅 모양인가
//   지시 → 작업 → 완료 보고 → 반려 → 다시 작업은 시간 순서가 곧 의미다. 표로 쌓으면
//   "왜 진행률이 0 이 됐지"를 알려면 여러 칸을 짚어봐야 하는데, 한 줄로 흐르면 반려
//   사유 바로 아래에 그 답이 있다.
//
// 임시저장을 브라우저에 두는 이유
//   올린 기록은 지울 수 없다(DB 트리거). 올리기 전 초안까지 서버에 두면 "남의 초안"을
//   관리해야 하고, 그건 아무도 요구하지 않았다. 대신 다른 기기에서는 이어 쓸 수 없다.
function draftKey(taskId: string, employeeId: string) {
  return `dentalwiki:task-draft:${taskId}:${employeeId}`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AttachmentList({ items }: { items: TaskUpdateView["attachments"] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {items.map((file) => (
        <li key={file.id}>
          <a
            href={`/api/tasks/attachments/${file.id}/content`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 text-[11px] underline decoration-hair-2 underline-offset-2 hover:decoration-ink-3"
          >
            <span aria-hidden>📎</span>
            <span className="truncate">{file.name}</span>
            <span className="shrink-0 font-mono text-[9.5px] text-ink-3">
              {(file.sizeBytes / 1024 / 1024).toFixed(1)}MB
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// 가운데 회색·주황·빨강 줄. 상태가 바뀐 사건은 말풍선이 아니라 이 줄로 알린다 —
// 말풍선으로 만들면 사람이 쓴 말과 시스템이 남긴 사실이 섞여 읽힌다.
function SystemLine({ tone, children }: { tone: "muted" | "amber" | "late"; children: React.ReactNode }) {
  const color = tone === "amber" ? "text-amber" : tone === "late" ? "text-late" : "text-ink-3";
  const line = tone === "muted" ? "bg-hair" : tone === "amber" ? "bg-amber/40" : "bg-late/40";
  return (
    <div className="my-2 flex items-center gap-2">
      <span className={`h-px flex-1 ${line}`} />
      <span className={`text-[10px] ${color}`}>{children}</span>
      <span className={`h-px flex-1 ${line}`} />
    </div>
  );
}

function Bubble({ update, mine }: { update: TaskUpdateView; mine: boolean }) {
  const isReject = update.kind === "reject";

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] min-w-0">
        <div
          className={`mb-0.5 flex items-baseline gap-1.5 text-[10px] text-ink-3 ${
            mine ? "justify-end" : ""
          }`}
        >
          <span className="text-ink-2">{update.authorName}</span>
          <span>{timeLabel(update.createdAt)}</span>
          {isReject && <span className="text-late">반려 사유</span>}
          {update.editedAt && <span>(수정됨)</span>}
        </div>
        <div
          className={`border px-2.5 py-1.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words ${
            isReject
              ? "border-late bg-l-card text-ink"
              : mine
                ? "border-meet bg-l-cal text-ink"
                : "border-hair bg-l-card text-ink"
          }`}
        >
          {update.body}
          <AttachmentList items={update.attachments} />
        </div>
      </div>
    </div>
  );
}

export default function TaskThread({
  taskId,
  employeeId,
  isLongterm,
  progress,
  updates,
  can,
}: {
  taskId: string;
  employeeId: string;
  isLongterm: boolean;
  progress: number;
  updates: TaskDetail["updates"];
  can: TaskDetail["can"];
}) {
  const router = useRouter();

  const [body, setBody] = useState("");
  const [nextProgress, setNextProgress] = useState(progress);
  const [files, setFiles] = useState<File[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // 초안 불러오기 — 브라우저를 닫았다 와도 쓰던 글이 남아 있다.
  //
  // 서버에는 localStorage 가 없으므로 렌더 중에 읽을 수 없고, 그렇다고 effect 안에서
  // 바로 setState 하면 렌더가 한 번 더 도는 것을 React 가 경고한다. 그려진 뒤로
  // 미뤄서 두 문제를 함께 피한다 — 초안은 사람이 읽기 시작하는 순간 채워지면 된다.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem(draftKey(taskId, employeeId));
        if (saved) {
          setBody(saved);
          setSavedAt("임시저장됨");
        }
      } catch {
        // 사생활 보호 모드 등에서 접근이 막힐 수 있다. 초안이 없는 것으로 친다.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [taskId, employeeId]);

  // 타이핑이 멎으면 저장한다. 글자마다 쓰면 저장 표시가 계속 깜빡여서 오히려 불안하다.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (body.trim()) {
          localStorage.setItem(draftKey(taskId, employeeId), body);
          setSavedAt("임시저장됨");
        } else {
          localStorage.removeItem(draftKey(taskId, employeeId));
          setSavedAt(null);
        }
      } catch {
        // 저장이 막혀도 글쓰기를 멈추지 않는다.
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [body, taskId, employeeId]);

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey(taskId, employeeId));
    } catch {
      /* 무시 */
    }
    setSavedAt(null);
  }

  function addFiles(chosen: FileList | null) {
    if (!chosen) return;
    setError(null);
    const next: File[] = [];
    for (const file of Array.from(chosen)) {
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

  // 첨부는 기록을 만든 뒤에 붙인다 — update_id 가 있어야 그 말풍선 안에 들어간다.
  async function uploadOne(updateId: string, file: File): Promise<string | null> {
    const ticket = await fetch("/api/tasks/attachments/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, fileName: file.name, sizeBytes: file.size }),
    });
    const t = await ticket.json().catch(() => ({}));
    if (!ticket.ok) return t.error ?? "업로드 준비에 실패했습니다.";

    const supabase = getBrowserSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from("file-server")
      .uploadToSignedUrl(t.storagePath, t.token, file, {
        contentType: file.type || "application/octet-stream",
      });
    if (uploadError) return `${file.name} 업로드에 실패했습니다.`;

    const confirm = await fetch("/api/tasks/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, attachmentId: t.attachmentId, name: file.name, updateId }),
    });
    if (!confirm.ok) {
      const j = await confirm.json().catch(() => ({}));
      return j.error ?? `${file.name} 등록에 실패했습니다.`;
    }
    return null;
  }

  async function post(submit: boolean) {
    setError(null);
    setBusy(submit ? "완료 보고 중..." : "기록하는 중...");

    try {
      const text = body.trim() || (submit ? DEFAULT_SUBMIT_BODY : "");
      const response = await fetch(`/api/tasks/${taskId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: text,
          submit,
          progress: isLongterm ? nextProgress : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "기록에 실패했습니다.");
        return;
      }

      const failed: string[] = [];
      for (const [index, file] of files.entries()) {
        setBusy(`첨부 올리는 중 (${index + 1}/${files.length})...`);
        const message = await uploadOne(data.id, file);
        if (message) failed.push(message);
      }

      setBody("");
      setFiles([]);
      clearDraft();
      if (failed.length > 0) setError(`기록은 남았지만 첨부에 문제가 있습니다 — ${failed[0]}`);
      router.refresh();
    } catch {
      setError("처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function decide(decision: "approve" | "reject") {
    setError(null);
    setBusy(decision === "approve" ? "완료 확인 중..." : "반려하는 중...");
    try {
      const response = await fetch(`/api/tasks/${taskId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "처리에 실패했습니다.");
        return;
      }
      setRejecting(false);
      setReason("");
      router.refresh();
    } catch {
      setError("처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function ack() {
    setBusy("확인 중...");
    try {
      await fetch(`/api/tasks/${taskId}/ack`, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  // 쓰는 칸은 담당자에게만 (2026-09-10). 지시자는 반려 사유가 그 자리다.
  // 지시자에게도 완료 확인·반려 버튼은 필요하므로 그 줄은 따로 그린다.
  const showCompose = can.compose;
  const showDecision = can.approve || can.reject;

  return (
    <section className="mt-5">
      <h2 className="mb-2 text-[11px] font-medium text-ink-2">작업 기록</h2>

      <div className="space-y-1.5 border border-hair bg-l-body px-3 py-3">
        {updates.length === 0 ? (
          <p className="py-4 text-center text-[11.5px] text-ink-3">아직 기록이 없습니다.</p>
        ) : (
          updates.map((update) => (
            <div key={update.id}>
              <Bubble update={update} mine={update.authorId === employeeId} />
              {update.kind === "submit" && (
                <SystemLine tone="amber">{update.authorName}님이 완료를 보고했습니다</SystemLine>
              )}
              {update.kind === "reject" && (
                <SystemLine tone="late">
                  {update.authorName}님이 반려했습니다 · 진행률이 0% 로 초기화되었습니다
                </SystemLine>
              )}
              {update.kind === "note" && update.progress !== null && (
                <SystemLine tone="muted">
                  {update.authorName} 진행률 {update.progress}%
                </SystemLine>
              )}
            </div>
          ))
        )}
      </div>

      {/* 확인 체크 — 담당자가 아직 안 눌렀을 때만 */}
      {can.ack && (
        <div className="mt-2 flex items-center gap-2 border border-amber bg-l-cal px-3 py-2">
          <span className="flex-1 text-[11.5px] text-ink">이 업무지시를 확인하셨나요?</span>
          <button
            type="button"
            onClick={ack}
            disabled={busy !== null}
            className="border border-navy bg-navy px-3 py-1 text-[11.5px] text-white hover:bg-head disabled:opacity-50"
          >
            확인
          </button>
        </div>
      )}

      {(showCompose || showDecision) && (
        <div className="mt-2 border border-hair bg-l-form p-3">
          {showCompose && (
            <>
          <div className="relative">
            <label htmlFor="task-note" className="sr-only">
              작업 기록
            </label>
            <textarea
              id="task-note"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="작업 과정을 적습니다..."
              className="w-full border border-hair-2 bg-l-card px-2.5 py-1.5 text-[12.5px] leading-relaxed text-ink"
            />
            {savedAt && (
              <span className="absolute right-2 bottom-2 text-[10px] text-ink-3">{savedAt} ✓</span>
            )}
          </div>

          {isLongterm && (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="task-progress" className="text-[10.5px] text-ink-2">
                  진행률
                </label>
                <span className="font-mono text-[11px] tabular-nums text-ink">{nextProgress}%</span>
              </div>
              <input
                id="task-progress"
                type="range"
                min={0}
                max={100}
                step={20}
                value={nextProgress}
                onChange={(e) => setNextProgress(Number(e.target.value))}
                className="w-full accent-navy"
              />
              <div className="flex justify-between px-0.5 font-mono text-[9px] text-ink-3">
                {PROGRESS_STEPS.map((step) => (
                  <span key={step}>{step}</span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2">
            <FileDropZone onFiles={addFiles} />
            {files.length > 0 && (
              <ul className="mt-1 border border-hair-2 bg-l-card">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 border-b border-hair px-2 py-1 text-[11.5px] last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
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

            </>
          )}

          <div className={`flex flex-wrap gap-2 ${showCompose ? "mt-2.5" : ""}`}>
            {can.addUpdate && (
              <button
                type="button"
                onClick={() => post(false)}
                disabled={busy !== null || (!body.trim() && nextProgress === progress && files.length === 0)}
                className="border border-hair-2 bg-l-card px-3 py-1.5 text-[11.5px] text-ink hover:bg-l-cal disabled:opacity-40"
              >
                기록 남기기
              </button>
            )}
            {can.submit && (
              <button
                type="button"
                onClick={() => post(true)}
                disabled={busy !== null}
                className="border border-navy bg-navy px-3 py-1.5 text-[11.5px] text-white hover:bg-head disabled:opacity-50"
              >
                작업 완료
              </button>
            )}
            {can.approve && (
              <button
                type="button"
                onClick={() => decide("approve")}
                disabled={busy !== null}
                className="border border-done bg-done px-3 py-1.5 text-[11.5px] text-white hover:opacity-90 disabled:opacity-50"
              >
                완료 확인
              </button>
            )}
            {can.reject && !rejecting && (
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy !== null}
                className="border border-late px-3 py-1.5 text-[11.5px] text-late hover:bg-l-card disabled:opacity-50"
              >
                반려
              </button>
            )}
            {busy && <span className="self-center text-[11px] text-ink-3">{busy}</span>}
          </div>

          {rejecting && (
            <div className="mt-2.5 border border-late bg-l-card p-2.5">
              <label htmlFor="task-reason" className="mb-1 block text-[10.5px] text-late">
                반려 사유 (필수)
              </label>
              <textarea
                id="task-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                autoFocus
                placeholder="무엇을 고쳐야 하는지 적어주세요."
                className="w-full border border-hair-2 bg-l-card px-2.5 py-1.5 text-[12.5px] text-ink"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => decide("reject")}
                  disabled={busy !== null || !reason.trim()}
                  className="border border-late bg-late px-3 py-1 text-[11.5px] text-white hover:opacity-90 disabled:opacity-40"
                >
                  반려하기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejecting(false);
                    setReason("");
                  }}
                  className="border border-hair-2 px-3 py-1 text-[11.5px] text-ink-2 hover:bg-l-cal"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-[11.5px] text-late">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
