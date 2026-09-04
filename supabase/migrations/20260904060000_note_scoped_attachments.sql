-- 사진·PDF를 트리에서 독립적으로 보이는 노드가 아니라, 특정 노트에 속한
-- 첨부파일로 바꾼다 ("노트가 베이스, 첨부는 그 안에 딸린 것" — 노트 앱과 동일한 개념).
--
-- 무엇이 바뀌는가
--   - 노드 타입 'image' -> 'attachment' (사진 외에 PDF도 다룰 수 있도록 이름을 넓힘)
--   - attachment의 parent_id는 이제 반드시 note여야 한다 (기존에는 folder였다).
--     이 제약은 API 계층에서 검사한다(디비 체크 제약으로는 "부모의 type"을 표현하기
--     어렵다) — 여기서는 타입 이름과 로그 액션만 정리한다.
--   - node_logs의 'upload_image' 액션명을 'upload_attachment'로 통일한다.
--
-- 기존 데이터 처리
--   지금 있는 attachment 1건("스크린샷 ....png")은 폴더 바로 밑에 있어 새 모델(반드시
--   note 밑)에 맞지 않는다. 사용자가 직접 올려본 실제 데이터라 삭제하지 않고 그대로
--   두되, 화면 트리에는 노트의 자식일 때만 나타나므로 이 건은 더 이상 화면에 보이지
--   않는다 (API로 직접 조회는 계속 가능, 필요하면 나중에 노트를 만들어 옮길 수 있다).

-- 먼저 옛 체크 제약을 전부 지운 다음 데이터를 바꾸고, 마지막에 새 체크 제약을
-- 건다. 데이터를 먼저 바꾸면(옛 제약이 아직 살아있는 상태) 'attachment'가 옛
-- 허용값에 없어서 실패하고, 반대로 제약만 먼저 좁히면 아직 'image'인 기존 행이
-- 새 허용값에 없어서 실패한다 — 그래서 반드시 "제약 제거 → 데이터 변경 → 제약
-- 추가" 순서여야 한다.
alter table nodes drop constraint image_has_storage;
alter table nodes drop constraint folder_has_no_payload;
alter table nodes drop constraint nodes_type_check;
alter table node_logs drop constraint node_logs_action_check;

update nodes set type = 'attachment' where type = 'image';

-- node_logs는 불변 로그라 수정을 막는 트리거가 걸려 있다 — 이 한 줄만 예외적으로
-- 잠깐 끄고 옛 액션명을 새 이름으로 맞춘 뒤 바로 다시 켠다.
alter table node_logs disable trigger node_logs_no_update;
update node_logs set action = 'upload_attachment' where action = 'upload_image';
alter table node_logs enable trigger node_logs_no_update;

alter table nodes add constraint attachment_has_storage
  check (type <> 'attachment' or storage_path is not null);
alter table nodes add constraint folder_has_no_payload
  check (type <> 'folder' or (content is null and storage_path is null));
alter table nodes add constraint nodes_type_check
  check (type in ('folder', 'note', 'attachment'));
alter table node_logs add constraint node_logs_action_check
  check (action in
    ('create_folder', 'create_note', 'update_note', 'upload_attachment',
     'rename', 'trash', 'restore', 'purge'));

drop function if exists register_uploaded_image(uuid, uuid, text, text, bigint, text, text);

create or replace function register_uploaded_attachment(
  p_id uuid, p_note_id uuid, p_name text, p_storage_path text,
  p_size_bytes bigint, p_mime_type text, p_employee_id text
)
returns setof nodes
language plpgsql
as $$
begin
  insert into nodes (id, parent_id, type, name, storage_path, size_bytes, mime_type, created_by)
  values (p_id, p_note_id, 'attachment', p_name, p_storage_path, p_size_bytes, p_mime_type, p_employee_id);

  insert into node_logs (node_id, action, actor, detail)
  values (p_id, 'upload_attachment', p_employee_id, jsonb_build_object('name', p_name, 'sizeBytes', p_size_bytes));

  return query select * from nodes where id = p_id;
end;
$$;

revoke all on function register_uploaded_attachment(uuid, uuid, text, text, bigint, text, text) from anon, authenticated;
