import Link from "next/link";
import { CATEGORY_LABELS, type DocumentCategory } from "@/lib/categories";

type RecentDoc = { id: string; title: string; category: DocumentCategory; updated_at: string };

// 층 5 — 가장 진한 종이. 읽는 자리다.
export default function RecentDocuments({ documents }: { documents: RecentDoc[] }) {
  if (documents.length === 0) return null;

  return (
    <section className="flex-1 border-t border-hair bg-l-doc">
      <div className="mx-auto max-w-6xl px-4 py-4 md:py-5">
        <h2 className="mb-2 font-display text-sm font-bold text-ink">최근 바뀐 문서</h2>
        <ul className="border-t border-hair-2 text-[12.5px]">
          {documents.map((doc) => (
            <li key={doc.id} className="border-b border-hair">
              <Link
                href={`/documents/${doc.id}`}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-3.5 gap-y-0.5 py-2.5 transition-colors hover:bg-white/70 sm:grid-cols-[110px_1fr_auto]"
              >
                <span className="col-span-2 text-[10.5px] tracking-wider text-ink-2 sm:col-span-1">
                  {CATEGORY_LABELS[doc.category]}
                </span>
                <span className="leading-snug text-ink">{doc.title}</span>
                <span className="font-mono text-[11px] text-ink-2">
                  {doc.updated_at.slice(5, 10)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
