-- 시제품을 실제 쓰는 모양에 맞춘다 (2026-09-10 사용자 확인).
--
-- 1) 시트가 둘이다 — 기공소로 나가는 외부시트와 병원용 내부시트. 구조는 같다.
--    한 표에 구분 칸을 두고 화면에서 탭으로 나눈다.
--    표를 둘로 나누지 않는 이유: 구조가 같으므로 표가 둘이면 열을 고칠 때마다
--    두 번 고쳐야 하고, 한쪽만 고치는 날이 반드시 온다.
--
-- 2) M열은 「구강스캔」인 경우에만 표시하는 칸이었다. 글자가 아니라 체크다.
--    글자 칸으로 두면 "구강스캔" 을 매번 손으로 치게 되고, 오타가 나면 집계에서 빠진다.
alter table labwork_items
  add column if not exists scope text not null default 'external'
    check (scope in ('external', 'internal')),
  add column if not exists oral_scan boolean not null default false;

-- extra 는 M열을 글자로 받으려던 자리였다. 체크로 바뀌었으므로 지운다.
-- (시제품이고 아직 실제 데이터가 없어 잃을 것이 없다)
alter table labwork_items drop column if exists extra;

create index labwork_items_scope_idx on labwork_items (scope, seq);

comment on column labwork_items.scope is
  '어느 시트인지. external = 기공소로 나가는 외부시트, internal = 병원 내부시트. 구조가 같아 한 표에 담고 화면에서 탭으로 나눈다.';
comment on column labwork_items.oral_scan is
  '시트 M열. 구강스캔인 경우에만 체크한다 — 글자로 받으면 매번 손으로 치게 되고 오타가 집계에서 빠진다.';
