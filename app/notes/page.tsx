import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import NotesApp from "@/components/notes/NotesApp";

export default async function NotesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // 보관함은 화면 높이를 꽉 채워 트리와 본문이 각자 스크롤된다.
  // main 이 flex-1 을 받아야 NotesApp 이 남는 높이를 이어받을 수 있다.
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <NotesApp />
    </main>
  );
}
