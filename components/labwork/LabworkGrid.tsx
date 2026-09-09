"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LABWORK_COLUMNS, parsePastedGrid } from "@/lib/labwork/columns";
import { EMPTY_DRAFT, type LabworkDraft, type LabworkRecord } from "@/lib/labwork/types";
import { formatDate } from "@/lib/labwork/date";

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

export default function LabworkGrid({ initial }: { initial: LabworkRecord[] }) {
  const [rows, setRows] = useState<LabworkRecord[]>(initial);
  const [active, setActive] = useState<Cell | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const addRows = useCallback(async (drafts: Partial<LabworkDraft>[]) => {
    setError(null);
    try {
      const res = await fetch("/api/lab/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: drafts.map((d) => ({ ...EMPTY_DRAFT, ...d })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "줄을 추가하지 못했습니다.");
      setRows((prev) => [...prev, ...(data.items as LabworkRecord[])]);
      return data.items as LabworkRecord[];
    } catch (e) {
      setError(e instanceof Error ? e.message : "줄을 추가하지 못했습니다.");
      return [];
    }
  }, []);

  const removeRow = useCallback(async (row: LabworkRecord) => {
    if (!confirm("이 줄을 지울까요? 되돌릴 수 없습니다.")) return;
    const snapshot = rows;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    const res = await fetch(`/api/lab/items/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      setRows(snapshot);
      setError("지우지 못했습니다.");
    }
  }, [rows]);

  // 엑셀에서 복사한 덩어리를 지금 칸부터 채운다.
  // 이게 없으면 "엑셀 대신 쓸 수 있나"의 답이 그냥 아니오가 된다.
  const handlePaste = useCallback(
    async (event: React.ClipboardEvent, at: Cell) => {
      const text = event.clipboardData.getData("text/plain");
      if (!text.includes("\t") && !text.includes("\n")) return; // 한 칸짜리는 그냥 붙게 둔다
      event.preventDefault();

      const grid = parsePastedGrid(text);
      const needed = at.row + grid.length - rows.length;
      let target = rows;
      if (needed > 0) {
        const made = await addRows(Array.from({ length: needed }, () => ({})));
        if (made.length < needed) return;
        target = [...rows, ...made];
      }

      for (let r = 0; r < grid.length; r++) {
        const row = target[at.row + r];
        if (!row) break;
        for (let c = 0; c < grid[r].length; c++) {
          const column = LABWORK_COLUMNS[at.col + c];
          if (!column) break;
          const raw = grid[r][c].trim();
          const value = column.kind === "check" ? /^(o|y|예|v|true|1|도착)$/i.test(raw) : raw;
          await saveCell(row, column.key, value);
        }
      }
    },
    [rows, addRows, saveCell],
  );

  // 표 안에서 키보드로만 돌아다닐 수 있어야 한다. 손이 마우스로 가면 표가 아니다.
  //
  // 옮기기 전에 반드시 먼저 저장한다.
  //   칸을 옮기면 그 자리의 input 이 화면에서 사라지는데, 사라진 요소의 onBlur 는
  //   React 에서 불리지 않는다. 저장을 onBlur 에만 맡기면 Tab 으로 넘어갈 때마다
  //   방금 친 값이 조용히 버려진다 — 실제로 그렇게 동작했고 테스트에서 잡았다.
  const handleKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLInputElement>, at: Cell) => {
      const lastCol = LABWORK_COLUMNS.length - 1;
      const moving = event.key === "Tab" || event.key === "Enter";

      if (moving) {
        const column = LABWORK_COLUMNS[at.col];
        const row = rows[at.row];
        if (column && row) await saveCell(row, column.key, event.currentTarget.value);
      }

      if (event.key === "Tab") {
        event.preventDefault();
        const back = event.shiftKey;
        let { row, col } = at;
        col += back ? -1 : 1;
        if (col > lastCol) { col = 0; row += 1; }
        if (col < 0) { col = lastCol; row -= 1; }
        if (row < 0) return;
        if (row >= rows.length) {
          const made = await addRows([{}]);
          if (made.length === 0) return;
        }
        setActive({ row, col });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        // 마지막 줄에서 Enter 를 누르면 줄이 새로 생긴다 — 엑셀에서 하던 그대로다.
        if (at.row + 1 >= rows.length) {
          const made = await addRows([{}]);
          if (made.length === 0) return;
        }
        setActive({ row: at.row + 1, col: at.col });
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setActive(null);
      }
    },
    [rows, addRows, saveCell],
  );

  const template = useMemo(
    () => LABWORK_COLUMNS.map((c) => c.width).join(" ") + " 2.5rem",
    [],
  );

  return (
    <div className="mt-4">
      {error && (
        <p role="alert" className="mb-2 border-l-2 border-late bg-white px-3 py-2 text-[12px] text-late">
          {error}
        </p>
      )}

      <div className="overflow-x-auto border border-hair-2 bg-white">
        <div className="min-w-[38rem]">
          {/* 머리줄 */}
          <div
            className="grid border-b border-hair-2 bg-l-form text-[11px] font-medium text-ink-2"
            style={{ gridTemplateColumns: template }}
          >
            {LABWORK_COLUMNS.map((col) => (
              <div
                key={String(col.key)}
                className={`px-2.5 py-2 ${col.hideOnPhone ? "hidden sm:block" : ""}`}
              >
                {col.label}
              </div>
            ))}
            <div className="px-2 py-2" aria-hidden />
          </div>

          {rows.length === 0 && (
            <p className="px-3 py-8 text-center text-[12.5px] text-ink-2">
              아직 줄이 없습니다. 아래 「+ 줄 추가」를 누르거나, 엑셀에서 복사해 첫 칸에 붙여넣어 보세요.
            </p>
          )}

          {rows.map((row, rowIndex) => (
            <div
              key={row.id}
              className="group grid border-b border-hair text-[12.5px] last:border-b-0 hover:bg-l-cal"
              style={{ gridTemplateColumns: template }}
            >
              {LABWORK_COLUMNS.map((col, colIndex) => {
                const here = active?.row === rowIndex && active?.col === colIndex;
                const busy = saving.has(`${row.id}:${String(col.key)}`);
                const value = row[col.key];
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
                      <label className="flex h-full cursor-pointer items-center justify-center py-1.5">
                        <input
                          type="checkbox"
                          checked={value === true}
                          onChange={(e) => saveCell(row, col.key, e.target.checked)}
                          aria-label={`${rowIndex + 1}번째 줄 ${col.label}`}
                          className="h-3.5 w-3.5 accent-[color:var(--done)]"
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
                        onBlur={(e) => saveCell(row, col.key, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, { row: rowIndex, col: colIndex })}
                        onPaste={(e) => handlePaste(e, { row: rowIndex, col: colIndex })}
                        aria-label={`${rowIndex + 1}번째 줄 ${col.label}`}
                        className="w-full bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActive({ row: rowIndex, col: colIndex })}
                        className="w-full truncate px-2.5 py-1.5 text-left text-ink"
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

              <button
                type="button"
                onClick={() => removeRow(row)}
                aria-label={`${rowIndex + 1}번째 줄 지우기`}
                className="px-2 text-[13px] text-ink-3 opacity-0 transition-opacity hover:text-late group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px]">
        <button
          type="button"
          onClick={async () => {
            const made = await addRows([{}]);
            if (made.length > 0) setActive({ row: rows.length, col: 0 });
          }}
          className="border border-navy px-3 py-1.5 text-navy transition-colors hover:bg-navy hover:text-white"
        >
          + 줄 추가
        </button>
        <span className="text-ink-3">
          칸을 누르면 바로 입력 · Tab 다음 칸 · Enter 아래 칸 · 엑셀에서 복사해 붙여넣기 가능
        </span>
        <span className="ml-auto font-mono tabular-nums text-ink-3">{rows.length}줄</span>
      </div>
    </div>
  );
}
