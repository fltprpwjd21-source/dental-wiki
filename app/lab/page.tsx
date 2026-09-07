import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// 기공물확인 — 아직 만들지 않았다. 탭 자리와 색만 잡아둔다.
//
// 구글 시트를 읽어 도착 예정일과 도착 여부를 보여줄 화면이다.
// 시작하려면 시트의 열 이름과, 「도착」을 앱에서 눌러 시트에 쓸지가 정해져야 한다.
export default async function LabPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="flex-1 bg-l-lab">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">기공물확인</h1>
        <p className="mt-1 text-[11px] text-ink-2">기공소에 보낸 것과 받은 것</p>

        <div className="mt-5 border border-hair bg-white px-5 py-10 text-center">
          <p className="font-display text-lg font-bold tracking-tight text-ink">준비 중입니다</p>
          <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-ink-2">
            구글 시트에 적어 두는 기공물 목록을 읽어와, 도착 예정일이 지난 것을 맨 위로 올려
            보여줄 화면입니다. 지금은 자리만 잡아 두었습니다.
          </p>
        </div>
      </div>
    </main>
  );
}
