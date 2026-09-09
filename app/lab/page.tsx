import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { LABWORK_SELECT } from "@/lib/labwork/draft";
import type { LabworkRecord } from "@/lib/labwork/types";
import LabworkGrid from "@/components/labwork/LabworkGrid";

// 기공물확인 — 입력 화면 시제품.
//
// 답하려는 질문은 하나다: "엑셀 대신 여기에 입력해도 괜찮은가."
// 그래서 표 자체 말고는 아무것도 얹지 않았다. 정렬·통계·D-day 는 이 판단이 난 뒤에 붙인다.
//
// 실제 시트 13열 중 등록번호·환자명 두 열이 없다.
// 환자를 특정하는 값이라 지금 DB(Supabase, 외부 클라우드)에 저장하지 않는다 — CLAUDE.md 보안 규칙.
// NAS 로 옮긴 뒤에 더한다. (docs/01-plan/features/labwork.plan.md)
export default async function LabPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("labwork_items")
    .select(LABWORK_SELECT)
    .order("seq", { ascending: true });

  if (error) console.error("[lab] 목록 조회 실패:", error);

  return (
    <main className="flex-1 bg-l-lab">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex flex-wrap items-end gap-2.5">
          <h1 className="font-display text-[23px] font-extrabold leading-tight tracking-tight text-ink">
            기공물확인
          </h1>
          <span className="mb-0.5 text-[11px] text-ink-2">입력 화면 시제품</span>
        </div>

        <div className="mt-3 border-l-2 border-hair-2 bg-white px-3.5 py-2.5">
          <p className="text-[12px] leading-relaxed text-ink-2">
            엑셀 대신 여기에 입력해도 괜찮은지 보려고 만든 화면입니다. 실제 장부가 아닙니다 —
            아무렇게나 넣고 지워보세요.
            <br />
            <span className="text-ink-3">
              시트의 <strong className="font-medium text-ink-2">등록번호·환자명</strong> 두 칸은
              일부러 없습니다. 환자를 특정하는 값이라 지금 쓰는 외부 서버에 저장하지 않습니다.
              병원 안(NAS)으로 옮긴 뒤에 더합니다.
            </span>
          </p>
        </div>

        {error ? (
          <p className="mt-4 border border-hair bg-white px-4 py-8 text-center text-[12.5px] text-late">
            장부를 불러오지 못했습니다.
          </p>
        ) : (
          <LabworkGrid initial={(data ?? []) as unknown as LabworkRecord[]} />
        )}
      </div>
    </main>
  );
}
