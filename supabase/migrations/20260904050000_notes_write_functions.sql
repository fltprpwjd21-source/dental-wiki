-- notes 기능의 쓰기 작업(생성/저장/이름변경/삭제/복구/완전삭제)을
-- nodes + node_logs에 원자적으로 반영하는 함수들.

create or replace function create_folder(p_parent_id uuid, p_name text, p_employee_id text)
returns setof nodes
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into nodes (parent_id, type, name, created_by)
  values (p_parent_id, 'folder', p_name, p_employee_id)
  returning id into v_id;

  insert into node_logs (node_id, action, actor, detail)
  values (v_id, 'create_folder', p_employee_id, jsonb_build_object('name', p_name));

  return query select * from nodes where id = v_id;
end;
$$;

create or replace function create_note(p_parent_id uuid, p_name text, p_content text, p_employee_id text)
returns setof nodes
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into nodes (parent_id, type, name, content, created_by)
  values (p_parent_id, 'note', p_name, coalesce(p_content, ''), p_employee_id)
  returning id into v_id;

  insert into node_logs (node_id, action, actor, detail)
  values (v_id, 'create_note', p_employee_id, jsonb_build_object('name', p_name));

  return query select * from nodes where id = v_id;
end;
$$;

-- Design §4.2: 문서 편집(update_document)과 동일한 낙관적 잠금 패턴.
create or replace function update_note(
  p_id uuid, p_content text, p_expected_version int, p_employee_id text
)
returns setof nodes
language plpgsql
as $$
declare
  v_type text;
  v_status text;
  v_cur_version int;
  v_cur_content text;
begin
  select type, status, version, content into v_type, v_status, v_cur_version, v_cur_content
    from nodes where id = p_id for update;

  if not found then
    raise exception 'NODE_NOT_FOUND';
  end if;
  if v_type <> 'note' then
    raise exception 'NOT_A_NOTE';
  end if;
  if v_status = 'trashed' then
    raise exception 'NODE_TRASHED';
  end if;
  if v_cur_version <> p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;
  if v_cur_content = p_content then
    raise exception 'NO_CHANGES';
  end if;

  update nodes set content = p_content, version = v_cur_version + 1, updated_at = now()
  where id = p_id;

  insert into node_logs (node_id, action, actor, detail)
  values (p_id, 'update_note', p_employee_id, '{}'::jsonb);

  return query select * from nodes where id = p_id;
end;
$$;

create or replace function rename_node(
  p_id uuid, p_name text, p_expected_version int, p_employee_id text
)
returns setof nodes
language plpgsql
as $$
declare
  v_status text;
  v_cur_version int;
  v_cur_name text;
begin
  select status, version, name into v_status, v_cur_version, v_cur_name
    from nodes where id = p_id for update;

  if not found then
    raise exception 'NODE_NOT_FOUND';
  end if;
  if v_status = 'trashed' then
    raise exception 'NODE_TRASHED';
  end if;
  if v_cur_version <> p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;
  if v_cur_name = p_name then
    raise exception 'NO_CHANGES';
  end if;

  update nodes set name = p_name, version = v_cur_version + 1, updated_at = now()
  where id = p_id;

  insert into node_logs (node_id, action, actor, detail)
  values (p_id, 'rename', p_employee_id, jsonb_build_object('from', v_cur_name, 'to', p_name));

  return query select * from nodes where id = p_id;
end;
$$;

create or replace function register_uploaded_image(
  p_id uuid, p_parent_id uuid, p_name text, p_storage_path text,
  p_size_bytes bigint, p_mime_type text, p_employee_id text
)
returns setof nodes
language plpgsql
as $$
begin
  insert into nodes (id, parent_id, type, name, storage_path, size_bytes, mime_type, created_by)
  values (p_id, p_parent_id, 'image', p_name, p_storage_path, p_size_bytes, p_mime_type, p_employee_id);

  insert into node_logs (node_id, action, actor, detail)
  values (p_id, 'upload_image', p_employee_id, jsonb_build_object('name', p_name, 'sizeBytes', p_size_bytes));

  return query select * from nodes where id = p_id;
end;
$$;

-- Design §4.2: 폴더를 지우면 하위 전체(자식의 자식까지)가 함께 휴지통으로 간다.
create or replace function trash_node(p_id uuid, p_employee_id text)
returns setof nodes
language plpgsql
as $$
declare
  v_status text;
  v_ids uuid[];
begin
  select status into v_status from nodes where id = p_id for update;
  if not found then
    raise exception 'NODE_NOT_FOUND';
  end if;
  if v_status = 'trashed' then
    raise exception 'ALREADY_TRASHED';
  end if;

  with recursive subtree as (
    select id from nodes where id = p_id
    union all
    select n.id from nodes n join subtree s on n.parent_id = s.id
  )
  select array_agg(id) into v_ids from subtree;

  update nodes set status = 'trashed', trashed_at = now(), updated_at = now()
  where id = any(v_ids);

  insert into node_logs (node_id, action, actor, detail)
  select id, 'trash', p_employee_id, '{}'::jsonb from unnest(v_ids) as id;

  return query select * from nodes where id = any(v_ids);
end;
$$;

-- 복구도 하위 전체를 함께 되돌린다 (부분 복구는 지원하지 않음, Design §4.2 참고).
create or replace function restore_node(p_id uuid, p_employee_id text)
returns setof nodes
language plpgsql
as $$
declare
  v_status text;
  v_ids uuid[];
begin
  select status into v_status from nodes where id = p_id for update;
  if not found then
    raise exception 'NODE_NOT_FOUND';
  end if;
  if v_status = 'active' then
    raise exception 'NOT_TRASHED';
  end if;

  with recursive subtree as (
    select id from nodes where id = p_id
    union all
    select n.id from nodes n join subtree s on n.parent_id = s.id
  )
  select array_agg(id) into v_ids from subtree;

  update nodes set status = 'active', trashed_at = null, updated_at = now()
  where id = any(v_ids);

  insert into node_logs (node_id, action, actor, detail)
  select id, 'restore', p_employee_id, '{}'::jsonb from unnest(v_ids) as id;

  return query select * from nodes where id = any(v_ids);
end;
$$;

-- 30일 지난 휴지통 노드를 완전삭제한다. 대상 목록(id/type/storage_path)은
-- Node.js가 먼저 조회해 이미지 Storage 실물을 지운 뒤, 그 id 목록을 넘겨
-- 이 함수를 호출한다. 트리 안에서 자식이 부모보다 먼저 지워지도록
-- 리프부터 반복해서 지운다 (외래키 위반 방지).
create or replace function purge_nodes(p_ids uuid[])
returns void
language plpgsql
as $$
declare
  remaining uuid[] := p_ids;
  leaves uuid[];
begin
  while array_length(remaining, 1) > 0 loop
    select array_agg(n.id) into leaves
      from nodes n
     where n.id = any(remaining)
       and not exists (
         select 1 from nodes c where c.parent_id = n.id and c.id = any(remaining)
       );

    exit when leaves is null or array_length(leaves, 1) = 0;

    insert into node_logs (node_id, action, actor, detail)
    select id, 'purge', 'system', '{}'::jsonb from unnest(leaves) as id;

    delete from nodes where id = any(leaves);

    select coalesce(array_agg(x), array[]::uuid[]) into remaining
      from unnest(remaining) as x
     where x <> all(leaves);
  end loop;
end;
$$;

revoke all on function create_folder(uuid, text, text) from anon, authenticated;
revoke all on function create_note(uuid, text, text, text) from anon, authenticated;
revoke all on function update_note(uuid, text, int, text) from anon, authenticated;
revoke all on function rename_node(uuid, text, int, text) from anon, authenticated;
revoke all on function register_uploaded_image(uuid, uuid, text, text, bigint, text, text) from anon, authenticated;
revoke all on function trash_node(uuid, text) from anon, authenticated;
revoke all on function restore_node(uuid, text) from anon, authenticated;
revoke all on function purge_nodes(uuid[]) from anon, authenticated;
