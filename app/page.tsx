import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import QaScreen from "@/components/QaScreen";

export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <Suspense>
      <QaScreen />
    </Suspense>
  );
}
