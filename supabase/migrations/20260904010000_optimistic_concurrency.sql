-- 문서 동시 편집 충돌을 감지한다 (낙관적 잠금, optimistic concurrency control).
--
-- 왜 필요한가
--   지금까지는 "마지막에 저장한 사람이 이긴다" 방식이었다. A가 문서를 열어 고치는
--   동안 B도 같은 문서를 열어 고치면, B가 저장하는 순간 A의 수정 내용이 아무 경고
--   없이 사라진다. 로그에는 남아 되돌릴 수는 있지만, B는 자기가 A의 작업을
--   덮어썼다는 사실 자체를 모른다.
--
-- 어떻게 감지하는가
--   documents에 version 정수를 두고 수정·되돌리기마다 1씩 올린다. 클라이언트는
--   화면에 띄운 시점의 version을 "이걸 보고 고쳤다"는 뜻으로 함께 보내고, 서버는
--   지금 DB의 version과 다르면 그 사이에 다른 사람이 먼저 저장한 것으로 보고 거부한다.
--
-- updated_at(타임스탬프)이 아니라 정수를 쓰는 이유
--   타임스탬프를 그대로 비교하면, 클라이언트가 JS Date로 한 번 거쳐 오는 과정에서
--   Postgres의 마이크로초 정밀도가 밀리초로 잘리는 등 미묘하게 어긋날 여지가 있다.
--   정수 비교는 그런 여지가 없다.

alter table documents
  add column version int not null default 1;

comment on column documents.version is
  '낙관적 잠금용 버전 번호. 수정·되돌리기마다 1씩 증가한다. 클라이언트가 편집을
   시작한 시점의 값을 다시 보내오면, 그 사이 버전이 바뀌었는지로 동시 편집을 감지한다.';

-- 옛 시그니처를 먼저 지운다. create or replace 는 인자 목록이 다르면 새 함수를
-- 하나 더 만들 뿐 기존 함수를 지우지 않는다 — 이전에 실제로 이 실수로 옛 함수가
-- 오버로드로 남아 조각(chunk)이 갱신되지 않는 문제가 있었다 (20260904000229 마이그레이션).
-- create_document는 인자 목록이 그대로지만 반환 타입(RETURNS TABLE)에 version이
-- 늘어나므로, Postgres는 "기존 함수의 반환 타입을 바꿀 수 없다"며 create or replace를
-- 거부한다. 세 함수 모두 옛 버전을 먼저 지운다.
drop function if exists update_document(uuid, text, text, vector, text, jsonb);
drop function if exists revert_document(uuid, uuid, vector, text, jsonb);
drop function if exists create_document(document_category, text, text, vector, text, jsonb);

create or replace function update_document(
  p_id              uuid,
  p_title           text,
  p_content         text,
  p_embedding       vector(1536),
  p_employee_id     text,
  p_expected_version int,
  p_chunks          jsonb default null
)
returns table (
  id uuid, category document_category, title text, content text,
  created_at timestamptz, updated_at timestamptz, version int
)
language plpgsql
as $$
declare
  v_prev_title   text;
  v_prev_content text;
  v_cur_version  int;
begin
  select d.title, d.content, d.version into v_prev_title, v_prev_content, v_cur_version
    from documents d where d.id = p_id
     for update;

  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if v_cur_version <> p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;

  if v_prev_title = p_title and v_prev_content = p_content then
    raise exception 'NO_CHANGES';
  end if;

  update documents
     set title = p_title, content = p_content,
         embedding = p_embedding, updated_at = now(),
         version = v_cur_version + 1
   where documents.id = p_id;

  insert into document_logs (
    document_id, action, previous_title, previous_content, new_title, new_content, edited_by
  ) values (
    p_id, 'update', v_prev_title, v_prev_content, p_title, p_content, p_employee_id
  );

  perform replace_document_chunks(p_id, p_chunks);

  return query
    select d.id, d.category, d.title, d.content, d.created_at, d.updated_at, d.version
      from documents d where d.id = p_id;
end;
$$;

create or replace function revert_document(
  p_id              uuid,
  p_log_id          uuid,
  p_embedding       vector(1536),
  p_employee_id     text,
  p_expected_version int,
  p_chunks          jsonb default null
)
returns table (
  id uuid, category document_category, title text, content text,
  created_at timestamptz, updated_at timestamptz, version int
)
language plpgsql
as $$
declare
  v_target_title   text;
  v_target_content text;
  v_cur_title      text;
  v_cur_content    text;
  v_cur_version    int;
begin
  select l.new_title, l.new_content into v_target_title, v_target_content
    from document_logs l
   where l.id = p_log_id and l.document_id = p_id;

  if not found then
    raise exception 'LOG_NOT_FOUND';
  end if;

  select d.title, d.content, d.version into v_cur_title, v_cur_content, v_cur_version
    from documents d where d.id = p_id
     for update;

  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if v_cur_version <> p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;

  if v_cur_title = v_target_title and v_cur_content = v_target_content then
    raise exception 'NO_CHANGES';
  end if;

  update documents
     set title = v_target_title, content = v_target_content,
         embedding = p_embedding, updated_at = now(),
         version = v_cur_version + 1
   where documents.id = p_id;

  insert into document_logs (
    document_id, action, previous_title, previous_content, new_title, new_content, edited_by
  ) values (
    p_id, 'revert', v_cur_title, v_cur_content, v_target_title, v_target_content, p_employee_id
  );

  perform replace_document_chunks(p_id, p_chunks);

  return query
    select d.id, d.category, d.title, d.content, d.created_at, d.updated_at, d.version
      from documents d where d.id = p_id;
end;
$$;

-- create_document 는 새 문서라 충돌 개념이 없다. version int 를 반환값에만 추가한다.
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
  created_at timestamptz, updated_at timestamptz, version int
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
    select d.id, d.category, d.title, d.content, d.created_at, d.updated_at, d.version
      from documents d where d.id = v_id;
end;
$$;

revoke all on function update_document(uuid, text, text, vector, text, int, jsonb) from anon, authenticated;
revoke all on function revert_document(uuid, uuid, vector, text, int, jsonb)       from anon, authenticated;
revoke all on function create_document(document_category, text, text, vector, text, jsonb) from anon, authenticated;
