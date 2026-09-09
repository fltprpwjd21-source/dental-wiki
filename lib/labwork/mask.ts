// 화면에 환자 이름을 그릴 때 한 글자를 가린다.
//
// 왜 가리는가
//   기공물 장부에는 환자 이름과 차트번호가 있다. 기공물을 특정하는 데는 차트번호로 충분하지만,
//   받는 사람이 "누구 것인지" 알아보는 데는 이름이 도움이 된다. 그래서 지우지 않고 가린다.
//   진료실 화면은 환자와 보호자가 지나가며 볼 수 있는 자리다 — 어깨 너머로 봐도
//   전체 이름은 읽히지 않게 한다.
//
// 저장이 아니라 표시다
//   원본 이름은 구글 시트에 있고 우리 DB에 저장하지 않는다(CLAUDE.md 보안 규칙).
//   이 함수는 화면에 그리는 순간에만 쓰인다.
//
// 임시일 수 있다 (2026-09-09)
//   NAS 로 옮기면 이 파일을 지울 예정이다. 다만 가리는 이유가 두 개라는 점은 남겨 둔다.
//     (가) 저장 위치 — 환자정보를 외부 클라우드에 두지 않기 위해. NAS 로 가면 해소된다
//     (나) 화면 노출 — 진료실 화면은 환자·보호자가 지나가며 본다. 이건 어디서 돌리든 그대로다
//   (가)만 보고 지우면 (나)가 조용히 사라진다. 지울 때 (나)를 받아들이는 판단인지 확인할 것.
//
//   지우기 쉽게 해 두었다 — 이 파일과 tests/unit/labwork-mask.test.mts 를 지우고,
//   화면에서 patientLabel() 대신 이름과 차트번호를 그대로 이어붙이면 끝난다.
//   다른 곳에서 이 함수를 부르지 않는다.
//
// 어느 글자를 가리는가 — floor(길이 / 2)
//   중앙보다 한 칸 뒤를 가린다. 이 한 줄이 세 경우를 다 맞춘다.
//     김수     → 김○      (2글자: 뒤를 가린다. 앞을 가리면 성이 사라져 단서가 없어진다)
//     김민수   → 김○수    (3글자: 가운데)
//     남궁민수 → 남궁○수  (4글자: 성을 건드리지 않는다)
//
//   4글자에서 한 칸 앞(index 1)을 가리면 "남○민수"가 되어 두 글자 성이 망가진다.
//   한국 4글자 이름은 두 글자 성(남궁·황보·제갈·선우)인 경우가 많으므로,
//   성을 온전히 남기고 이름 쪽 한 글자를 가리는 편이 알아보기에도 낫다.
//   (이 규칙은 docs/01-plan/features/labwork.plan.md 3.3 표와 짝이다 —
//    표를 바꾸면 tests/unit/labwork-mask.test.mts 가 먼저 깨진다)
const MASK = "○";

export function maskName(name: string): string {
  const trimmed = name.trim();

  // 한 글자는 가릴 것이 없다. 가리면 이름이 사라져 아무 도움이 안 된다.
  if (trimmed.length <= 1) return trimmed;

  const at = Math.floor(trimmed.length / 2);
  return trimmed.slice(0, at) + MASK + trimmed.slice(at + 1);
}

// 화면 한 줄에 들어갈 「환자」 칸을 만든다.
// 시트는 사람이 채우는 곳이라 한쪽이 비는 일이 실제로 생기므로, 한쪽만으로도 성립하게 둔다.
export function patientLabel(name: string | null, chartNo: string | null): string {
  const masked = name ? maskName(name) : "";
  const chart = chartNo?.trim() ?? "";
  if (masked && chart) return `${masked} · ${chart}`;
  return masked || chart || "—";
}
