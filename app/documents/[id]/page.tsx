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
    .select("id, category, title, content, version")
    .eq("id", id)
    .maybeSingle();

  if (!document) {
    notFound();
  }

  // key={document.version}: 다른 사람이 먼저 저장해 버전이 바뀌면(또는 화면의
  // "새로고침" 버튼을 누르면) DocumentDetail을 통째로 다시 마운트해 최신 내용으로
  // 깨끗하게 다시 시작한다 (components/DocumentDetail.tsx 상단 주석 참고).
  return <DocumentDetail key={document.version} document={document} />;
}
