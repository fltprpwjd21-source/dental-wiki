import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS, type DocumentCategory } from "@/lib/categories";
import { isRecentlyUpdated, makeSummary } from "@/lib/notices";

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS) as DocumentCategory[];

// 세 탭(인수인계·수가·비보험·내규)이 같은 화면 한 벌을 쓴다. 제목만 바뀐다.
const CATEGORY_SUB: Record<DocumentCategory, string> = {
  handover: "진료과별 업무 인수인계",
  insurance: "보험 산정기준과 비보험 항목 단가",
  policy: "병원 내규와 운영회칙",
};

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { category } = await params;
  if (!VALID_CATEGORIES.includes(category as DocumentCategory)) notFound();
  const activeCategory = category as DocumentCategory;

  const supabase = getServerSupabaseClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, content, updated_at")
    .eq("category", activeCategory)
    .order("updated_at", { ascending: false });

  return (
    <main className="flex-1 bg-l-card">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex flex-wrap items-end gap-2.5 pb-3">
          <h1 className="font-display text-[23px] font-extrabold leading-tight tracking-tight text-ink">
            {CATEGORY_LABELS[activeCategory]}
          </h1>
          <span className="mb-0.5 text-[11px] text-ink-2">{CATEGORY_SUB[activeCategory]}</span>
          <Link
            href={`/documents/new?category=${activeCategory}`}
            className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap bg-navy px-4 py-2 text-[11.5px] font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-9px_rgba(12,28,64,.65)]"
          >
            <span aria-hidden className="text-[13px] leading-none">+</span> 문서 작성
          </Link>
        </div>

        <p className="pb-3 font-mono text-[10.5px] text-ink-3">문서 {documents?.length ?? 0}</p>

        {documents && documents.length === 0 ? (
          <p className="border-t border-hair-2 py-6 text-sm text-ink-2">등록된 문서가 없습니다.</p>
        ) : (
          <ul className="border-t border-hair-2">
            {documents?.map((doc, i) => {
              const fresh = isRecentlyUpdated(doc.updated_at);
              return (
                <li key={doc.id} className="border-b border-hair transition-colors hover:bg-l-cal">
                  <Link
                    href={`/documents/${doc.id}`}
                    className="grid grid-cols-[26px_1fr_auto] items-baseline gap-x-3.5 gap-y-1 py-3.5"
                  >
                    <span className="font-mono text-[11px] text-[#b7c1d1]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <span className="text-sm font-medium leading-snug text-ink">
                        {doc.title}
                        {fresh && (
                          <span className="ml-2 border border-meet-d/35 px-1.5 py-px align-[2px] text-[9.5px] font-normal text-meet-d">
                            새로 바뀜
                          </span>
                        )}
                      </span>
                      {/* 한 줄 요약은 본문 첫 문단을 잘라 자동으로 만든다.
                          따로 적게 하면 아무도 안 쓴다. */}
                      <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-2">
                        {makeSummary(doc.content ?? "", 90)}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-ink-3">
                      {doc.updated_at.slice(5, 10)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
