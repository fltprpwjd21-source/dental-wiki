import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { LABWORK_SELECT } from "@/lib/labwork/draft";
import { LABWORK_SCOPES, type LabworkRecord, type LabworkScope } from "@/lib/labwork/types";
import LabworkGrid from "@/components/labwork/LabworkGrid";

// 기공물확인 — 입력 화면 시제품.
//
// 답하려는 질문은 하나다: "엑셀 대신 여기에 입력해도 괜찮은가."
// 그래서 표 자체 말고는 아무것도 얹지 않았다. 정렬·통계·D-day 는 이 판단이 난 뒤에 붙인다.
//
// 시트가 둘이다 — 기공소로 나가는 외부시트와 병원 내부시트. 구조가 같아 탭으로 나눈다.
// 주소에 담는다(?sheet=internal) — 새로고침·뒤로가기·링크 공유가 그대로 맞는다.
//
// 실제 시트 13열 중 등록번호·환자명 두 열이 없다.
// 환자를 특정하는 값이라 지금 DB(Supabase, 외부 클라우드)에 저장하지 않는다 — CLAUDE.md 보안 규칙.
// NAS 로 옮긴 뒤에 더한다. (docs/01-plan/features/labwork.plan.md)
export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { sheet } = await searchParams;
  const scope: LabworkScope = sheet === "internal" ? "internal" : "external";

  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("labwork_items")
    .select(LABWORK_SELECT)
    .eq("scope", scope)
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
              지금은 <strong className="font-medium text-ink-2">병원 밖 서버</strong>에 저장됩니다.
              확인하는 동안에는 <strong className="font-medium text-ink-2">환자 이름·등록번호를
              가짜로</strong> 넣어주세요 — 손맛을 보는 데는 차이가 없습니다. 실제 장부는 병원
              안(NAS)으로 옮긴 뒤에 넣습니다.
            </span>
          </p>
        </div>

        {/* 외부·내부 시트. 구조가 같아 표는 하나로 두고 여기서만 가른다. */}
        <div className="mt-4 flex items-end gap-1 border-b border-hair-2">
          {LABWORK_SCOPES.map((s) => {
            const on = s.key === scope;
            return (
              <Link
                key={s.key}
                href={s.key === "external" ? "/lab" : `/lab?sheet=${s.key}`}
                aria-current={on ? "page" : undefined}
                className={`-mb-px border-b-2 px-3.5 py-2 text-[12.5px] transition-colors ${
                  on
                    ? "border-navy font-medium text-navy"
                    : "border-transparent text-ink-3 hover:text-ink-2"
                }`}
              >
                {s.label}
                <span className="ml-1.5 text-[10.5px] font-normal text-ink-3">{s.hint}</span>
              </Link>
            );
          })}
        </div>

        {error ? (
          <p className="mt-4 border border-hair bg-white px-4 py-8 text-center text-[12.5px] text-late">
            장부를 불러오지 못했습니다.
          </p>
        ) : (
          /* key 로 시트를 구분한다. 탭을 바꾸면 표를 통째로 새로 만든다 —
             상태를 이펙트로 갈아끼우면 잠깐 옛 시트의 줄이 보이고,
             고른 칸이 남아 엉뚱한 줄이 열린다. */
          <LabworkGrid
            key={scope}
            initial={(data ?? []) as unknown as LabworkRecord[]}
            scope={scope}
          />
        )}
      </div>
    </main>
  );
}
