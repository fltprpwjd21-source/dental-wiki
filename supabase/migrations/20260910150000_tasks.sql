-- 업무지시 (PRD ⑨, PLAN 8차 34번) — 2026-09-10
--
-- 지시자 한 명이 담당자 여러 명에게 업무를 내리고, 담당자 전원이 그 지시 하나를
-- 공유하며 진행 기록과 첨부파일을 함께 쌓는다. 담당자가 「완료 보고」를 올리면
-- 지시자가 「완료 확인」을 눌러 종결한다.
--
-- 왜 담당자를 tasks 의 칸이 아니라 별도 표로 두는가
--   담당자가 여러 명이기 때문이다. tasks.assignee_id 한 칸으로는 세 명을 담을 수
--   없고, 쉼표로 이어붙이면 "이 사람이 담당인 지시 목록"을 뽑을 수 없다.
--   반면 진행률·진행 기록·첨부파일은 지시당 하나다 — 사람마다 쪼개진 사본이 아니라
--   한 업무를 나눠 하는 것이므로, 그것들은 tasks 쪽에 그대로 둔다.
--
-- 왜 지시자·담당자 이름을 함께 저장하는가 (스냅샷)
--   퇴사해서 화이트리스트에서 지워져도 "누가 누구에게 시켰는지"는 남아야 한다.
--   documents.created_by 를 스냅샷으로 바꾼 것과 같은 이유다(20260903072111).
--   다만 화면은 화이트리스트의 지금 이름을 먼저 쓰고, 없을 때만 이 값으로 떨어진다
--   (lib/employee-names.ts 의 displayName — 개명이 옛 기록에도 반영되게 하려는 것).

create type task_status as enum ('assigned', 'in_progress', 'submitted', 'done');

-- 진행 기록의 종류. 'submit'(완료 보고)과 'reject'(반려)는 상태를 바꾼 사건이라
-- 나중에 고칠 수 없다 (아래 트리거 참고).
create type task_update_kind as enum ('note', 'submit', 'reject');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null constraint tasks_title_not_blank check (btrim(title) <> ''),
  body text not null default '',

  assigner_id text not null,
  assigner_name text,

  status task_status not null default 'assigned',

  -- 진행률은 장기 업무에만 쓴다. 단기 업무에까지 퍼센트를 요구하면 아무도 안 쓴다
  -- (공지의 「읽음 확인」 버튼을 2026-09-09 에 걷어낸 것과 같은 이유다).
  is_longterm boolean not null default false,
  progress smallint not null default 0
    constraint tasks_progress_range check (progress between 0 and 100),

  -- 완료 보고를 올린 담당자. 반려 알림이 갈 대상이라 누구인지 알아야 한다.
  submitted_by text,

  due_on date,
  submitted_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 보관함과 같은 휴지통 방식. 완전 삭제 경로는 만들지 않는다.
  deleted_at timestamptz,

  -- 상태와 시각이 어긋난 행을 DB 단에서 막는다. 앱이 한쪽만 쓰고 넘어가면
  -- 화면에서 "완료인데 완료 시각이 없는" 카드가 되고, 정렬이 조용히 깨진다.
  constraint tasks_submitted_needs_reporter
    check (status <> 'submitted' or (submitted_by is not null and submitted_at is not null)),
  constraint tasks_done_needs_completed_at
    check (status <> 'done' or completed_at is not null)
);

-- "내가 내린 업무" 목록
create index tasks_assigner_idx on tasks (assigner_id, created_at desc) where deleted_at is null;
-- 정렬: 완료 확인 대기 → 마감 임박
create index tasks_status_due_idx on tasks (status, due_on) where deleted_at is null;

-- 담당자 명단. 한 지시에 여러 줄이 생긴다.
create table task_assignees (
  task_id uuid not null references tasks(id) on delete cascade,
  employee_id text not null,
  employee_name text,

  -- 「확인」 체크. 담당자마다 갈리는 유일한 값이다 — 누가 아직 안 봤는지 알아야 하므로.
  acked_at timestamptz,
  -- 반려 배지를 언제 봤는지. 최신 반려 기록보다 이르면 배지를 띄운다.
  rejection_seen_at timestamptz,

  primary key (task_id, employee_id)
);

-- "내가 해야 할 업무" 목록
create index task_assignees_employee_idx on task_assignees (employee_id);

-- 진행 기록. 담당자 전원과 지시자가 함께 쌓는다.
create table task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,

  author_id text not null,
  author_name text,

  kind task_update_kind not null default 'note',
  -- 빈 기록은 남기지 않는다. 반려 사유를 필수로 만드는 것도 이 제약이다 —
  -- 사유 없이 되돌리면 담당자는 무엇을 고쳐야 할지 알 수 없다.
  body text not null constraint task_updates_body_not_blank check (btrim(body) <> ''),

  -- 이 기록 시점의 진행률. 안 바꿨으면 null 이다.
  -- tasks.progress 는 이 값들 중 가장 최근 것의 캐시이고, 추이는 여기 남는다.
  progress smallint
    constraint task_updates_progress_range check (progress is null or progress between 0 and 100),

  created_at timestamptz not null default now(),
  -- 본문을 고친 적이 있으면 그 시각. 화면에 "(수정됨)"으로 표시한다.
  edited_at timestamptz
);

create index task_updates_task_idx on task_updates (task_id, created_at desc);

-- 첨부파일. 지시문에 붙으면 update_id 가 null, 진행 기록에 붙으면 그 기록을 가리킨다.
-- 어느 쪽이든 task_id 로 묶이므로 담당자 전원이 함께 본다.
create table task_attachments (
  id uuid primary key,
  task_id uuid not null references tasks(id) on delete cascade,
  update_id uuid references task_updates(id) on delete cascade,

  name text not null,
  size_bytes bigint not null,
  mime_type text not null,
  -- 스토리지 경로는 {taskId}/{attachmentId} 로 만든다 (lib/file-storage.ts).
  -- unique 를 걸어 같은 오브젝트를 두 줄이 가리키는 상태를 막는다 — 그러면 한 줄을
  -- 지울 때 다른 줄이 가리키는 실물까지 사라진다.
  storage_path text not null unique,

  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create index task_attachments_task_idx on task_attachments (task_id);

-- 진행 기록은 지울 수 없고, 고칠 수 있는 것은 본문뿐이다.
--
-- 왜 문서 로그(document_logs)처럼 통째로 막지 않는가
--   진행 기록은 기계가 남긴 로그가 아니라 사람이 쓴 글이다. 오타 하나 때문에
--   기록이 영원히 남는 것은 과하다. 그래서 본문 수정은 열어둔다.
-- 왜 그래도 대부분 막는가
--   「완료 보고」와 「반려」는 상태를 바꾼 사건이고, 나중에 "누가 언제 완료했다고
--   했는지"의 근거가 된다. 고칠 수 있으면 근거가 되지 못한다. 작성자·시각·진행률도
--   마찬가지라 본문 외에는 전부 잠근다.
create function forbid_task_update_mutation() returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    raise exception '업무지시 진행 기록은 삭제할 수 없습니다 (PRD ⑨)';
  end if;

  if OLD.kind <> 'note' then
    raise exception '완료 보고·반려 기록은 고칠 수 없습니다 (kind=%)', OLD.kind;
  end if;

  if NEW.id is distinct from OLD.id
     or NEW.task_id is distinct from OLD.task_id
     or NEW.author_id is distinct from OLD.author_id
     or NEW.author_name is distinct from OLD.author_name
     or NEW.kind is distinct from OLD.kind
     or NEW.progress is distinct from OLD.progress
     or NEW.created_at is distinct from OLD.created_at then
    raise exception '진행 기록에서 고칠 수 있는 것은 본문뿐입니다';
  end if;

  NEW.edited_at := now();
  return NEW;
end;
$$ language plpgsql;

create trigger task_updates_guard_update before update on task_updates
  for each row execute function forbid_task_update_mutation();
create trigger task_updates_no_delete before delete on task_updates
  for each row execute function forbid_task_update_mutation();

-- 브라우저에서 직접 읽고 쓰지 않는다. 서버(서비스 롤)만 접근한다.
-- 업무지시는 앱에서 유일하게 열람이 제한되는 화면이라(지시자·담당자만),
-- 이 차단이 없으면 그 규칙이 무의미해진다.
alter table tasks enable row level security;
alter table task_assignees enable row level security;
alter table task_updates enable row level security;
alter table task_attachments enable row level security;

revoke all on tasks from anon, authenticated;
revoke all on task_assignees from anon, authenticated;
revoke all on task_updates from anon, authenticated;
revoke all on task_attachments from anon, authenticated;

comment on table tasks is '업무지시 본체. 담당자는 task_assignees 에 있다 (PRD ⑨).';
comment on column tasks.progress is '진행률 0~100. task_updates.progress 중 최신 값의 캐시이며, 반려하면 0 으로 되돌린다.';
comment on column tasks.submitted_by is '완료 보고를 올린 담당자 사원번호. 반려 알림이 갈 대상이다.';
comment on column task_assignees.acked_at is '「확인」 체크 시각. 담당자마다 갈리는 유일한 값이다.';
comment on column task_updates.kind is 'note=진행 기록, submit=완료 보고, reject=반려. note 외에는 수정할 수 없다.';
comment on column task_attachments.update_id is 'null 이면 지시문 첨부, 값이 있으면 그 진행 기록의 첨부.';
