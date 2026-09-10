-- 시트 13열을 그대로 맞춘다 (2026-09-10 사용자 요청).
--
-- 시트 순서: 기공소 · 등록번호 · 의뢰 · 환자명 · 의사 · 보철물 · 치식 ·
--            치아개수 · AB개수 · 예정일 · 기타사항(비고) · 도착일 · 구강스캔
--
-- 1) 환자 두 칸을 넣는다
--    앞서 일부러 빼 두었던 칸이다. 사용자가 시트와 같은 순서로 넣기로 정했다(2026-09-10).
--    지금 이 DB 는 Supabase(병원 밖)이므로, 여기에 실제 환자 이름·등록번호를 넣으면
--    그 값이 병원 밖에 저장된다. 시제품을 확인하는 동안에는 가짜 값을 쓰기로 했고,
--    실제 장부를 옮기는 것은 NAS 이전 이후다.
--    (docs/01-plan/features/labwork.plan.md — CLAUDE.md 보안 규칙)
alter table labwork_items
  add column if not exists patient_chart_no text not null default '',
  add column if not exists patient_name text not null default '';

-- 2) 도착은 날짜 하나로 둔다
--    시트 L열이 「도착일」이라 날짜다. 여기에 arrived(참/거짓)까지 따로 두면
--    두 값이 어긋나는 날이 온다 — 날짜는 비었는데 도착으로 찍혀 있는 줄 같은 것이다.
--    도착 여부는 "도착일이 있는가"로 판단한다. 진실을 한 곳에만 둔다.
alter table labwork_items drop column if exists arrived;

drop index if exists labwork_items_due_idx;
create index labwork_items_due_idx on labwork_items (due_on) where arrived_on is null;

comment on column labwork_items.patient_chart_no is
  '시트 B열 「등록번호」. 환자를 특정하는 값이다 — NAS 이전 전에는 시제품용 가짜 값만 넣는다.';
comment on column labwork_items.patient_name is
  '시트 D열 「환자명」. 환자를 특정하는 값이다 — NAS 이전 전에는 시제품용 가짜 값만 넣는다.';
comment on column labwork_items.arrived_on is
  '시트 L열 「도착일」. 이 값이 있으면 도착한 것이다 — 참/거짓 칸을 따로 두지 않는다.';
comment on column labwork_items.lab is
  '기공소 (시트 A열). 내부시트에서는 기공실에서 만들므로 「기공실」이 기본값으로 들어간다.';
