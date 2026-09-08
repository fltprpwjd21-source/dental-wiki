"use client";

import { useEffect, useState } from "react";

// 노트 맨 아래에 붙는 "누가 언제 무엇을 했는지" 기록.
//
// 문서 쪽 "수정 로그 보기"(components/DocumentLogSection.tsx)와 같은 자리·같은 성격이다.
// 다만 노트는 이전 본문을 보관하지 않으므로 되돌리기가 없고, 행위와 사람·시각만 보여준다.
const ACTION_LABEL: Record<string, string> = {
  // 처음 올린 것은 고친 게 아니다. 첫 저장은 서버가 upload_note 로 바꿔 내려준다
  // (lib/note-logs.ts) — 그 뒤의 저장만 「내용 수정」이다.
  upload_note: "업로드",
  create_folder: "폴더 만듦",
  create_note: "노트 만듦",
  update_note: "내용 수정",
  upload_attachment: "첨부 올림",
  upload_image: "첨부 올림", // 옛 이름으로 쌓인 기록도 그대로 읽힌다
  rename: "이름 변경",
  trash: "휴지통으로",
  restore: "복구",
  purge: "완전 삭제",
};

type NoteLog = {
  id: string;
  action: string;
  actor: string;
  actorName: string | null;
  createdAt: string;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NoteLogSection({ nodeId, version }: { nodeId: string; version: number }) {
  const [logs, setLogs] = useState<NoteLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // version 이 바뀌면(=저장·이름변경이 일어나면) 방금 남은 기록까지 다시 읽는다.
  //
  // 이펙트 본문에서 setState 를 동기로 부르지 않는다 — 이 저장소가 이미 겪은
  // cascading render 문제이고 lint 가 오류로 잡는다. 상태는 응답이 온 뒤에만 바꾸고,
  // 이전 오류 표시도 그때 함께 정리한다.
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/notes/${nodeId}/logs`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.logs) {
          setLogs(data.logs);
          setError(null);
        } else {
          setError(data.error ?? "기록을 불러오지 못했습니다.");
        }
      })
      .catch(() => !cancelled && setError("기록을 불러오는 중 오류가 발생했습니다."));

    return () => {
      cancelled = true;
    };
  }, [nodeId, version]);

  return (
    <details className="mt-8 border-t border-gray-100 pt-4">
      <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-brand">
        {/* 「수정 기록」이 아니라 「기록」이다 — 업로드·이름 변경·휴지통처럼
            수정이 아닌 일도 여기 들어온다 */}
        기록 {logs ? `(${logs.length}건)` : ""}
      </summary>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {logs && logs.length === 0 && (
        <p className="mt-2 text-xs text-gray-400">아직 기록이 없습니다.</p>
      )}

      {logs && logs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-mono tabular-nums text-gray-400">{formatWhen(log.createdAt)}</span>
              <span className="text-ink">
                {log.actor}
                {log.actorName && <span className="text-gray-500"> {log.actorName}</span>}
              </span>
              <span className="text-gray-500">{ACTION_LABEL[log.action] ?? log.action}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
