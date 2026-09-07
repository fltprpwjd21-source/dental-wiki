"use client";

import { useState, type FormEvent } from "react";

type Employee = {
  employee_id: string;
  name: string | null;
  is_admin: boolean;
  created_at: string;
};

// 목록 칸은 사원번호·이름·등록일이다.
//   예전에는 "관리자 여부" 칸이 있었지만, 사원번호만 보고 누구인지 알 수 없다는 게 훨씬
//   큰 문제였다(퇴사자를 지우려 해도 어느 줄인지 모른다). 관리자는 이제 00001 하나로
//   고정이라 칸을 따로 둘 만큼 정보가 되지도 않는다 — 그 계정에만 작은 표시를 붙인다.
export default function SettingsWhitelist({
  initialWhitelist,
  currentEmployeeId,
}: {
  initialWhitelist: Employee[];
  currentEmployeeId: string;
}) {
  const [whitelist, setWhitelist] = useState(initialWhitelist);
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 삭제 확인을 기다리는 줄. 한 번 더 눌러야 실제로 지운다(window.confirm 대체).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // 이름을 고치는 중인 줄과 입력값. 한 번에 한 줄만 고칠 수 있다.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/settings/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, name }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }

      setWhitelist((prev) => [...prev, data.employee]);
      setEmployeeId("");
      setName("");
    } catch {
      setError("등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(employee: Employee) {
    setError(null);
    setEditingId(employee.employee_id);
    setEditingName(employee.name ?? "");
  }

  async function handleSaveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;

    const trimmed = editingName.trim();
    if (!trimmed) {
      setError("이름을 입력해주세요.");
      return;
    }

    setError(null);
    setIsSavingName(true);

    try {
      const response = await fetch(`/api/settings/whitelist/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "이름 변경에 실패했습니다.");
        return;
      }

      setWhitelist((prev) =>
        prev.map((employee) =>
          employee.employee_id === editingId ? { ...employee, name: data.employee.name } : employee,
        ),
      );
      setEditingId(null);
    } catch {
      setError("이름 변경 중 오류가 발생했습니다.");
    } finally {
      setIsSavingName(false);
    }
  }

  // 계정을 지워도 문서·로그에 남은 작성자·수정자 기록은 그대로 보존된다.
  // (created_by / edited_by는 화이트리스트를 참조하지 않는 스냅샷이다)
  //
  // 확인은 window.confirm() 이 아니라 화면 안 2단계 버튼으로 받는다.
  //   실제 배포 환경(병원 업무용 브라우저)에서 네이티브 다이얼로그가 예외를 던지며
  //   조용히 실패하는 것이 확인됐다. confirm() 이 막히면 false 가 아니라 예외가 나므로
  //   이 함수가 그대로 끊기고, 관리자는 "삭제 버튼이 안 먹는다"만 겪게 된다.
  //   노트 쪽(components/notes/NoteEditor.tsx)은 같은 이유로 이미 2단계 버튼을 쓴다.
  async function handleDelete(target: Employee) {
    setConfirmingId(null);
    setError(null);
    setDeletingId(target.employee_id);

    try {
      const response = await fetch(`/api/settings/whitelist/${target.employee_id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "삭제에 실패했습니다.");
        return;
      }

      setWhitelist((prev) => prev.filter((employee) => employee.employee_id !== target.employee_id));
    } catch {
      setError("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* 사원번호나 날짜가 길어져도 페이지 전체가 옆으로 밀리지 않게, 표만 스크롤되게 감싼다 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="py-2">사원번호</th>
              <th className="py-2">이름</th>
              <th className="py-2">등록일</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {whitelist.map((employee) => (
              <tr key={employee.employee_id} className="border-b border-gray-100">
                <td className="py-2">
                  {employee.employee_id}
                  {employee.is_admin && (
                    <span className="ml-1.5 rounded bg-surface px-1.5 py-0.5 text-[0.65rem] text-gray-500">
                      관리자
                    </span>
                  )}
                </td>
                <td className="py-2">
                  {editingId === employee.employee_id ? (
                    <form onSubmit={handleSaveName} className="flex items-center gap-1">
                      <label htmlFor={`name-${employee.employee_id}`} className="sr-only">
                        {employee.employee_id} 이름
                      </label>
                      <input
                        id={`name-${employee.employee_id}`}
                        type="text"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        autoFocus
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={isSavingName}
                        className="text-xs text-brand underline disabled:opacity-50"
                      >
                        {isSavingName ? "저장 중..." : "저장"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-400 underline"
                      >
                        취소
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing(employee)}
                      className="rounded text-left underline decoration-gray-300 underline-offset-2 hover:decoration-gray-500"
                    >
                      {employee.name ?? <span className="text-gray-400">이름 입력</span>}
                    </button>
                  )}
                </td>
                <td className="py-2 text-gray-500">
                  {new Date(employee.created_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="py-2 text-right">
                  {employee.employee_id === currentEmployeeId ? (
                    <span className="text-xs text-gray-400">본인</span>
                  ) : employee.is_admin ? (
                    <span className="text-xs text-gray-400">삭제 불가</span>
                  ) : confirmingId === employee.employee_id ? (
                    <span className="flex items-center justify-end gap-2">
                      <span className="text-xs text-gray-500">정말 지울까요?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(employee)}
                        disabled={deletingId !== null}
                        className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingId === employee.employee_id ? "삭제 중..." : "삭제"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="text-xs text-gray-400 underline"
                      >
                        취소
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setConfirmingId(employee.employee_id);
                      }}
                      disabled={deletingId !== null}
                      className="text-xs text-red-600 underline disabled:opacity-50"
                    >
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        여기서 등록한 계정은 모두 같은 권한입니다. 관리(사원번호 등록·삭제, 지식 지도)는
        관리자 계정으로만 할 수 있고, 화면에서는 관리자 권한을 새로 줄 수 없습니다.
        <br />
        삭제하면 그 사원번호로는 즉시 로그인할 수 없고, 이미 로그인해 있던 세션도 바로
        끊깁니다. 문서와 수정 로그에 남은 &quot;누가 작성·수정했는지&quot; 기록은 그대로
        보존됩니다.
      </p>

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4"
      >
        <div className="space-y-1">
          <label htmlFor="employeeId" className="block text-xs text-gray-500">
            사원번호
          </label>
          <input
            id="employeeId"
            type="text"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="employeeName" className="block text-xs text-gray-500">
            이름
          </label>
          <input
            id="employeeName"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {isSubmitting ? "등록 중..." : "추가"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
