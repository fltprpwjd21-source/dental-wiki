-- 문서 쓰기와 로그 기록을 하나의 트랜잭션으로 묶는다.
--
-- 이전 방식의 문제
--   API가 (1) documents에 쓰고 (2) document_logs에 쓰는 두 번의 요청을 따로 보냈다.
--   (1)이 성공하고 (2)가 실패하면 "로그가 없는 문서"가 남아, PRD 5번②의
--   "모든 수정 건에 대해 로그를 자동 기록한다"가 깨진다.
--   기존 코드는 이때 500을 돌려주긴 했지만 문서는 이미 저장된 상태로 남았다.
--
-- 해결
--   PL/pgSQL 함수 하나는 하나의 트랜잭션으로 실행된다. 문서 쓰기와 로그 쓰기를
--   같은 함수 안에 넣으면 "둘 다 반영되거나, 둘 다 취소된다"가 DB 차원에서 보장된다.
--
-- 부수 효과: 동시 수정 정리
--   수정·되돌리기 함수는 대상 문서 행을 select ... for update 로 잠근다.
--   두 사람이 같은 문서를 동시에 저장해도 순서대로 처리되어, 문서와 로그가
--   서로 엇갈리게 기록되는 일이 없다. (마지막 저장이 이기는 것은 그대로이며,
--   이전 내용은 로그에 남으므로 되돌릴 수 있다)
--
-- 오류 신호
--   API가 구분해서 처리할 수 있도록 정해진 문구로 예외를 던진다.
--   DOCUMENT_NOT_FOUND / LOG_NOT_FOUND / NO_CHANGES

-- 반환 타입: embedding은 크기가 커서 앱으로 돌려주지 않는다
create or replace function create_document(
  p_category   document_category,
  p_title      text,
  p_content    text,
  p_embedding  vector(1536),
  p_employee_id text
)
returns table (
  id uuid, category document_category, title text, content text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into documents (category, title, content, embedding, created_by)
  values (p_category, p_title, p_content, p_embedding, p_employee_id)
  returning documents.id into v_id;

  -- 최초 등록도 하나의 이력으로 남긴다 (PRD 5번②)
  insert into document_logs (
    document_id, action, previous_title, previous_content, new_title, new_content, edited_by
  ) values (
    v_id, 'create', null, null, p_title, p_content, p_employee_id
  );

  return query
    select d.id, d.category, d.title, d.content, d.created_at, d.updated_at
      from documents d where d.id = v_id;
end;
$$;

create or replace function update_document(
  p_id         uuid,
  p_title      text,
  p_content    text,
  p_embedding  vector(1536),
  p_employee_id text
)
returns table (
  id uuid, category document_category, title text, content text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
as $$
declare
  v_prev_title   text;
  v_prev_content text;
begin
  -- for update: 같은 문서를 동시에 저장하는 요청을 줄 세운다
  select d.title, d.content into v_prev_title, v_prev_content
    from documents d where d.id = p_id
     for update;

  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if v_prev_title = p_title and v_prev_content = p_content then
    raise exception 'NO_CHANGES';
  end if;

  update documents
     set title = p_title, content = p_content,
         embedding = p_embedding, updated_at = now()
   where documents.id = p_id;

  insert into document_logs (
    document_id, action, previous_title, previous_content, new_title, new_content, edited_by
  ) values (
    p_id, 'update', v_prev_title, v_prev_content, p_title, p_content, p_employee_id
  );

  return query
    select d.id, d.category, d.title, d.content, d.created_at, d.updated_at
      from documents d where d.id = p_id;
end;
$$;

create or replace function revert_document(
  p_id         uuid,
  p_log_id     uuid,
  p_embedding  vector(1536),
  p_employee_id text
)
returns table (
  id uuid, category document_category, title text, content text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
as $$
declare
  v_target_title   text;
  v_target_content text;
  v_cur_title      text;
  v_cur_content    text;
begin
  -- 되돌릴 대상 버전. 로그는 수정·삭제가 불가능하므로 이 값은 변하지 않는다
  select l.new_title, l.new_content into v_target_title, v_target_content
    from document_logs l
   where l.id = p_log_id and l.document_id = p_id;

  if not found then
    raise exception 'LOG_NOT_FOUND';
  end if;

  select d.title, d.content into v_cur_title, v_cur_content
    from documents d where d.id = p_id
     for update;

  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if v_cur_title = v_target_title and v_cur_content = v_target_content then
    raise exception 'NO_CHANGES';
  end if;

  update documents
     set title = v_target_title, content = v_target_content,
         embedding = p_embedding, updated_at = now()
   where documents.id = p_id;

  -- 되돌리기도 하나의 수정 이력으로 남긴다 (PRD 5번②)
  insert into document_logs (
    document_id, action, previous_title, previous_content, new_title, new_content, edited_by
  ) values (
    p_id, 'revert', v_cur_title, v_cur_content, v_target_title, v_target_content, p_employee_id
  );

  return query
    select d.id, d.category, d.title, d.content, d.created_at, d.updated_at
      from documents d where d.id = p_id;
end;
$$;

-- 함수는 기본적으로 PUBLIC에 실행 권한이 부여된다. 공개용 롤에서는 회수한다.
-- (테이블 권한이 없어 실제로는 실패하지만, 20260903061446 마이그레이션의 방침과 맞춘다)
revoke all on function create_document(document_category, text, text, vector, text) from anon, authenticated;
revoke all on function update_document(uuid, text, text, vector, text)              from anon, authenticated;
revoke all on function revert_document(uuid, uuid, vector, text)                    from anon, authenticated;
