-- 기공물 장부 시제품용 표.
--
-- 무엇을 확인하려는 표인가
--   지금 장부는 구글 시트에 있고, 사용자는 "표에 바로 입력하는 손맛"이 익숙해서
--   그걸 앱에서도 낼 수 있는지 보려 한다. 이 표는 그 입력 화면을 실제로 눌러보기 위한 것이다.
--   (docs/01-plan/features/labwork.plan.md)
--
-- 환자 이름·차트번호 열이 일부러 없다
--   지금 이 DB 는 Supabase(외부 클라우드)다. 환자 식별정보를 여기 저장하면
--   CLAUDE.md 보안 규칙을 어긴다. NAS 로 옮긴 뒤에 열을 더한다.
--   "나중에 넣을 거니까 미리 만들어 두자"를 하지 않는 이유는, 빈 열이 있으면
--   누군가 반드시 채우기 때문이다. 넣을 수 있게 되는 날 마이그레이션으로 더한다.
--
-- 열 이름은 아직 확정이 아니다
--   실제 구글 시트의 첫 줄을 아직 못 봤다(2026-09-10 기준 시트가 로그인을 요구했다).
--   사용자가 쓰는 열 이름을 확인하면 이 표와 lib/labwork/columns.ts 를 함께 맞춘다.
create table labwork_items (
  id uuid primary key default gen_random_uuid(),
  -- 화면에서 행 순서를 그대로 유지하기 위한 값.
  --   표는 "내가 넣은 자리에 그대로 있는 것"이 당연하게 느껴져야 한다.
  --   날짜순으로 다시 줄 세우면 방금 입력한 줄이 눈앞에서 사라져 당황하게 된다.
  seq bigint generated always as identity,

  ordered_on date,                          -- 의뢰일
  kind text not null default '',            -- 기공물 종류 (지르코니아·PFM·틀니 …)
  lab text not null default '',             -- 기공소
  due_on date,                              -- 도착 예정일
  arrived boolean not null default false,   -- 도착했는지
  arrived_on date,                          -- 실제 도착일
  note text not null default '',            -- 메모

  -- 작성자는 스냅샷으로 두지 않는다. 이 표는 장부라서 "누가 마지막에 고쳤는지"만 있으면 된다.
  created_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index labwork_items_seq_idx on labwork_items (seq);
create index labwork_items_due_idx on labwork_items (due_on) where arrived = false;

comment on table labwork_items is
  '기공물 장부 시제품. 환자 이름·차트번호 열은 일부러 없다 — 외부 클라우드에 저장하지 않기 위해서다(CLAUDE.md). NAS 이전 후에 더한다.';
comment on column labwork_items.seq is
  '입력한 순서. 표는 내가 넣은 자리에 그대로 있어야 해서 날짜로 다시 정렬하지 않는다.';

-- 이 저장소 전역 방침: 브라우저 쪽 역할에서는 회수하고 서버(service_role)만 접근한다.
alter table labwork_items enable row level security;
revoke all on labwork_items from anon, authenticated;
