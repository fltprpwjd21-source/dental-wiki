-- 공지 — 홈 배너의 카드뉴스와 공지 탭이 함께 쓰는 표
--
-- 왜 슬라이드를 이미지로 저장하지 않는가
--   카드는 화면에서 그린다. 이미지를 만들어 저장하면 나중에 디자인을 바꿔도 옛 공지는
--   옛 그림 그대로 남는다. 요점을 줄 단위(points)로 두고 그릴 때마다 카드로 만든다.
--
-- 왜 관리자 전용이 아닌가
--   작성을 관리자로 묶으면 기공소 연락 하나 공유하려고 관리자를 찾아야 한다.
--   올리는 건 로그인한 누구나, 고치고 지우는 건 작성자와 관리자만 (API 에서 확인).
create type notice_category as enum ('sched', 'meet', 'rule');

create table notices (
  id uuid primary key default gen_random_uuid(),
  category notice_category not null,
  title text not null,
  -- 요점 한 줄이 카드 한 장이 된다. 표지(제목) 다음에 이어 붙는다.
  points text[] not null default '{}',
  body text not null default '',
  -- 게시 기간. 끝나면 홈 배너에서 내려가고 목록에만 남는다 (지우지 않는다).
  starts_on date not null default current_date,
  ends_on date not null,
  -- 캘린더에 점을 찍을 날짜. 회의·일정처럼 "그날 무슨 일이 있는" 공지만 채운다.
  event_on date,
  -- 읽음 확인을 받을지. 전부에 붙이면 아무도 안 누른다.
  needs_ack boolean not null default false,
  -- 작성자는 스냅샷이다. 화이트리스트에서 계정을 지워도 "누가 썼는지"는 남아야 한다.
  author_id text not null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 노트와 같이 휴지통 30일. 실수로 지운 공지를 되살릴 수 있어야 한다.
  deleted_at timestamptz
);

create index notices_live_idx on notices (ends_on desc, created_at desc) where deleted_at is null;
create index notices_event_idx on notices (event_on) where deleted_at is null and event_on is not null;

-- 누가 읽었는지. 공지마다 사원번호 한 줄.
create table notice_reads (
  notice_id uuid not null references notices(id) on delete cascade,
  employee_id text not null,
  read_at timestamptz not null default now(),
  primary key (notice_id, employee_id)
);

alter table notices enable row level security;
alter table notice_reads enable row level security;
-- 서버(서비스 롤)에서만 접근한다. 브라우저에서 직접 읽고 쓰지 않는다.
revoke all on notices from anon, authenticated;
revoke all on notice_reads from anon, authenticated;

comment on column notices.points is '요점. 한 줄이 카드뉴스 한 장이 된다.';
comment on column notices.ends_on is '게시 종료일. 지나면 홈 배너에서 내려가고 목록에만 남는다.';
comment on column notices.event_on is '캘린더에 점을 찍을 날짜. 없으면 캘린더에 안 뜬다.';
