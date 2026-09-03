import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS, type DocumentCategory } from "@/lib/categories";

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS) as DocumentCategory[];

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { category } = await params;
  if (!VALID_CATEGORIES.includes(category as DocumentCategory)) {
    notFound();
  }
  const activeCategory = category as DocumentCategory;

  const supabase = getServerSupabaseClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, updated_at")
    .eq("category", activeCategory)
    .order("updated_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <nav className="mb-6 flex gap-2 border-b border-gray-200">
        {VALID_CATEGORIES.map((value) => (
          <Link
            key={value}
            href={`/categories/${value}`}
            className={
              value === activeCategory
                ? "border-b-2 border-brand px-3 py-2 text-sm font-medium text-brand"
                : "px-3 py-2 text-sm text-gray-500 hover:text-brand"
            }
          >
            {CATEGORY_LABELS[value]}
          </Link>
        ))}
      </nav>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-brand">{CATEGORY_LABELS[activeCategory]}</h1>
        <Link
          href={`/documents/new?category=${activeCategory}`}
          className="rounded border border-brand px-3 py-1.5 text-sm text-brand hover:bg-surface"
        >
          + 새 문서 만들기
        </Link>
      </div>

      {documents && documents.length === 0 && (
        <p className="text-sm text-gray-500">등록된 문서가 없습니다.</p>
      )}

      <ul className="space-y-2">
        {documents?.map((doc) => (
          <li key={doc.id}>
            <Link
              href={`/documents/${doc.id}`}
              className="block rounded border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50"
            >
              {doc.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
