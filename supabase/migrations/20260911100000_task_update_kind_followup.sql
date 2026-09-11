-- 진행 기록에 「이어서 지시」(followup) 종류를 더한다 (2026-09-11, task-board.plan.md ③)
--
-- 완료 보고를 받은 지시자의 선택지가 둘에서 셋이 된다.
--   완료 확인  → done 으로 종결
--   이어서 지시 → in_progress 로 되돌리고 코멘트를 다음 할 일로 남긴다  ← 이번에 추가
--   반려       → in_progress 로 되돌리고 사유를 남긴다
--
-- 「이어서 지시」와 「반려」는 도달 상태가 같고 진행 기록의 종류로만 갈린다.
-- 별건(parent_task_id)을 만들지 않으므로 한 업무의 이력이 한 건에 모인다.
--
-- 이 파일에 이 값을 '쓰는' 구문은 넣지 않는다. Postgres 는 enum 에 값을 추가한 트랜잭션
-- 안에서 그 값을 참조하지 못하고(unsafe use of new value of enum type), Supabase 는
-- 마이그레이션 파일 하나를 한 트랜잭션으로 돌린다. 그래서 값 추가만 독립 파일로 떼어 둔다.

alter type task_update_kind add value 'followup';
