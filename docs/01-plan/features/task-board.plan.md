---
template: plan
version: 1.3
feature: task-board
date: 2026-09-11
author: 2251325
project: myapp (치과위키)
extends: PRD ⑨ 업무지시
---

# task-board Planning Document

> **Summary**: 업무지시를 한 방향에서 양방향으로 넓힌다 — 개인이 먼저 올리는 업무보고를 만들고, 진행상황을 게시판으로 공유하고, 팀장 컨펌 코멘트로 같은 건을 이어서 지시한다
>
> **Project**: myapp (치과위키)
> **Author**: 2251325
> **Date**: 2026-09-11
> **Status**: Ready — 미결 결정 없음
> **확장 대상**: PRD ⑨ 업무지시 (커밋 `d4546f1`)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 지금 업무지시는 ① 지시자와 담당자에게만 보이고 ② 지시가 있어야만 보고가 존재하고 ③ 완료 보고에 대한 지시자의 선택지가 「완료 확인」과 「반려」 둘뿐이다. 실제로는 개인이 먼저 보고를 올리기도 하고, 다른 사람도 진행상황을 알아야 하고, "잘했고 이어서 이걸 해라"가 반려와 별개로 필요하다. |
| **Solution** | 기존 `tasks` 테이블과 상태 기계를 그대로 쓰면서 세 가지를 얹는다 — 게시판용 요약 공개, 보고에서 시작하는 흐름(`kind='report'`), 컨펌 코멘트로 같은 건을 잇는 진행 기록(`followup`). |
| **Function/UX Effect** | 개인은 지시받은 일을 보고하고, 지시받지 않은 일도 먼저 보고로 올린다. 받은 사람은 완료 보고에 대해 「완료 확인」·「이어서 지시」·「반려」 셋 중 하나를 고른다. 「이어서 지시」를 고르면 같은 건이 다시 진행 중이 되고 코멘트가 다음 할 일이 된다. 나머지 스탭은 게시판에서 누가 무엇을 어디까지 했는지 본다. |
| **Core Value** | 업무가 흐르는 방향이 위→아래 하나에서 위↔아래 순환으로 바뀌고, 그 순환이 한 건의 이력으로 남으며, 팀에 보인다. |

---

## Context Anchor

- **기존 코드**: `lib/tasks.ts`(순수 규칙 232줄), `lib/tasks-server.ts`(569줄), `lib/tasks-actions.ts`, `app/tasks/`, `components/tasks/`
- **기존 스키마**: `supabase/migrations/20260910150000_tasks.sql` — `tasks` / `task_assignees` / `task_updates` / `task_attachments`
- **접근 제어 구조**: RLS는 `revoke all from anon, authenticated`로 **전면 차단만** 한다. `create policy`는 0개이고, 열람 규칙은 전부 서버 코드(`lib/tasks.ts` + 서비스 롤)에서 판정한다 — 게시판을 열어도 DB 정책은 손대지 않는다
- **권한 모델**: `employee_whitelist.is_admin` 불리언 하나뿐 (`lib/auth.ts`) — **이번 작업에서 건드리지 않는다**
- **참고할 형제 기능**: 공지(`lib/notices.ts`) — 전 스탭이 함께 보는 기존 게시판 패턴

---

## 1. Overview

### 1.1 Purpose

업무지시를 조직의 실제 보고 체계에 맞춘다. 지시·보고·컨펌이 한 건 안에서 순환하고, 그 진행상황이 팀에 공유된다.

### 1.2 Background

2026-09-10 PRD ⑨로 업무지시가 들어갔다. 그때 세운 전제 하나가 이번 요구와 어긋난다.

**열람을 닫아 뒀다.** `lib/tasks.ts` `canView()` — "지시문에는 질책성 내용이 들어갈 수 있어서 지시자와 담당자에게만 연다. 나중에 여는 것은 쉬워도 이미 본 것은 되돌릴 수 없다". 이번엔 게시판으로 공유해야 한다.

이것이 이번 작업에서 **유일하게 되돌릴 수 없는 변경**이라 요약만 공개하는 것으로 좁혔다 (§2.1 ①).

지시 권한은 지금 그대로 둔다. `app/api/tasks/route.ts:16`의 "지시는 로그인한 스탭 누구나 낼 수 있다 (관리자 전용이 아니다 — 공지와 같다)"를 유지한다 (2026-09-11 결정).

### 1.3 Related Documents

- `PRD.md` ⑨ 업무지시 — 이번 변경으로 갱신 필요
- `CLAUDE.md` "이번 프로젝트에서 만들지 않는 것" — "승인/결재 절차"가 적혀 있으나 이번 요구가 정확히 그것이라 수정 필요 (「역할별 세분화 권한」은 그대로 유지된다)
- `docs/01-plan/features/notes.plan.md` — 계획서 형식 참고

---

## 2. Scope

### 2.1 In Scope

**① 게시판 — 요약만 공개**

- `canView()`는 그대로 둔다. 본문·진행 기록·첨부의 접근 게이트로 계속 쓴다
- 새 규칙 `canViewSummary()` → 로그인한 전 스탭 `true`
- 공개되는 값: 제목 · 담당자 이름 · 상태 · 진행률 · 마감일 · 최종 갱신일
- 공개되지 않는 값: `body` · `task_updates` 전체 · 첨부 · 반려 사유
- 서버 조회를 `getTaskBoard()`로 분리해 **select 목록 자체에 `body`를 넣지 않는다**. 화면에서 가리는 방식은 쓰지 않는다
- 카드를 열면 당사자는 스레드까지, 그 외에는 요약까지만
- **DB 변경 없음** — RLS는 이미 전면 차단이고 판정은 서버 코드에서 하므로 정책을 추가하지 않는다

**② 자발적 업무보고 (`kind='report'`)**

- `tasks`에 `kind task_kind not null default 'instruction'` 추가 (`'instruction' | 'report'`)
- `kind='report'`일 때 필드 의미:
  - `assigner_id` = **보고를 받을 사람**(팀장). 컨펌 권한자가 된다
  - `task_assignees` = 보고자 본인 한 명
  - 생성 즉시 `status='submitted'`, `submitted_by`=본인, `submitted_at`=now()
- 기존 `canApprove()`가 그대로 동작한다 — "지시자만, submitted일 때만". 상태 기계를 새로 만들지 않는다
- 보고 작성은 전 스탭이 할 수 있다

**③ 컨펌 → 같은 건을 이어서 지시 (`followup`)**

새 지시를 만들지 않는다. 같은 건이 계속 이어진다 (2026-09-11 결정).

- `task_update_kind` enum에 `'followup'` 추가 (기존: `note` / `submit` / `reject`)
- 완료 보고(`submitted`) 상태에서 지시자의 선택지가 **셋**이 된다:

  | 선택 | 상태 변화 | 진행 기록 |
  |------|----------|----------|
  | 완료 확인 | → `done`, `completed_at` 기록 | `submit` 뒤에 종결 |
  | **이어서 지시** | → `in_progress`, `progress` 0, `submitted_at` null | `followup` (코멘트 필수) |
  | 반려 | → `in_progress`, `progress` 0, `submitted_at` null | `reject` (사유 필수) |

- `followupPatch()`는 `rejectPatch()`와 같은 값을 돌려주지만 **함수를 분리한다** — 의미가 다르고, 나중에 한쪽만 바뀔 여지가 있다
- `completed_at`은 채우지 않는다. 완료가 아니다
- 담당자는 그대로 유지한다. 담당자 교체는 이번 범위 밖이다
- 이력은 한 건의 스레드에 `submit → followup → submit → followup …`으로 쌓여 한 줄로 읽힌다
- **트리거 변경 불필요** — `forbid_task_update_mutation()`이 `OLD.kind <> 'note'`로 판정하므로, enum에 값을 넣는 순간 `followup`도 수정·삭제 불가가 된다. 예외 메시지 문구만 "완료 보고·반려"에서 "완료 보고·반려·이어서 지시"로 고친다
- 담당자에게 "이어서 지시가 왔다"를 알리는 배지가 필요하다. 기존 `shouldShowRejectionBadge()`는 `reject`만 보므로 `followup`까지 포함하도록 일반화한다 (`task_assignees.rejection_seen_at` 재사용)

### 2.2 Out of Scope

- **지시 권한 제한** — 전 스탭이 지시를 낼 수 있는 현재 동작을 유지한다 (2026-09-11 결정). `employee_whitelist`와 `lib/auth.ts`는 건드리지 않는다
- **후속 지시를 별건으로 생성** — 같은 건을 잇는 방식으로 결정했으므로 `parent_task_id`를 만들지 않는다 (2026-09-11 결정)
- 담당자 교체 기능
- 팀/부서 편성 테이블
- 게시판 댓글 (진행 기록 스레드로 충분하다)
- 알림/푸시 (기존 배지 방식을 넘지 않는다)
- 통계·집계 대시보드 (`CLAUDE.md` 비범위 유지)
- 지시 완전 삭제 (기존대로 휴지통만)

### 2.3 확정된 결정

| # | 결정 | 채택 | 근거 |
|---|------|------|------|
| 1 | 게시판 공개 범위 | **요약만 공개** | 되돌릴 수 없는 유일한 변경이라 좁게 연다. 넓히기는 `getTaskBoard()` select 한 줄 |
| 2 | 컨펌 후 흐름 | **같은 건을 이어감** | 이력이 한 건에 모인다. 별건 생성 방식은 폐기 |
| 3 | 지시 권한 | **전 스탭 유지** | 권한 축을 새로 만들지 않는다 |
| 4 | 자발적 보고 | **만든다** | "지시와 보고 둘 다" 요구 |

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 검증 |
|----|---------|------|
| FR-1 | 전 스탭이 게시판에서 모든 지시·보고의 요약을 본다 | 제3자 계정으로 목록 조회 |
| FR-2 | 제3자에게 본문·진행 기록·첨부가 내려가지 않는다 | 응답 JSON에 `body` 키 자체가 없음 |
| FR-3 | 개인이 지시 없이 업무보고를 올린다 | 보고 생성 → `status='submitted'` |
| FR-4 | 보고를 받은 사람이 컨펌·반려한다 | 기존 `canApprove`/`canReject` 경로 재사용 |
| FR-5 | 완료 보고에 대해 「이어서 지시」를 고르면 같은 건이 `in_progress`로 돌아가고 코멘트가 `followup`으로 남는다 | 상태·진행률·스레드 확인 |
| FR-6 | `followup` 기록은 수정·삭제할 수 없다 | 직접 UPDATE 시도 → 예외 |
| FR-7 | 담당자에게 「이어서 지시」 배지가 뜨고, 열면 사라진다 | `rejection_seen_at` 갱신 확인 |
| FR-8 | 지시 생성 권한은 종전대로 전 스탭이다 | 임의 계정으로 `POST /api/tasks` → 성공 |

### 3.2 Non-Functional Requirements

- 게시판 목록은 기존 `getTaskInbox()`와 같은 응답 시간대를 유지한다 (인덱스 추가로 대응)
- `lib/tasks.ts`는 순수 함수만 유지한다. DB·화면이 들어오지 않는다
- 새 규칙은 전부 단위 테스트로 고정한다 (기존 파일의 방침)

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 마이그레이션 2종 적용
- [ ] FR-1 ~ FR-8 전부 통과
- [ ] `npm run lint` · `npm run build` 통과
- [ ] `npm run dev`로 3개 흐름 육안 확인 (보고·이어서 지시·게시판)
- [ ] `PRD.md` ⑨ 갱신
- [ ] `CLAUDE.md` 비범위 항목 수정 (승인/결재 절차만. 역할별 권한 세분화는 유지)
- [ ] `lib/tasks.ts` `canView()` 주석을 새 결정에 맞게 갱신
- [ ] `task_updates.kind` 컬럼 주석에 `followup` 추가

### 4.2 Quality Criteria

- 제3자 응답에 `body`가 없다 (화면에서 가리는 게 아니라 안 내려간다)
- 기존 지시·보고 데이터가 그대로 열린다
- 상태 기계에 새 상태를 추가하지 않았다 (`assigned`/`in_progress`/`submitted`/`done` 유지)
- 권한 모델(`is_admin`)에 손대지 않았다
- RLS 정책을 추가하지 않았다

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 대응 |
|--------|------|------|
| **게시판 공개는 되돌릴 수 없다** | 높음 | 요약만 공개로 시작. 본문은 select에서 제외해 실수로도 안 나가게 한다 |
| **`alter type … add value`가 트랜잭션에서 막힌다** | 중간 | Postgres는 enum에 값을 추가한 뒤 **같은 트랜잭션에서 그 값을 쓰지 못한다**. `followup` 추가를 독립 마이그레이션 파일로 분리하고, 그 파일에서는 값을 사용하지 않는다 |
| `kind` 추가가 기존 쿼리 전부에 영향 | 중간 | `default 'instruction'`으로 기존 행 무변경. 목록 쿼리에 `kind` 필터를 명시적으로 넣는다 |
| 「이어서 지시」와 「반려」를 화면에서 혼동 | 중간 | 스레드 배지 색·문구를 다르게 하고, 버튼도 나란히 두되 라벨을 분명히 한다. `followupPatch`/`rejectPatch`를 코드에서도 분리 |
| 이어가기가 반복돼 한 건이 지나치게 길어진다 | 낮음 | `is_longterm` 업무의 정상 패턴이다. 스레드는 이미 시간순이므로 추가 대응 없음 |
| 보고의 `assigner_id` 의미 반전을 나중에 오해 | 중간 | 컬럼 주석과 `lib/tasks.ts` 주석에 명시. 단위 테스트로 고정 |
| `CLAUDE.md` 비범위와 충돌한 채 진행 | 중간 | 착수 전에 문서부터 고친다 (§4.1) |

---

## 6. Impact Analysis

### 6.1 Changed Resources

**새 마이그레이션 (2개)** — 트랜잭션 제약 때문에 반드시 나눈다

- `2026_____task_update_kind_followup.sql` — `alter type task_update_kind add value 'followup'` **한 줄만**. 이 파일에서 값을 쓰지 않는다
- `2026_____tasks_kind.sql` — `task_kind` enum 생성, `tasks.kind` 컬럼, 인덱스, 컬럼 주석, 트리거 예외 메시지 문구 수정

**수정**
- `lib/tasks.ts` — `canViewSummary`, `canFollowup`, `followupPatch`, `kind` 반영. `shouldShowRejectionBadge` 일반화. `canView` 주석 갱신
- `lib/tasks-server.ts` — `getTaskBoard()` 추가, 기존 조회에 `kind` 반영, `followup` 기록 작성
- `app/api/tasks/route.ts` — 보고 생성 분기 (권한 검사는 추가하지 않는다)
- `app/api/tasks/[id]/` — 「이어서 지시」 경로
- `app/tasks/page.tsx` · `app/tasks/[id]/page.tsx` — 게시판 탭, 요약/전체 분기
- `components/tasks/NewTaskForm.tsx` — 지시/보고 모드
- `components/tasks/TaskThread.tsx` — 버튼 3개(완료 확인·이어서 지시·반려), `followup` 기록 표시
- `components/tasks/TaskCardList.tsx` — 요약 카드
- `PRD.md` · `CLAUDE.md`

**건드리지 않는 것**
- `lib/auth.ts` · `employee_whitelist` · `app/api/settings/whitelist` — 권한 모델 무변경
- RLS 정책 — 추가하지 않음
- `forbid_task_update_mutation()` 로직 — 예외 메시지 문구만 수정

### 6.2 Current Consumers

- `components/AppTabs.tsx` — 업무 탭 진입점. 게시판 탭 추가 시 영향
- `lib/tasks-actions.ts` — 클라이언트 호출부. 새 액션 추가
- 기존 `tasks` 데이터 — `kind` 기본값으로 무변경

### 6.3 Verification

§9에 절차를 둔다.

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Dynamic — 기존 Next.js App Router + Supabase 구조 안에서 끝난다. 새 서비스·인프라 없음.

### 7.2 Key Architectural Decisions

**AD-1. 보고를 별도 테이블로 만들지 않는다**

`tasks`에 `kind`를 두고 필드 의미를 뒤집는다. 보고도 결국 "누가 누구에게 무엇을 어디까지" + 스레드 + 컨펌이라 구조가 같다. 테이블을 나누면 상태 기계·스레드·첨부가 전부 두 벌이 된다.

`kind='report'`에서 `assigner_id`는 "지시를 낸 사람"이 아니라 "컨펌할 사람"이 된다. 의미가 갈리는 지점이라 컬럼 주석과 `lib/tasks.ts` 주석에 명시한다.

**AD-2. 게시판은 조회 함수를 분리한다**

같은 함수에 플래그를 넘겨 필드를 빼는 방식은, 언젠가 플래그를 안 넘기는 호출부가 생기면 본문이 그대로 나간다. `getTaskInbox()`(당사자용)와 `getTaskBoard()`(전체용)를 아예 다른 함수로 두고, 후자의 select 목록에 `body`를 넣지 않는다.

**AD-3. 이어가기는 새 행이 아니라 새 진행 기록이다**

「이어서 지시」를 별건으로 만들면 한 흐름이 여러 건으로 쪼개지고, 게시판에서 같은 일이 여러 줄로 보이며, "이 업무 어디까지 왔나"를 보려면 건을 타고 다녀야 한다. 같은 건에 `followup` 기록을 쌓으면 이력이 한 줄로 읽히고, 기존 스레드·첨부·정렬이 전부 그대로 산다.

대가는 한 건이 길어진다는 것인데, 그건 장기 업무에서 이미 일어나는 일이고 스레드가 시간순이라 문제가 되지 않는다.

**AD-4. 상태를 추가하지 않는다**

「이어서 지시」는 새 상태가 아니라 기존 `in_progress`로의 복귀다. 반려와 도달 상태가 같고 구분은 진행 기록의 `kind`에만 있다. 네 상태를 유지하면 기존 정렬(`compareTasks`)·라벨·배지가 전부 그대로 산다.

**AD-5. 접근 제어는 서버 코드에 둔다 (기존 구조 유지)**

이 프로젝트의 RLS는 정책 없이 `revoke all`로 브라우저 직접 접근만 막고, 열람 규칙은 서버가 판정한다. 게시판도 같은 층에서 처리하므로 DB 마이그레이션이 필요 없다. 규칙이 `lib/tasks.ts` 한 곳에 모여 있다는 기존 장점을 깨지 않는다.

---

## 8. Convention Prerequisites

- 모든 주석·문서는 한국어 (`CLAUDE.md`)
- TypeScript strict, `any` 금지
- 커밋 전 `npm run lint`
- 파일 삭제 대신 `trash-can` 이동
- **커밋 시 `git add -A` 금지** — 작업 트리에 다른 세션의 변경이 섞일 수 있으므로 이번 작업 파일만 지정해 커밋한다

---

## 9. Next Steps

착수 순서. 각 단계마다 `lint` + `build`를 통과시키고 넘어간다.

1. **문서 정리** — `CLAUDE.md` 비범위 수정, `PRD.md` ⑨ 갱신. 코드보다 먼저 한다
2. **③ 이어서 지시** — `followup` enum 마이그레이션(독립 파일) → `lib/tasks.ts` 규칙·패치 → 컨펌 API → `TaskThread` 버튼 3개 → 배지 일반화
3. **② 자발적 보고** — `kind` 마이그레이션 → `lib/tasks.ts` 규칙 → 생성 API → `NewTaskForm` 모드 분기
4. **① 게시판** — `getTaskBoard()` → 게시판 탭 → 요약 카드
5. **검증** — FR-1~8 수동 확인, 제3자 계정으로 응답 JSON에 `body` 없음 확인

③을 먼저 하는 이유: enum 추가가 독립 마이그레이션이라 먼저 넣어두면 뒤 단계가 자유롭다.
①을 마지막에 두는 이유: 되돌릴 수 없는 유일한 변경이라, 나머지가 다 돌아가는 걸 보고 마지막에 연다.

### 검증 절차

```
npm run lint && npm run build
npm run dev
```

계정 2개로 확인한다.

| 계정 | 확인할 것 |
|------|----------|
| 스탭 A | 지시 생성(종전대로 가능), 보고 생성, 완료 보고 후 「이어서 지시」를 받아 배지 확인 |
| 무관한 스탭 B | 게시판에서 A의 건이 요약으로 보이고, 열어도 본문·스레드가 안 보임 |

브라우저 개발자도구 Network 탭에서 게시판 응답에 `body` 키가 없는 것을 눈으로 확인한다.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-11 | 2251325 | 최초 작성. PRD ⑨ 업무지시 확장 |
| 1.1 | 2026-09-11 | 2251325 | 지시 권한 제한(`can_assign`) 삭제 — 전 스탭 지시 가능 유지. 권한 모델 무변경 |
| 1.2 | 2026-09-11 | 2251325 | 컨펌 후속을 별건 생성(`parent_task_id`)에서 같은 건 이어가기(`followup` 진행 기록)로 변경. 게시판 요약 공개 확정. RLS 마이그레이션 불필요 확인 |
| 1.3 | 2026-09-11 | 2251325 | 완료 보고 시 진행률 100% 자동 확정(`submitPatch`). 업무 탭을 하위 탭 3개(전체현황·내가 할 일·내가 요청한 것)로 재구성하고 전체현황을 첫 화면으로. 독립 경로 `/tasks/board` 는 `?tab=` 으로 대체해 폐기 |
| 1.4 | 2026-09-11 | 2251325 | 「반려」와 「이어서 지시」를 「추가 요청」 하나로 합침(reject 액션 은퇴, enum 값은 옛 기록용으로 존치). 지시/보고에서 뒤집히는 역할을 `isOwner`/`isHandler` 로 정리 — 받은 보고가 「내가 요청한 업무」로 들어가고 담당자 칸에 보고자가 뜨던 문제 수정. 상단 탭 「업무」, 하위 탭 4개(요약·내 업무·업무 지시·업무 보고), 작성창 전용 탭 분리, 내용칸 rows 5→14 |
