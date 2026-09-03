import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import DocumentDetail from "@/components/DocumentDetail";
import { isUuid } from "@/lib/uuid";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  // uuid가 아니면 DB 형식 오류(500)가 나므로, 여기서 먼저 404로 처리한다
  if (!isUuid(id)) {
    notFound();
  }

  const supabase = getServerSupabaseClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id, category, title, content")
    .eq("id", id)
    .maybeSingle();

  if (!document) {
    notFound();
  }

  return <DocumentDetail document={document} />;
}
