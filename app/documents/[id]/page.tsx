import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import DocumentDetail from "@/components/DocumentDetail";

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
