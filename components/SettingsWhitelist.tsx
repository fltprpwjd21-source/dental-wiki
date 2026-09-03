"use client";

import { useState, type FormEvent } from "react";

type Employee = {
  employee_id: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
};

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
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);

  function upsertRow(employee: Employee) {
    setWhitelist((prev) => {
      const exists = prev.some((row) => row.employee_id === employee.employee_id);
      return exists
        ? prev.map((row) => (row.employee_id === employee.employee_id ? employee : row))
        : [...prev, employee];
    });
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
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

      upsertRow(data.employee);
      if (data.reactivated) {
        setNotice(`${data.employee.employee_id}는 이전에 비활성화된 계정이라 다시 활성화했습니다.`);
      }
      setEmployeeId("");
      setIsAdminChecked(false);
    } catch {
      setError("등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // 물리 삭제가 아니라 비활성화다. 문서·로그의 "누가 작성·수정했는지"를 보존해야 하고
  // (PRD 5번②), 외래키 때문에 삭제 자체도 불가능하다.
  async function handleToggleActive(targetId: string, nextActive: boolean) {
    setError(null);
    setNotice(null);
    setChangingId(targetId);

    try {
      const response = await fetch(`/api/settings/whitelist/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "변경에 실패했습니다.");
        return;
      }

      upsertRow(data.employee);
    } catch {
      setError("변경 중 오류가 발생했습니다.");
    } finally {
      setChangingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="py-2">사원번호</th>
            <th className="py-2">관리자 여부</th>
            <th className="py-2">상태</th>
            <th className="py-2">등록일</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {whitelist.map((employee) => (
            <tr
              key={employee.employee_id}
              className={`border-b border-gray-100 ${employee.is_active ? "" : "text-gray-400"}`}
            >
              <td className="py-2">{employee.employee_id}</td>
              <td className="py-2">{employee.is_admin ? "관리자" : "일반"}</td>
              <td className="py-2">
                {employee.is_active ? (
                  "활성"
                ) : (
                  <span className="text-red-600">비활성 (로그인 차단)</span>
                )}
              </td>
              <td className="py-2 text-gray-500">
                {new Date(employee.created_at).toLocaleDateString("ko-KR")}
              </td>
              <td className="py-2 text-right">
                {employee.employee_id === currentEmployeeId ? (
                  <span className="text-xs text-gray-400">본인</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleToggleActive(employee.employee_id, !employee.is_active)}
                    disabled={changingId !== null}
                    className={`text-xs underline disabled:opacity-50 ${
                      employee.is_active ? "text-red-600" : "text-brand"
                    }`}
                  >
                    {changingId === employee.employee_id
                      ? "변경 중..."
                      : employee.is_active
                        ? "비활성화"
                        : "다시 활성화"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-gray-500">
        계정은 완전히 삭제되지 않습니다. 비활성화하면 즉시 로그인이 차단되고, 이미 로그인해
        있던 세션도 바로 끊깁니다. 문서·수정 로그에 남은 작성자 기록은 그대로 보존됩니다.
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

      {notice && <p className="text-sm text-brand">{notice}</p>}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
