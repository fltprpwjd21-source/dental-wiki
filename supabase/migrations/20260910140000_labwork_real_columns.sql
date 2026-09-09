-- 실제 기공물 장부의 열 구성에 맞춘다 (2026-09-10 사용자가 시트 화면을 공유).
--
-- 실제 시트는 13열이다:
--   기공소 · 등록번호 · 의뢰 · 환자명 · 의사 · 보철물 · 치식 · 치아개수 · AB개수 ·
--   예정일 · 기타사항 · 도착일 · (M열, 이름 미확인 — 값 예: "구강스캔")
--
-- 이 표에 넣지 않는 두 열
--   등록번호 · 환자명 — 환자를 특정하는 값이다. 지금 이 DB 는 Supabase(외부 클라우드)라
--   저장하면 CLAUDE.md 보안 규칙을 어긴다. NAS 로 옮긴 뒤에 더한다.
--   "나중에 쓸 거니까 빈 열이라도 만들어 두자"를 하지 않는다 — 빈 열이 있으면
--   누군가 반드시 채운다.
--
-- 의사는 넣는다. 직원 이름이라 환자 식별정보가 아니다.
--
-- 날짜를 date 로 두는 이유
--   지금 시트에는 "9/8", "9월 15일" 처럼 같은 뜻을 다른 모양으로 적은 칸이 섞여 있다.
--   글자로 두면 "9월 15일" 과 "9/15" 가 서로 다른 값이 되어 정렬도 집계도 어긋난다.
--   date 로 받으면 모양은 화면이 정하고 값은 하나로 모인다.
alter table labwork_items
  add column if not exists doctor text not null default '',      -- 의사
  add column if not exists tooth text not null default '',        -- 치식 (여러 개일 수 있어 글자로 둔다)
  add column if not exists tooth_count integer,                   -- 치아개수
  add column if not exists ab_count integer,                      -- AB개수
  add column if not exists extra text not null default '';        -- M열 (이름 확인 후 바꾼다)

-- 기존 열의 뜻을 실제 시트에 맞춰 다시 적는다.
comment on column labwork_items.lab is '기공소 (시트 A열)';
comment on column labwork_items.ordered_on is '의뢰일 (시트 C열 「의뢰」)';
comment on column labwork_items.kind is '보철물 (시트 F열) — 예: abutment+Zir cr.SCRP';
comment on column labwork_items.due_on is '예정일 (시트 J열)';
comment on column labwork_items.note is '기타사항 (시트 K열)';
comment on column labwork_items.arrived_on is '도착일 (시트 L열)';
comment on column labwork_items.extra is
  '시트 M열. 헤더 이름을 아직 확인하지 못했다(값 예: "구강스캔"). 확인되면 열 이름을 바꾼다.';
