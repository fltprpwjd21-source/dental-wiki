-- 진행 기록 삭제 금지에 예외를 하나 둔다: 지시 자체가 완전 삭제될 때 (2026-09-10)
--
-- 무엇이 문제였나
--   20260910150000_tasks.sql 에서 task_updates 에 두 가지를 함께 걸었다.
--     - tasks 를 지우면 진행 기록도 따라 지워진다 (on delete cascade)
--     - 진행 기록은 삭제할 수 없다 (트리거)
--   이 둘은 정면으로 부딪힌다. tasks 한 줄을 지우면 cascade 가 진행 기록 삭제를
--   시도하고, 트리거가 예외를 던지고, 트랜잭션 전체가 롤백된다. 결과적으로
--   업무지시는 어떤 방법으로도 완전 삭제할 수 없었다.
--
--   평소에는 드러나지 않는다 — 삭제는 deleted_at 을 채우는 휴지통 방식이기 때문이다.
--   드러나는 곳은 나중에 붙일 휴지통 비우기다. 첨부파일 실물이 스토리지에 쌓이므로
--   보관함처럼 기간이 지난 것을 실제로 지워야 하는데(TRASH_RETENTION_DAYS 7일),
--   그때 이 벽에 부딪힌다. 보관함에서 같은 순서를 어겼다가 고아 파일과 롤백을
--   겪은 적이 있다 (LESSONS §9-1).
--
-- 어떻게 고치는가
--   "지시가 아직 살아 있는 동안에는 진행 기록을 지울 수 없다"로 규칙을 좁힌다.
--   cascade 로 지워질 때는 부모 tasks 행이 이미 없으므로 통과하고, 그 외의
--   모든 삭제 시도는 그대로 막힌다. 사람이 기록만 골라 지우는 길은 여전히 없다.
--
--   보관함은 같은 문제를 다르게 풀었다 — node_logs 에 외래키를 아예 걸지 않아
--   기록이 노트보다 오래 남는다. 업무지시는 그 방식을 쓰지 않는다. 진행 기록은
--   기계가 남긴 로그가 아니라 사람이 쓴 글이고 첨부파일까지 매달려 있어서,
--   지시가 사라진 뒤 홀로 남으면 지울 방법도 볼 방법도 없는 쓰레기가 된다.

create or replace function forbid_task_update_mutation() returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    -- 지시가 아직 있으면 기록만 골라 지우려는 것이다 — 막는다.
    -- 지시가 이미 없으면 cascade 로 함께 정리되는 중이다 — 통과시킨다.
    if exists (select 1 from tasks where id = OLD.task_id) then
      raise exception '업무지시 진행 기록은 삭제할 수 없습니다 (PRD ⑨)';
    end if;
    return OLD;
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
