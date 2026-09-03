-- 제목 수정을 가능하게 하기 위한 준비: 수정 로그에 제목 이력 칸을 추가한다.
--
-- 왜 필요한가
--   지금까지 문서 제목은 수정할 수 없었고(수정 API가 본문만 받았다), 그래서
--   document_logs에도 본문(previous_content / new_content)만 기록돼 있다.
--   제목을 수정 가능하게 만들면서 제목 변경을 기록하지 않으면
--   PRD 5번②("변경 전/후 내용을 로그로 자동 기록")가 제목에 대해서는 깨지고,
--   되돌리기도 제목을 복원할 수 없다.
--
-- 기존 로그를 현재 제목으로 채우는 것이 정확한 이유
--   제목은 애초에 수정할 수단이 없었으므로, 과거 어느 시점에도 제목은 현재와 같았다.
--   따라서 backfill 값은 추정이 아니라 사실이다.
--   단, action='create' 는 "이전 값"이 없으므로 previous_title도 NULL로 둔다
--   (previous_content가 NULL인 것과 같은 규칙).

alter table document_logs
  add column previous_title text,
  add column new_title text;

-- backfill 동안에는 로그 불변성 트리거를 잠시 끈다.
--   이 트리거의 목적은 "앱이 이미 기록된 로그를 고치거나 지우지 못하게" 막는 것이다.
--   여기서 하는 일은 로그 내용의 변경이 아니라, 방금 추가한 빈 칸을 그 시점의
--   사실대로 채우는 스키마 이관이다. 이 마이그레이션 안에서만 끄고 즉시 되돌린다.
--   (이 문장들은 하나의 트랜잭션이므로, 중간에 실패하면 트리거도 원상복구된다)
alter table document_logs disable trigger document_logs_no_update;

update document_logs l
   set new_title = d.title,
       previous_title = case when l.action = 'create' then null else d.title end
  from documents d
 where d.id = l.document_id;

alter table document_logs enable trigger document_logs_no_update;

-- backfill이 끝났으므로 new_content와 동일한 제약을 걸 수 있다
alter table document_logs
  alter column new_title set not null;

comment on column document_logs.previous_title is
  '수정 전 제목. action=create 인 경우 NULL (previous_content와 같은 규칙).';
comment on column document_logs.new_title is
  '수정 후 제목. 되돌리기는 이 값으로 제목을 복원한다.';
