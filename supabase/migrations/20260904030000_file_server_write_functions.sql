-- file-server 쓰기 작업(업로드 확정/재업로드/휴지통 이동/복구)을 files + file_logs에
-- 한 트랜잭션으로 반영하는 함수들. documents/document_logs에 쓰던 것과 같은 원칙:
-- 실물(Storage)과 메타데이터(files)는 API 라우트에서 순서대로 처리하고, 메타데이터와
-- 로그(file_logs)만큼은 이 함수들 안에서 원자적으로 함께 기록한다.

create or replace function register_uploaded_file(
  p_file_id      uuid,
  p_folder_id    uuid,
  p_name         text,
  p_storage_path text,
  p_size_bytes   bigint,
  p_mime_type    text,
  p_employee_id  text
)
returns table (
  id uuid, folder_id uuid, name text, storage_path text, size_bytes bigint,
  mime_type text, version int, status text, uploaded_by text,
  trashed_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql
as $$
begin
  insert into files (id, folder_id, name, storage_path, size_bytes, mime_type, uploaded_by)
  values (p_file_id, p_folder_id, p_name, p_storage_path, p_size_bytes, p_mime_type, p_employee_id);

  insert into file_logs (file_id, folder_id, action, actor, detail)
  values (p_file_id, p_folder_id, 'upload', p_employee_id,
          jsonb_build_object('name', p_name, 'sizeBytes', p_size_bytes));

  return query
    select f.id, f.folder_id, f.name, f.storage_path, f.size_bytes, f.mime_type,
           f.version, f.status, f.uploaded_by, f.trashed_at, f.created_at, f.updated_at
      from files f where f.id = p_file_id;
end;
$$;

create or replace function reupload_file(
  p_file_id     uuid,
  p_size_bytes  bigint,
  p_mime_type   text,
  p_employee_id text
)
returns table (
  id uuid, folder_id uuid, name text, storage_path text, size_bytes bigint,
  mime_type text, version int, status text, uploaded_by text,
  trashed_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql
as $$
declare
  v_folder_id uuid;
  v_status    text;
  v_version   int;
begin
  select f.folder_id, f.status, f.version into v_folder_id, v_status, v_version
    from files f where f.id = p_file_id
     for update;

  if not found then
    raise exception 'FILE_NOT_FOUND';
  end if;

  if v_status <> 'active' then
    raise exception 'FILE_TRASHED';
  end if;

  update files
     set size_bytes = p_size_bytes, mime_type = p_mime_type,
         version = v_version + 1, updated_at = now()
   where files.id = p_file_id;

  insert into file_logs (file_id, folder_id, action, actor, detail)
  values (p_file_id, v_folder_id, 'reupload', p_employee_id,
          jsonb_build_object('previousVersion', v_version, 'sizeBytes', p_size_bytes));

  return query
    select f.id, f.folder_id, f.name, f.storage_path, f.size_bytes, f.mime_type,
           f.version, f.status, f.uploaded_by, f.trashed_at, f.created_at, f.updated_at
      from files f where f.id = p_file_id;
end;
$$;

create or replace function trash_file(
  p_file_id     uuid,
  p_employee_id text
)
returns table (
  id uuid, folder_id uuid, name text, storage_path text, size_bytes bigint,
  mime_type text, version int, status text, uploaded_by text,
  trashed_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql
as $$
declare
  v_folder_id uuid;
  v_status    text;
begin
  select f.folder_id, f.status into v_folder_id, v_status
    from files f where f.id = p_file_id
     for update;

  if not found then
    raise exception 'FILE_NOT_FOUND';
  end if;

  if v_status = 'trashed' then
    raise exception 'ALREADY_TRASHED';
  end if;

  update files
     set status = 'trashed', trashed_at = now(), updated_at = now()
   where files.id = p_file_id;

  insert into file_logs (file_id, folder_id, action, actor, detail)
  values (p_file_id, v_folder_id, 'trash', p_employee_id, '{}'::jsonb);

  return query
    select f.id, f.folder_id, f.name, f.storage_path, f.size_bytes, f.mime_type,
           f.version, f.status, f.uploaded_by, f.trashed_at, f.created_at, f.updated_at
      from files f where f.id = p_file_id;
end;
$$;

create or replace function restore_file(
  p_file_id     uuid,
  p_employee_id text
)
returns table (
  id uuid, folder_id uuid, name text, storage_path text, size_bytes bigint,
  mime_type text, version int, status text, uploaded_by text,
  trashed_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql
as $$
declare
  v_folder_id uuid;
  v_status    text;
begin
  select f.folder_id, f.status into v_folder_id, v_status
    from files f where f.id = p_file_id
     for update;

  if not found then
    raise exception 'FILE_NOT_FOUND';
  end if;

  if v_status = 'active' then
    raise exception 'NOT_TRASHED';
  end if;

  update files
     set status = 'active', trashed_at = null, updated_at = now()
   where files.id = p_file_id;

  insert into file_logs (file_id, folder_id, action, actor, detail)
  values (p_file_id, v_folder_id, 'restore', p_employee_id, '{}'::jsonb);

  return query
    select f.id, f.folder_id, f.name, f.storage_path, f.size_bytes, f.mime_type,
           f.version, f.status, f.uploaded_by, f.trashed_at, f.created_at, f.updated_at
      from files f where f.id = p_file_id;
end;
$$;

-- 30일 지난 휴지통 파일을 완전 삭제한다. Storage 실물 삭제는 Node(purge-trash API)가
-- 먼저 처리하고, 성공한 파일 id만 이 함수로 넘겨 메타데이터 삭제 + 로그 기록을 원자적으로
-- 처리한다. file_logs.file_id는 files를 참조하는 외래키가 아니므로(document_logs와 동일
-- 원칙), 파일이 지워진 뒤에도 purge 로그는 그대로 남아 이력을 추적할 수 있다.
create or replace function purge_file(
  p_file_id uuid
)
returns void
language plpgsql
as $$
declare
  v_folder_id uuid;
begin
  select f.folder_id into v_folder_id
    from files f where f.id = p_file_id and f.status = 'trashed'
     for update;

  if not found then
    return;
  end if;

  insert into file_logs (file_id, folder_id, action, actor, detail)
  values (p_file_id, v_folder_id, 'purge', 'system', '{}'::jsonb);

  delete from files where files.id = p_file_id;
end;
$$;

revoke all on function register_uploaded_file(uuid, uuid, text, text, bigint, text, text) from anon, authenticated;
revoke all on function reupload_file(uuid, bigint, text, text)                             from anon, authenticated;
revoke all on function trash_file(uuid, text)                                              from anon, authenticated;
revoke all on function restore_file(uuid, text)                                            from anon, authenticated;
revoke all on function purge_file(uuid)                                                    from anon, authenticated;
