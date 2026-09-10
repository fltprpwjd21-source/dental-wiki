"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LABWORK_COLUMNS, parsePastedGrid, type LabworkColumn } from "@/lib/labwork/columns";
import { formatDate } from "@/lib/labwork/date";
import { sortLabwork } from "@/lib/labwork/sort";
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

// 되돌릴 수 있는 일 한 건.
//
// 브라우저의 Ctrl+Z 는 「입력칸 안에서 방금 친 글자」까지만 되돌린다.
// 칸을 벗어나 저장된 값, 체크 표시, 지운 줄은 브라우저가 모른다. 그래서 직접 기록한다.
//
// 지운 줄을 되살릴 때는 내용만 같은 새 줄로 다시 넣는다(id 가 달라진다).
// 지운 것을 그대로 되살리려면 지우지 않고 숨기는 구조여야 하는데,
// 시제품에 그걸 두면 "지웠는데 왜 남아 있냐"가 또 다른 질문이 된다.
type UndoEntry =
  | { kind: "cell"; label: string; rowId: string; key: keyof LabworkDraft; before: string | boolean }
  | { kind: "add"; label: string; ids: string[] }
  | { kind: "delete"; label: string; rows: LabworkRecord[] };

const UNDO_LIMIT = 30;

// 무엇으로 찾을지. 깔때기 버튼에서 켜고 끈다.
//
// 날짜는 세 칸(의뢰·예정일·도착일)을 한 항목으로 묶었다. 사람은 "9/15 짜리"를 찾지
// "예정일이 9/15 인 것"을 찾지 않는다. 셋을 따로 두면 매번 어느 날짜인지 고르게 된다.
//
// 기본으로 켜 두는 것은 환자명·등록번호·보철물 셋이다.
//   날짜와 치식을 처음부터 켜 두면 "9" 한 글자에 거의 모든 줄이 걸려 찾기가 무의미해진다.
type SearchFieldKey = "patient_name" | "patient_chart_no" | "kind" | "doctor" | "tooth" | "dates";

const SEARCH_FIELDS: { key: SearchFieldKey; label: string; on: boolean }[] = [
  { key: "patient_name", label: "환자명", on: true },
  { key: "patient_chart_no", label: "등록번호", on: true },
  { key: "kind", label: "보철물", on: true },
  { key: "doctor", label: "의사", on: false },
  { key: "tooth", label: "치식(번호)", on: false },
  { key: "dates", label: "날짜", on: false },
];

const DATE_KEYS: (keyof LabworkDraft)[] = ["ordered_on", "due_on", "arrived_on"];

// 오늘 날짜. toISOString() 은 UTC 라 한국 시간 오전 9시 전에는 하루 전이 나온다.
function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function matches(row: LabworkRecord, query: string, fields: Set<SearchFieldKey>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hit = (v: unknown) => String(v ?? "").toLowerCase().includes(q);

  for (const field of fields) {
    if (field === "dates") {
      // 원본(2026-09-15)과 화면에 보이는 모양(9/15) 둘 다에서 찾는다.
      // 보이는 대로 "9/15" 를 쳤는데 안 걸리면 고장으로 느껴진다.
      if (DATE_KEYS.some((k) => hit(row[k]) || hit(formatDate(row[k] as string | null)))) return true;
    } else if (hit(row[field])) return true;
  }
  return false;
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
  const [fields, setFields] = useState<Set<SearchFieldKey>>(
    () => new Set(SEARCH_FIELDS.filter((f) => f.on).map((f) => f.key)),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  // 방금 자리를 옮긴 줄. 옮겨간 곳에서 잠깐 표시해 눈이 따라가게 한다.
  //   체크하면 그 줄이 곧바로 아래로 내려가는데, 아무 표시가 없으면
  //   "방금 누른 게 어디 갔지" 하고 찾게 된다.
  const [moved, setMoved] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // 찾는 중에는 보이는 줄만 다룬다. 아래 모든 자리(그리기·키보드 이동·붙여넣기)가
  // 이 목록 하나를 본다 — 원래 목록과 섞어 쓰면 3번째 줄이 서로 다른 줄을 가리킨다.
  // 줄 세우기는 규칙에서 바로 나온다 — 따로 들고 있는 순서가 없다.
  //   체크하면 그 줄이 곧바로 제자리로 내려간다. 「다시 정렬」 같은 버튼을 두면
  //   누르기 전까지 화면이 규칙과 다른 상태로 남고, 대부분의 시간을 그 상태로 보게 된다.
  //   규칙은 lib/labwork/sort.ts 에 있다 (안 온 것 위 · 의뢰일 순 / 끝난 것은 도착한 순).
  const visible = useMemo(
    () => sortLabwork(rows).filter((r) => matches(r, query, fields)),
    [rows, query, fields],
  );
  const searching = query.trim().length > 0;

  // 고른 칸으로 실제 커서를 옮긴다. 표에서는 "지금 어디에 치고 있는지"가 보여야 한다.
  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  // 세부검색을 열어 두고 딴 데를 누르면 닫는다.
  //   열어 둔 채로 표를 만지면 그 창이 칸을 가린다. 스스로 닫히지 않는 창은
  //   "닫는 방법을 찾는" 일을 사람에게 떠넘기는 것이다.
  //   Esc 로도 닫는다 — 창을 닫는 가장 흔한 손버릇이다.
  useEffect(() => {
    if (!filterOpen) return;
    function onDown(e: MouseEvent) {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [filterOpen]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    setUndoStack((prev) => [...prev, entry].slice(-UNDO_LIMIT));
  }, []);

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
    async (
      row: LabworkRecord,
      key: keyof LabworkDraft,
      value: string | boolean,
      opts?: { undoable?: boolean; label?: string },
    ) => {
      const before = row[key];
      if (before === value) return;

      if (opts?.undoable !== false) {
        pushUndo({
          kind: "cell",
          label: opts?.label ?? "칸 수정",
          rowId: row.id,
          key,
          before: (before ?? "") as string | boolean,
        });
      }

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
    [markSaving, pushUndo],
  );

  // 「도착」 체크는 도착일을 보는 창일 뿐이다. 체크하면 오늘, 풀면 빈 값.
  //
  // 체크하는 순간 그 줄이 자리를 옮긴다. 아무 표시가 없으면 "방금 누른 게 어디 갔지"가 되므로,
  // 옮겨간 자리에서 잠깐 테두리를 남겨 눈이 따라가게 한다.
  const toggleArrived = useCallback(
    (row: LabworkRecord, on: boolean) => {
      setMoved(row.id);
      window.setTimeout(() => setMoved((cur) => (cur === row.id ? null : cur)), 1400);
      return saveCell(row, "arrived_on", on ? todayIso() : "", {
        label: on ? "도착 체크" : "도착 해제",
      });
    },
    [saveCell],
  );

  // 새 줄이 어디에 놓일지는 정렬 규칙이 정한다.
  //   의뢰일이 빈 줄은 맨 위로 가므로(sort.ts), 방금 만든 줄이 바로 눈앞에 온다.
  //   의뢰일을 적는 순간 제자리로 내려간다.
  const addRows = useCallback(
    async (drafts: Partial<LabworkDraft>[], opts?: { undoable?: boolean }) => {
      setError(null);
      try {
        const res = await fetch("/api/lab/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, rows: drafts }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "줄을 추가하지 못했습니다.");
        const made = data.items as LabworkRecord[];
        setRows((prev) => [...prev, ...made]);
        if (opts?.undoable !== false && made.length > 0) {
          pushUndo({ kind: "add", label: `줄 추가 ${made.length}개`, ids: made.map((r) => r.id) });
        }
        return made;
      } catch (e) {
        setError(e instanceof Error ? e.message : "줄을 추가하지 못했습니다.");
        return [];
      }
    },
    [scope, pushUndo],
  );

  // 고른 줄을 한 번에 지운다. 한 줄씩 스무 번 보내면 중간에 하나가 실패했을 때
  // 화면과 DB 가 어긋난다.
  const removeSelected = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`${ids.length}줄을 지울까요? 되돌릴 수 없습니다.`)) return;

    const snapshot = rows;
    const gone = rows.filter((r) => selected.has(r.id));
    setRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    setActive(null);
    pushUndo({ kind: "delete", label: `줄 삭제 ${gone.length}개`, rows: gone });

    const res = await fetch("/api/lab/items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      setRows(snapshot);
      setError("지우지 못했습니다.");
    }
  }, [selected, rows, pushUndo]);

  // 마지막 한 건을 되돌린다.
  //   되돌리는 동안에는 기록을 새로 남기지 않는다(undoable: false).
  //   안 그러면 되돌리기가 또 되돌릴 거리를 만들어 스택이 끝나지 않는다.
  const undo = useCallback(async () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setError(null);

    if (entry.kind === "cell") {
      const row = rows.find((r) => r.id === entry.rowId);
      if (!row) return;
      await saveCell(row, entry.key, entry.before, { undoable: false });
      setMoved(row.id);
      window.setTimeout(() => setMoved((cur) => (cur === row.id ? null : cur)), 1400);
      return;
    }

    if (entry.kind === "add") {
      setRows((prev) => prev.filter((r) => !entry.ids.includes(r.id)));
      await fetch("/api/lab/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: entry.ids }),
      });
      return;
    }

    // 지운 줄 되살리기 — 내용만 같은 새 줄로 다시 넣는다(id 는 새로 받는다).
    const drafts = entry.rows.map((r) => ({
      lab: r.lab,
      patient_chart_no: r.patient_chart_no,
      ordered_on: r.ordered_on,
      patient_name: r.patient_name,
      doctor: r.doctor,
      kind: r.kind,
      tooth: r.tooth,
      tooth_count: r.tooth_count,
      ab_count: r.ab_count,
      due_on: r.due_on,
      note: r.note,
      arrived_on: r.arrived_on,
      oral_scan: r.oral_scan,
    }));
    await addRows(drafts, { undoable: false });
  }, [undoStack, rows, saveCell, addRows]);

  // Ctrl+Z(맥은 Cmd+Z)도 받는다.
  //
  // 표의 칸을 편집하는 중일 때만 브라우저에 양보한다 —
  // 그때는 "방금 친 글자"를 되돌리는 게 사람이 기대하는 동작이기 때문이다.
  //   글자 입력칸이면 전부 양보하게 두면, 검색칸에 커서가 있을 때 Ctrl+Z 가 아무 일도
  //   안 한다. 검색어는 데이터가 아니라 되돌릴 거리도 아니다 — 실제로 그렇게 동작했다.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.key === "z" && (e.metaKey || e.ctrlKey)) || e.shiftKey) return;
      if ((document.activeElement as HTMLElement | null)?.dataset?.cellInput === "1") return;
      e.preventDefault();
      void undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

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

  // 기본값과 다르게 골라 뒀는지. 다르면 깔때기를 켜진 모양으로 둔다 —
  // 찾아도 안 나올 때 "왜 안 나오지"의 답이 이 버튼에 있어야 한다.
  const narrowed =
    fields.size !== SEARCH_FIELDS.filter((f) => f.on).length ||
    SEARCH_FIELDS.some((f) => f.on !== fields.has(f.key));

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
            placeholder={SEARCH_FIELDS.filter((f) => fields.has(f.key))
              .map((f) => f.label)
              .join(" · ") || "찾을 항목을 골라주세요"}
            aria-label="찾기"
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

        {/* 세부검색 — 어느 칸에서 찾을지 고른다.
            항목을 검색칸 옆에 늘어놓으면 표보다 자리를 더 차지하므로 깔때기 안에 접어 둔다. */}
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
            aria-label="세부검색"
            className={`flex items-center gap-1.5 border px-2.5 py-1.5 text-[11.5px] transition-colors ${
              filterOpen || narrowed
                ? "border-navy bg-navy text-white"
                : "border-hair-2 bg-white text-ink-2 hover:border-navy hover:text-navy"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M1 2h12L8.4 7.3v4.3L5.6 13V7.3L1 2z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
            세부검색
            {narrowed && <span className="font-mono tabular-nums">{fields.size}</span>}
          </button>

          {filterOpen && (
            <div className="absolute right-0 z-10 mt-1 w-44 border border-hair-2 bg-white p-2 shadow-[0_8px_20px_-8px_rgba(12,28,64,.35)]">
              <p className="px-1 pb-1.5 text-[10.5px] text-ink-3">이 칸에서 찾습니다</p>
              {SEARCH_FIELDS.map((f) => (
                <label
                  key={f.key}
                  className="flex cursor-pointer items-center gap-2 px-1 py-1 text-[12px] text-ink hover:bg-l-cal"
                >
                  <input
                    type="checkbox"
                    checked={fields.has(f.key)}
                    onChange={(e) =>
                      setFields((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(f.key);
                        else next.delete(f.key);
                        return next;
                      })
                    }
                    className="h-3.5 w-3.5 accent-navy"
                  />
                  {f.label}
                </label>
              ))}
              <button
                type="button"
                onClick={() => setFields(new Set(SEARCH_FIELDS.map((f) => f.key)))}
                className="mt-1 w-full border-t border-hair px-1 pt-1.5 text-left text-[11px] text-meet-d hover:text-navy"
              >
                모두 켜기
              </button>
            </div>
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

      {/* 버튼을 표 위에 둔다.
          안 온 기공물이 위에 모이는 화면이라 손이 가는 곳도 위다.
          아래에 두면 새 줄을 만들 때마다 스무 줄을 지나 내려갔다 올라와야 한다. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[11.5px]">
        <button
          type="button"
          disabled={searching}
          onClick={async () => {
            const made = await addRows([{}]);
            if (made.length > 0) setActive({ row: 0, col: 0 });
          }}
          className="border border-navy px-3 py-1.5 text-navy transition-colors hover:bg-navy hover:text-white disabled:cursor-not-allowed disabled:border-hair-2 disabled:text-ink-3 disabled:hover:bg-transparent"
        >
          + 줄 추가
        </button>

        <span className="text-ink-3">
          {searching
            ? "찾는 중에는 줄을 추가할 수 없습니다. 찾기를 지우고 눌러주세요."
            : "안 온 것이 위(의뢰일 순) · 도착 체크하면 아래로 내려갑니다 · Tab 다음 칸 · Enter 아래 칸"}
        </span>

        {/* 되돌리기는 줄 추가와 같은 줄 오른쪽 끝에 둔다.
            Ctrl+Z 로도 되지만, 되는지 몰라서 안 쓰는 기능은 없는 것과 같다. */}
        <button
          type="button"
          onClick={undo}
          disabled={undoStack.length === 0}
          title={
            undoStack.length > 0
              ? `되돌리기: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)`
              : "되돌릴 것이 없습니다"
          }
          className="ml-auto flex items-center gap-1.5 border border-hair-2 px-3 py-1.5 text-ink-2 transition-colors hover:border-navy hover:text-navy disabled:cursor-not-allowed disabled:border-hair disabled:text-ink-3 disabled:hover:border-hair"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M4.2 3.2L1.6 5.8l2.6 2.6M1.9 5.8h6.4a3.8 3.8 0 010 7.6H4.6"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          되돌리기
          {undoStack.length > 0 && (
            <span className="font-mono text-[10.5px] tabular-nums text-ink-3">
              {undoStack.length}
            </span>
          )}
        </button>
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
            // 안 온 것과 끝난 것 사이에 얇은 선을 하나 긋는다.
            //   색만으로도 갈리지만, 훑어 내릴 때 "여기부터는 끝난 것"이 어디서 시작하는지
            //   눈이 한 번에 잡히지 않는다. 경계는 선 하나가 제일 빠르다.
            const startsDone =
              Boolean(row.arrived_on) && !visible[rowIndex - 1]?.arrived_on && rowIndex > 0;
            // 도착이 끝난 줄은 아주 연한 하늘색으로 눕는다. 훑어 내릴 때 한눈에 갈린다.
            // 고른 줄은 그보다 세게 표시해야 하므로 고르기가 이긴다.
            const done = Boolean(row.arrived_on);
            return (
              <div
                key={row.id}
                className={`grid border-b border-hair text-[12.5px] last:border-b-0 ${
                  picked ? "bg-l-cal" : done ? "bg-l-done hover:bg-l-cal" : "hover:bg-l-cal"
                } ${startsDone ? "border-t border-t-hair-2" : ""} ${
                  moved === row.id ? "ring-1 ring-inset ring-sched" : ""
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
                          // 날짜는 보이던 모양(9/7) 그대로 연다.
                          //   원본(2026-09-07)을 넣으면 칸보다 길어 잘리고,
                          //   방금까지 보던 글자와 달라 고치는 사람이 흠칫한다.
                          //   이 글자는 그대로 다시 읽힌다(date.ts 왕복 규칙).
                          defaultValue={col.kind === "date" ? shown : typeof value === "string" ? value : ""}
                          onBlur={(e) => {
                            saveCell(row, col.key as keyof LabworkDraft, e.target.value);
                            // 딴 데를 누르면 칸을 닫는다. 안 닫으면 편집칸이 열린 채로 남아
                            // 원본 글자가 잘린 상태로 보인다.
                            setActive((cur) =>
                              cur?.row === rowIndex && cur?.col === colIndex ? null : cur,
                            );
                          }}
                          onKeyDown={(e) => handleKeyDown(e, { row: rowIndex, col: colIndex })}
                          onPaste={(e) => handlePaste(e, { row: rowIndex, col: colIndex })}
                          aria-label={`${rowIndex + 1}번째 줄 ${col.label}`}
                          // 편집 중인 칸에서는 Ctrl+Z 를 브라우저에 넘긴다 (위 useEffect 참고)
                          data-cell-input="1"
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

    </div>
  );
}
