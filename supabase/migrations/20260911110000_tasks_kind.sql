-- 업무보고를 업무지시와 같은 테이블에서 다룬다 (2026-09-11, task-board.plan.md ②)
--
-- 지시 없이 개인이 먼저 올리는 보고가 필요해졌다. 별도 테이블을 만들면 상태 기계·진행
-- 기록·첨부가 전부 두 벌이 되는데, 보고도 결국 "누가 누구에게 무엇을 어디까지" + 스레드
-- + 컨펌이라 구조가 같다. 그래서 tasks 에 kind 를 두고 필드의 '의미'만 뒤집는다.
--
--   kind='instruction' : assigner_id = 지시를 낸 사람,   task_assignees = 일을 할 사람
--   kind='report'      : assigner_id = 보고를 받을 사람, task_assignees = 보고한 사람
--
-- 어느 쪽이든 "완료 확인·이어서 지시·반려를 누를 수 있는 사람"이 assigner_id 라는 점은
-- 같다. 덕분에 lib/tasks.ts 의 canApprove()/canReject() 를 그대로 쓴다.
--
-- 보고는 만들어지는 순간 이미 올라온 것이므로 status='submitted' 로 시작한다.

create type task_kind as enum ('instruction', 'report');

alter table tasks
  add column kind task_kind not null default 'instruction';

-- 게시판은 종류에 상관없이 최근 갱신순으로 훑고, 「내 보고함」은 종류로 좁힌다.
create index tasks_kind_updated_idx on tasks (kind, updated_at desc) where deleted_at is null;

comment on column tasks.kind is
  'instruction=업무지시(assigner_id 가 지시자), report=업무보고(assigner_id 가 보고를 받는 사람). 어느 쪽이든 완료 확인·이어서 지시·반려 권한자는 assigner_id 다.';

comment on column tasks.assigner_id is
  'kind=instruction 이면 지시를 낸 사람, kind=report 이면 보고를 받을 사람. 두 경우 모두 완료 확인·이어서 지시·반려를 누르는 사람이다.';

-- 20260910150000_tasks.sql 에서 만든 예외 문구가 새 종류를 빠뜨린다. 문구만 고친다.
-- 판정 조건(OLD.kind <> 'note')은 그대로라 followup 도 이미 수정·삭제가 막혀 있다.
create or replace function forbid_task_update_mutation() returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    raise exception '업무지시 진행 기록은 삭제할 수 없습니다 (PRD ⑨)';
  end if;

  if OLD.kind <> 'note' then
    raise exception '완료 보고·반려·이어서 지시 기록은 고칠 수 없습니다 (kind=%)', OLD.kind;
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

comment on column task_updates.kind is
  'note=진행 기록, submit=완료 보고, reject=반려, followup=이어서 지시. note 외에는 수정할 수 없다.';
