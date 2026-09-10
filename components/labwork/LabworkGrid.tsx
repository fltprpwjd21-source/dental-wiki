"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LABWORK_COLUMNS, parsePastedGrid, type LabworkColumn } from "@/lib/labwork/columns";
import { formatDate } from "@/lib/labwork/date";
import {
  ARRIVED_CHECK_KEY,
  type LabworkDraft,
  type LabworkRecord,
  type LabworkScope,
} from "@/lib/labwork/types";

// 엑셀처럼 칸에 바로 치는 표.
//
// 이 화면이 답하려는 질문은 하나다 — "엑셀 대신 여기에 입력해도 괜찮은가."
// 그래서 손맛에 관계된 것만 넣었다.
//   · 칸을 누르면 바로 쳐진다 (편집 버튼 없음)
//   · Tab 다음 칸, Shift+Tab 이전 칸, Enter 아래 칸
//   · 마지막 줄에서 Enter 를 누르면 줄이 새로 생긴다
//   · 엑셀에서 복사한 여러 칸을 그대로 붙여넣을 수 있다
//   · 저장 버튼이 없다. 칸을 벗어나면 그 칸만 저장된다
//
// 저장을 칸 단위로 하는 이유
//   줄 전체를 보내면 내가 안 건드린 칸까지 내 화면의 옛 값으로 덮어쓴다.
//   표는 여러 사람이 같이 보는 물건이라 그게 실제 사고가 된다.

type Cell = { row: number; col: number };

/** 무엇으로 찾을 수 있는지. 이 셋 말고는 찾아도 쓸모가 없다. */
const SEARCH_KEYS: (keyof LabworkDraft)[] = ["patient_name", "patient_chart_no", "kind"];

// 오늘 날짜. toISOString() 은 UTC 라 한국 시간 오전 9시 전에는 하루 전이 나온다.
function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function matches(row: LabworkRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return SEARCH_KEYS.some((key) => String(row[key] ?? "").toLowerCase().includes(q));
}

export default function LabworkGrid({
  initial,
  scope,
}: {
  initial: LabworkRecord[];
  scope: LabworkScope;
}) {
  const [rows, setRows] = useState<LabworkRecord[]>(initial);
  const [active, setActive] = useState<Cell | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 찾는 중에는 보이는 줄만 다룬다. 아래 모든 자리(그리기·키보드 이동·붙여넣기)가
  // 이 목록 하나를 본다 — 원래 목록과 섞어 쓰면 3번째 줄이 서로 다른 줄을 가리킨다.
  const visible = useMemo(() => rows.filter((r) => matches(r, query)), [rows, query]);
  const searching = query.trim().length > 0;

  // 고른 칸으로 실제 커서를 옮긴다. 표에서는 "지금 어디에 치고 있는지"가 보여야 한다.
  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const markSaving = useCallback((key: string, on: boolean) => {
    setSaving((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // 칸 하나를 저장한다. 화면은 먼저 바꾸고 서버에는 뒤따라 보낸다 —
  // 한 글자 칠 때마다 기다리면 표가 아니라 설문지가 된다.
  const saveCell = useCallback(
    async (row: LabworkRecord, key: keyof LabworkDraft, value: string | boolean) => {
      const before = row[key];
      if (before === value) return;

      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [key]: value } : r)));
      const savingKey = `${row.id}:${String(key)}`;
      markSaving(savingKey, true);
      setError(null);

      try {
        const res = await fetch(`/api/lab/items/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
        // 서버가 정리한 값으로 맞춘다 — 날짜를 덜 쳤으면 서버가 비워서 돌려준다.
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...data.item } : r)));
      } catch (e) {
        // 실패하면 되돌린다. 화면에만 남아 있는 값은 "저장된 것처럼 보이는 거짓말"이다.
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [key]: before } : r)));
        setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      } finally {
        markSaving(savingKey, false);
      }
    },
    [markSaving],
  );

  // 「도착」 체크는 도착일을 보는 창일 뿐이다. 체크하면 오늘, 풀면 빈 값.
  const toggleArrived = useCallback(
    (row: LabworkRecord, on: boolean) => saveCell(row, "arrived_on", on ? todayIso() : ""),
    [saveCell],
  );

  const addRows = useCallback(
    async (drafts: Partial<LabworkDraft>[]) => {
      setError(null);
      try {
        const res = await fetch("/api/lab/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, rows: drafts }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "줄을 추가하지 못했습니다.");
        setRows((prev) => [...prev, ...(data.items as LabworkRecord[])]);
        return data.items as LabworkRecord[];
      } catch (e) {
        setError(e instanceof Error ? e.message : "줄을 추가하지 못했습니다.");
        return [];
      }
    },
    [scope],
  );

  // 고른 줄을 한 번에 지운다. 한 줄씩 스무 번 보내면 중간에 하나가 실패했을 때
  // 화면과 DB 가 어긋난다.
  const removeSelected = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`${ids.length}줄을 지울까요? 되돌릴 수 없습니다.`)) return;

    const snapshot = rows;
    setRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    setActive(null);

    const res = await fetch("/api/lab/items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      setRows(snapshot);
      setError("지우지 못했습니다.");
    }
  }, [selected, rows]);

  const toggleSelected = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // 엑셀에서 복사한 덩어리를 지금 칸부터 채운다.
  // 이게 없으면 "엑셀 대신 쓸 수 있나"의 답이 그냥 아니오가 된다.
  const handlePaste = useCallback(
    async (event: React.ClipboardEvent, at: Cell) => {
      const text = event.clipboardData.getData("text/plain");
      if (!text.includes("\t") && !text.includes("\n")) return; // 한 칸짜리는 그냥 붙게 둔다
      event.preventDefault();

      const grid = parsePastedGrid(text);
      const needed = at.row + grid.length - visible.length;
      let target = visible;
      if (needed > 0) {
        if (searching) return; // 찾는 중에는 줄을 만들지 않는다 — 만들어도 바로 사라진다
        const made = await addRows(Array.from({ length: needed }, () => ({})));
        if (made.length < needed) return;
        target = [...visible, ...made];
      }

      for (let r = 0; r < grid.length; r++) {
        const row = target[at.row + r];
        if (!row) break;
        for (let c = 0; c < grid[r].length; c++) {
          const column = LABWORK_COLUMNS[at.col + c];
          if (!column) break;
          const raw = grid[r][c].trim();
          const yes = /^(o|y|예|v|true|1|도착)$/i.test(raw);
          if (column.key === ARRIVED_CHECK_KEY) await toggleArrived(row, yes);
          else if (column.kind === "check") await saveCell(row, column.key as keyof LabworkDraft, yes);
          else await saveCell(row, column.key as keyof LabworkDraft, raw);
        }
      }
    },
    [visible, searching, addRows, saveCell, toggleArrived],
  );

  // 표 안에서 키보드로만 돌아다닐 수 있어야 한다. 손이 마우스로 가면 표가 아니다.
  //
  // preventDefault() 를 맨 먼저, await 앞에서 부른다
  //   await 를 한 번이라도 지나면 브라우저는 이미 기본 동작을 끝낸 뒤다.
  //   그래서 Tab 이 다음 칸이 아니라 주소창으로 넘어갔다 — 실제로 그렇게 동작했다.
  //   currentTarget 도 같은 이유로 먼저 읽어 둔다(핸들러가 끝나면 비워진다).
  //
  // 옮기기 전에 반드시 먼저 저장한다
  //   칸을 옮기면 그 자리의 input 이 화면에서 사라지는데, 사라진 요소의 onBlur 는
  //   React 가 부르지 않는다. 저장을 onBlur 에만 맡기면 Tab 으로 넘어갈 때마다
  //   방금 친 값이 조용히 버려진다.
  const handleKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLInputElement>, at: Cell) => {
      const key = event.key;
      if (key !== "Tab" && key !== "Enter" && key !== "Escape") return;

      event.preventDefault();
      const typed = event.currentTarget.value;
      const shiftHeld = event.shiftKey;

      if (key === "Escape") {
        setActive(null);
        return;
      }

      const column = LABWORK_COLUMNS[at.col];
      const row = visible[at.row];
      if (column && row && column.kind !== "check") {
        await saveCell(row, column.key as keyof LabworkDraft, typed);
      }

      const lastCol = LABWORK_COLUMNS.length - 1;
      let next: Cell;

      if (key === "Tab") {
        let { row: r, col: c } = at;
        const step = shiftHeld ? -1 : 1;
        // 잠긴 칸(내부시트의 기공소)은 건너뛴다. 멈춰 서면 Tab 이 먹통처럼 느껴진다.
        do {
          c += step;
          if (c > lastCol) { c = 0; r += 1; }
          if (c < 0) { c = lastCol; r -= 1; }
        } while (scope === "internal" && LABWORK_COLUMNS[c]?.key === "lab");
        if (r < 0) return;
        next = { row: r, col: c };
      } else {
        // 마지막 줄에서 Enter 를 누르면 줄이 새로 생긴다 — 엑셀에서 하던 그대로다.
        next = { row: at.row + 1, col: at.col };
      }

      if (next.row >= visible.length) {
        // 찾는 중에는 줄을 만들지 않는다. 만들어 봐야 조건에 안 맞아 바로 사라진다.
        if (searching) return;
        const made = await addRows([{}]);
        if (made.length === 0) return;
      }
      setActive(next);
    },
    [visible, addRows, saveCell, scope, searching],
  );

  // 맨 앞의 좁은 칸은 줄 고르기용이다.
  const template = useMemo(() => "2.2rem " + LABWORK_COLUMNS.map((c) => c.width).join(" "), []);

  const allShownSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  function cellValue(row: LabworkRecord, col: LabworkColumn) {
    // 「도착」은 저장된 칸이 아니라 도착일을 보는 창이다.
    if (col.key === ARRIVED_CHECK_KEY) return Boolean(row.arrived_on);
    return row[col.key as keyof LabworkDraft];
  }

  return (
    <div className="mt-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 border border-hair-2 bg-white px-2.5 py-1.5 focus-within:border-navy sm:max-w-xs">
          <span aria-hidden className="shrink-0 text-ink-3">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // 찾으면 보이는 줄이 바뀐다. 고른 칸이 남아 있으면 엉뚱한 줄이 열린다.
              setActive(null);
            }}
            placeholder="환자명 · 등록번호 · 보철물"
            aria-label="환자명, 등록번호, 보철물로 찾기"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-3"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="찾기 지우기"
              className="shrink-0 text-[13px] leading-none text-ink-3 hover:text-ink"
            >
              ×
            </button>
          )}
        </div>

        {selected.size > 0 && (
          <button
            type="button"
            onClick={removeSelected}
            className="border border-late px-3 py-1.5 text-[11.5px] text-late transition-colors hover:bg-late hover:text-white"
          >
            고른 {selected.size}줄 지우기
          </button>
        )}

        <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-3">
          {searching ? `${rows.length}줄 중 ${visible.length}줄` : `${rows.length}줄`}
        </span>
      </div>

      {error && (
        <p role="alert" className="mb-2 border-l-2 border-late bg-white px-3 py-2 text-[12px] text-late">
          {error}
        </p>
      )}

      <div className="overflow-x-auto border border-hair-2 bg-white">
        <div className="min-w-[48rem]">
          {/* 머리줄 */}
          <div
            className="grid border-b border-hair-2 bg-l-form text-[11px] font-medium text-ink-2"
            style={{ gridTemplateColumns: template }}
          >
            <label className="flex cursor-pointer items-center justify-center py-2">
              <input
                type="checkbox"
                checked={allShownSelected}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(visible.map((r) => r.id)) : new Set())
                }
                aria-label="보이는 줄 모두 고르기"
                className="h-3.5 w-3.5 accent-navy"
              />
            </label>
            {LABWORK_COLUMNS.map((col) => (
              <div
                key={String(col.key)}
                className={`px-2.5 py-2 ${col.hideOnPhone ? "hidden sm:block" : ""}`}
              >
                {col.label}
              </div>
            ))}
          </div>

          {visible.length === 0 && (
            <p className="px-3 py-8 text-center text-[12.5px] text-ink-2">
              {searching
                ? `「${query}」에 해당하는 줄이 없습니다.`
                : "아직 줄이 없습니다. 아래 「+ 줄 추가」를 누르거나, 엑셀에서 복사해 첫 칸에 붙여넣어 보세요."}
            </p>
          )}

          {visible.map((row, rowIndex) => {
            const picked = selected.has(row.id);
            return (
              <div
                key={row.id}
                className={`grid border-b border-hair text-[12.5px] last:border-b-0 ${
                  picked ? "bg-l-cal" : "hover:bg-l-cal"
                }`}
                style={{ gridTemplateColumns: template }}
              >
                <label className="flex cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={picked}
                    onChange={(e) => toggleSelected(row.id, e.target.checked)}
                    aria-label={`${rowIndex + 1}번째 줄 고르기`}
                    className="h-3.5 w-3.5 accent-navy"
                  />
                </label>

                {LABWORK_COLUMNS.map((col, colIndex) => {
                  // 내부시트의 기공소는 언제나 기공실이다. 열어 두면 실수로 바뀐다.
                  const locked = scope === "internal" && col.key === "lab";
                  const here = !locked && active?.row === rowIndex && active?.col === colIndex;
                  const busy = saving.has(`${row.id}:${String(col.key)}`);
                  const value = cellValue(row, col);
                  // 날짜는 짧게(9/8), 나머지는 있는 그대로. 빈 칸은 — 로 표시한다.
                  const shown =
                    col.kind === "date"
                      ? formatDate(typeof value === "string" ? value : null)
                      : value === null || value === undefined
                        ? ""
                        : String(value);

                  return (
                    <div
                      key={String(col.key)}
                      className={`relative border-r border-hair last:border-r-0 ${
                        col.hideOnPhone ? "hidden sm:block" : ""
                      } ${here ? "ring-2 ring-inset ring-navy" : ""}`}
                    >
                      {col.kind === "check" ? (
                        // 체크 칸도 Tab 으로 지나갈 수 있어야 한다.
                        // 빼놓으면 여기서 표 밖(주소창)으로 빠져나간다.
                        <label className="flex h-full cursor-pointer items-center justify-center py-1.5">
                          <input
                            ref={here ? inputRef : undefined}
                            type="checkbox"
                            checked={value === true}
                            onFocus={() => setActive({ row: rowIndex, col: colIndex })}
                            onChange={(e) =>
                              col.key === ARRIVED_CHECK_KEY
                                ? toggleArrived(row, e.target.checked)
                                : saveCell(row, col.key as keyof LabworkDraft, e.target.checked)
                            }
                            onKeyDown={(e) => handleKeyDown(e, { row: rowIndex, col: colIndex })}
                            aria-label={`${rowIndex + 1}번째 줄 ${col.label}`}
                            className={`h-3.5 w-3.5 ${
                              col.key === ARRIVED_CHECK_KEY
                                ? "accent-[color:var(--done)]"
                                : "accent-navy"
                            }`}
                          />
                        </label>
                      ) : here ? (
                        <input
                          ref={inputRef}
                          // 전부 text 로 둔다.
                          //   date 입력칸은 달력 위젯이라 "9/8" 을 칠 수가 없다 — 마우스로 골라야 한다.
                          //     지금 시트가 바로 그렇게 적혀 있어서, 그대로 칠 수 있어야 한다.
                          //   number 입력칸은 화살표·스크롤로 값이 바뀌어, 표를 훑어 내릴 때
                          //     조용히 숫자가 달라진다.
                          type="text"
                          inputMode={col.kind === "number" ? "numeric" : undefined}
                          placeholder={col.kind === "date" ? "9/8" : undefined}
                          defaultValue={typeof value === "string" ? value : ""}
                          onBlur={(e) => saveCell(row, col.key as keyof LabworkDraft, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, { row: rowIndex, col: colIndex })}
                          onPaste={(e) => handlePaste(e, { row: rowIndex, col: colIndex })}
                          aria-label={`${rowIndex + 1}번째 줄 ${col.label}`}
                          className="w-full bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => setActive({ row: rowIndex, col: colIndex })}
                          className={`w-full truncate px-2.5 py-1.5 text-left ${
                            locked ? "cursor-default text-ink-3" : "text-ink"
                          }`}
                        >
                          {shown || <span className="text-ink-3">—</span>}
                        </button>
                      )}
                      {busy && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute right-1 top-1 h-1 w-1 rounded-full bg-amber"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px]">
        <button
          type="button"
          disabled={searching}
          onClick={async () => {
            const made = await addRows([{}]);
            if (made.length > 0) setActive({ row: visible.length, col: 0 });
          }}
          className="border border-navy px-3 py-1.5 text-navy transition-colors hover:bg-navy hover:text-white disabled:cursor-not-allowed disabled:border-hair-2 disabled:text-ink-3 disabled:hover:bg-transparent"
        >
          + 줄 추가
        </button>
        <span className="text-ink-3">
          {searching
            ? "찾는 중에는 줄을 추가할 수 없습니다. 찾기를 지우고 눌러주세요."
            : "칸을 누르면 바로 입력 · Tab 다음 칸 · Enter 아래 칸 · 엑셀에서 복사해 붙여넣기 가능"}
        </span>
      </div>
    </div>
  );
}
