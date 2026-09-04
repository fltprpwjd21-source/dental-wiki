import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import NotesApp from "@/components/notes/NotesApp";

export default async function NotesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return <NotesApp />;
}
