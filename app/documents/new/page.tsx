import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import NewDocumentForm from "@/components/NewDocumentForm";
import { CATEGORY_LABELS, type DocumentCategory } from "@/lib/categories";

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS) as DocumentCategory[];

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { category } = await searchParams;
  const initialCategory = VALID_CATEGORIES.includes(category as DocumentCategory)
    ? (category as DocumentCategory)
    : undefined;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold">새 문서 등록</h1>
      <NewDocumentForm initialCategory={initialCategory} />
    </main>
  );
}
