import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import NoticeForm from "@/components/notices/NoticeForm";
import NoticeFormShell from "@/components/notices/NoticeFormShell";

// 공지 작성 — 관리자가 아니어도 들어올 수 있다.
//
// ?note=<id> 또는 ?document=<id> 로 들어오면 그 원본이 연결된 채로 열린다.
// 보관함의 노트에서 「공지 등록」을 누르면 이 경로로 온다 — 제목만 확인하고 올리면 끝이다.
export default async function NewNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string; document?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { note, document } = await searchParams;
  const supabase = getServerSupabaseClient();

  let source: { kind: "note" | "document"; id: string; title: string } | undefined;

  if (note && isUuid(note)) {
    const { data } = await supabase
      .from("nodes")
      .select("id, name, type, status")
      .eq("id", note)
      .maybeSingle();
    if (data && data.status === "active" && data.type === "note") {
      source = { kind: "note", id: data.id, title: data.name };
    }
  } else if (document && isUuid(document)) {
    const { data } = await supabase
      .from("documents")
      .select("id, title")
      .eq("id", document)
      .maybeSingle();
    if (data) source = { kind: "document", id: data.id, title: data.title };
  }

  return (
    <NoticeFormShell heading={source ? `공지 등록 — ${source.title}` : "공지 작성"}>
      <NoticeForm source={source} />
    </NoticeFormShell>
  );
}
