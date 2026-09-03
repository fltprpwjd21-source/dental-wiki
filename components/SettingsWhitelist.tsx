"use client";

import { useState, type FormEvent } from "react";

type Employee = { employee_id: string; is_admin: boolean; created_at: string };

export default function SettingsWhitelist({
  initialWhitelist,
  currentEmployeeId,
}: {
  initialWhitelist: Employee[];
  currentEmployeeId: string;
}) {
  const [whitelist, setWhitelist] = useState(initialWhitelist);
  const [employeeId, setEmployeeId] = useState("");
  const [isAdminChecked, setIsAdminChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/settings/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, isAdmin: isAdminChecked }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }

      setWhitelist((prev) => [...prev, data.employee]);
      setEmployeeId("");
      setIsAdminChecked(false);
    } catch {
      setError("등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // 계정을 지워도 문서·로그에 남은 작성자·수정자 기록은 그대로 보존된다.
  // (created_by / edited_by는 화이트리스트를 참조하지 않는 스냅샷이다)
  async function handleDelete(targetId: string) {
    if (!window.confirm(`사원번호 ${targetId}를 삭제할까요?\n\n로그인이 즉시 차단됩니다. 문서와 수정 로그에 남은 기록은 그대로 보존됩니다.`)) {
      return;
    }

    setError(null);
    setDeletingId(targetId);

    try {
      const response = await fetch(`/api/settings/whitelist/${targetId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "삭제에 실패했습니다.");
        return;
      }

      setWhitelist((prev) => prev.filter((employee) => employee.employee_id !== targetId));
    } catch {
      setError("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="py-2">사원번호</th>
            <th className="py-2">관리자 여부</th>
            <th className="py-2">등록일</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {whitelist.map((employee) => (
            <tr key={employee.employee_id} className="border-b border-gray-100">
              <td className="py-2">{employee.employee_id}</td>
              <td className="py-2">{employee.is_admin ? "관리자" : "일반"}</td>
              <td className="py-2 text-gray-500">
                {new Date(employee.created_at).toLocaleDateString("ko-KR")}
              </td>
              <td className="py-2 text-right">
                {employee.employee_id === currentEmployeeId ? (
                  <span className="text-xs text-gray-400">본인</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDelete(employee.employee_id)}
                    disabled={deletingId !== null}
                    className="text-xs text-red-600 underline disabled:opacity-50"
                  >
                    {deletingId === employee.employee_id ? "삭제 중..." : "삭제"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-gray-500">
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
            사원번호 추가
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
        <label className="flex items-center gap-1 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isAdminChecked}
            onChange={(event) => setIsAdminChecked(event.target.checked)}
          />
          관리자로 등록
        </label>
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
