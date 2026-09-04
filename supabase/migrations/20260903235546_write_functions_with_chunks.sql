-- 문서 쓰기 함수가 검색용 조각(청크)까지 한 트랜잭션 안에서 다시 만들도록 바꾼다.
--
-- 왜 함수 안에서 처리하는가
--   문서 본문과 조각이 어긋나면 검색 결과가 실제 문서와 달라진다.
--   본문만 바뀌고 조각이 옛것으로 남으면, 직원이 검색으로 옛 금액을 보게 된다.
--   그래서 문서 갱신·로그 기록·조각 재생성을 하나의 트랜잭션으로 묶는다.
--
-- 조각 임베딩은 왜 인자로 받는가
--   임베딩은 OpenAI 호출이라 DB 함수 안에서 만들 수 없다. 그래서 API가 조각을 만들고
--   임베딩까지 받아온 뒤, 그 결과를 jsonb 배열로 넘긴다.
--   형식: [{"content": "...", "embedding": [1536개 숫자]}, ...]

-- 조각을 통째로 다시 심는다. 조각은 원본이 아니라 파생 데이터라 지우고 다시 만든다.
create or replace function replace_document_chunks(p_document_id uuid, p_chunks jsonb)
returns void
language plpgsql
as $$
begin
  delete from document_chunks where document_id = p_document_id;

  if p_chunks is null or jsonb_array_length(p_chunks) = 0 then
    return;
  end if;

  insert into document_chunks (document_id, chunk_index, content, embedding)
  select
    p_document_id,
    (ordinality - 1)::int,
    item->>'content',
    (item->>'embedding')::vector(1536)
  from jsonb_array_elements(p_chunks) with ordinality as t(item, ordinality);
end;
$$;

create or replace function create_document(
  p_category   document_category,
  p_title      text,
  p_content    text,
  p_embedding  vector(1536),
  p_employee_id text,
  p_chunks     jsonb default null
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

  insert into document_logs (
    document_id, action, previous_title, previous_content, new_title, new_content, edited_by
  ) values (
    v_id, 'create', null, null, p_title, p_content, p_employee_id
  );

  perform replace_document_chunks(v_id, p_chunks);

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
  p_employee_id text,
  p_chunks     jsonb default null
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

  perform replace_document_chunks(p_id, p_chunks);

  return query
    select d.id, d.category, d.title, d.content, d.created_at, d.updated_at
      from documents d where d.id = p_id;
end;
$$;

create or replace function revert_document(
  p_id         uuid,
  p_log_id     uuid,
  p_embedding  vector(1536),
  p_employee_id text,
  p_chunks     jsonb default null
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

  insert into document_logs (
    document_id, action, previous_title, previous_content, new_title, new_content, edited_by
  ) values (
    p_id, 'revert', v_cur_title, v_cur_content, v_target_title, v_target_content, p_employee_id
  );

  perform replace_document_chunks(p_id, p_chunks);

  return query
    select d.id, d.category, d.title, d.content, d.created_at, d.updated_at
      from documents d where d.id = p_id;
end;
$$;

revoke all on function replace_document_chunks(uuid, jsonb) from anon, authenticated;
revoke all on function create_document(document_category, text, text, vector, text, jsonb) from anon, authenticated;
revoke all on function update_document(uuid, text, text, vector, text, jsonb)              from anon, authenticated;
revoke all on function revert_document(uuid, uuid, vector, text, jsonb)                    from anon, authenticated;
