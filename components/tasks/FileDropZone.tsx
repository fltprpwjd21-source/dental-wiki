"use client";

import { useRef, useState, type DragEvent } from "react";
import { ACCEPT_ATTRIBUTE, FILE_MAX_SIZE_MB } from "@/lib/file-rules";

// 파일을 끌어다 놓거나 눌러서 고르는 칸 (2026-09-10).
//
// 둘 다 두는 이유
//   끌어놓기는 탐색기를 이미 열어 둔 사람에게 빠르지만, 그 방법을 모르는 사람도 있고
//   휴대폰에는 끌어놓을 것이 없다. 같은 칸을 눌러도 파일 선택창이 뜨게 해서 어느 쪽으로도
//   되게 한다.
//
// 검사는 여기서 하지 않는다 — 형식·용량 판단은 부르는 쪽이 lib/file-rules 로 한 곳에서
// 하고(그리고 진짜 강제는 서버가 한다), 이 컴포넌트는 파일을 건네주기만 한다.
export default function FileDropZone({
  onFiles,
  label = "첨부파일",
  hint,
}: {
  onFiles: (files: FileList | null) => void;
  label?: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  // dragenter/dragleave 는 자식 위를 지날 때마다 다시 불린다. 그대로 쓰면 테두리가
  // 깜빡이므로 들어온 횟수를 세서 진짜로 벗어났을 때만 끈다.
  const depth = useRef(0);

  function handleEnter(event: DragEvent) {
    event.preventDefault();
    depth.current += 1;
    setOver(true);
  }

  function handleLeave(event: DragEvent) {
    event.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) {
      depth.current = 0;
      setOver(false);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    onFiles(event.dataTransfer?.files ?? null);
  }

  return (
    <div>
      <span className="mb-1 block text-[10.5px] text-ink-2">
        {label}{" "}
        <span className="text-ink-3">{hint ?? `사진·PDF·PPTX, 최대 ${FILE_MAX_SIZE_MB}MB`}</span>
      </span>

      <div
        onDragEnter={handleEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleLeave}
        onDrop={handleDrop}
        className={`border border-dashed px-3 py-3 text-center transition-colors ${
          over ? "border-navy bg-l-cal" : "border-hair-2 bg-l-card"
        }`}
      >
        <p className="text-[11.5px] text-ink-2">
          여기로 파일을 끌어다 놓거나{" "}
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="underline decoration-hair-2 underline-offset-2 hover:decoration-ink-3"
          >
            눌러서 고르세요
          </button>
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          onChange={(e) => {
            onFiles(e.target.files);
            // 같은 파일을 다시 골랐을 때도 change 가 일어나게 값을 비운다.
            e.target.value = "";
          }}
          aria-label={`${label} 고르기`}
          className="sr-only"
        />
      </div>
    </div>
  );
}
