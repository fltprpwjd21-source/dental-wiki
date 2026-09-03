"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, type DocumentCategory } from "@/lib/categories";

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [DocumentCategory, string][];

export default function NewDocumentForm({
  initialCategory,
}: {
  initialCategory?: DocumentCategory;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<DocumentCategory>(
    initialCategory ?? CATEGORY_OPTIONS[0][0],
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, content }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "문서 등록에 실패했습니다.");
        return;
      }

      router.push(`/documents/${data.document.id}`);
    } catch {
      setError("등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="category" className="block text-sm text-gray-700">
          카테고리
        </label>
        <select
          id="category"
          value={category}
          onChange={(event) => setCategory(event.target.value as DocumentCategory)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {CATEGORY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="title" className="block text-sm text-gray-700">
          제목
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          required
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="content" className="block text-sm text-gray-700">
          본문
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={10}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          required
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {isSubmitting ? "등록 중..." : "등록"}
      </button>
    </form>
  );
}
