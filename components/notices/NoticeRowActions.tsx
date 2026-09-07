"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// 수정·삭제. 화면에서 숨기는 것만으로는 부족해서 서버에서도 작성자·관리자를 다시 확인한다.
export default function NoticeRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("이 공지를 삭제할까요?\n\n휴지통으로 옮겨지고 30일 뒤 완전히 지워집니다.")) {
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/notices/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "삭제에 실패했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setError("삭제 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap text-[11px]">
      {error && <span role="alert" className="text-late">{error}</span>}
      <Link href={`/notices/${id}/edit`} className="border-b border-meet-d/30 text-meet-d hover:border-meet-d">
        수정
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="border-b border-late/30 text-late hover:border-late disabled:opacity-50"
      >
        {isDeleting ? "삭제 중…" : "삭제"}
      </button>
    </span>
  );
}
