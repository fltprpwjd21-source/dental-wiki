-- 공지를 단순하게 되돌린다.
--
-- 처음에는 요점을 줄 단위(points)로 나눠 카드뉴스 슬라이드 여러 장을 만들려 했다.
-- 그런데 공지를 여는 사람은 슬라이드를 넘기고 싶은 게 아니라 내용을 바로 보고 싶다.
-- 카드는 홈 배너에서 '들어가는 문' 역할만 하고, 누르면 그냥 공지 본문이 열린다.
drop table if exists notice_reads;
drop table if exists notices;
drop type if exists notice_category;

create type notice_category as enum ('sched', 'meet', 'rule');

create table notices (
  id uuid primary key default gen_random_uuid(),
  category notice_category not null,
  title text not null,
  -- 홈 카드에 한 줄로 보이는 요약. 작성할 때 본문(또는 연결한 노트)에서 잘라 채운다.
  -- 볼 때마다 노트를 다시 읽지 않으려고 저장해 둔다.
  summary text not null default '',
  body text not null default '',

  -- 연결된 원본. 노트나 문서를 그대로 공지로 올릴 때 쓴다.
  --   내용을 복사하지 않고 연결만 한다 — 원본을 고치면 공지에서도 최신 내용이 보인다.
  --   ("업무 프로세스가 바뀌어 인수인계 자료를 고쳤다"가 바로 이 경우다)
  --   원본이 지워지면 연결만 끊고 공지는 남긴다.
  source_note_id uuid references nodes(id) on delete set null,
  source_document_id uuid references documents(id) on delete set null,

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
  -- 노트와 같이 휴지통 30일.
  deleted_at timestamptz
);

create index notices_live_idx on notices (ends_on desc, created_at desc) where deleted_at is null;
create index notices_event_idx on notices (event_on) where deleted_at is null and event_on is not null;

create table notice_reads (
  notice_id uuid not null references notices(id) on delete cascade,
  employee_id text not null,
  read_at timestamptz not null default now(),
  primary key (notice_id, employee_id)
);

alter table notices enable row level security;
alter table notice_reads enable row level security;
revoke all on notices from anon, authenticated;
revoke all on notice_reads from anon, authenticated;

comment on column notices.summary is '홈 카드에 보이는 한 줄. 본문이나 연결한 노트에서 잘라 채운다.';
comment on column notices.source_note_id is '연결한 노트. 복사가 아니라 연결이라 원본을 고치면 공지도 최신 내용이 된다.';
comment on column notices.ends_on is '게시 종료일. 지나면 홈 배너에서 내려가고 목록에만 남는다.';
