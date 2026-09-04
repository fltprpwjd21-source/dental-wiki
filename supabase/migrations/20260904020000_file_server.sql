-- file-server 기능(Design §3.3): 폴더별 접근권한을 가진 사내 파일함
-- 위키 문서(documents/document_logs)와는 완전히 분리된 테이블

create table file_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  visibility text not null check (visibility in ('public', 'admin_only')),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table files (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references file_folders(id),
  name text not null,
  storage_path text not null,
  size_bytes bigint not null,
  mime_type text not null,
  version int not null default 1,
  status text not null default 'active' check (status in ('active', 'trashed')),
  uploaded_by text not null,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index files_folder_id_idx on files(folder_id);
create index files_name_search_idx on files using gin (to_tsvector('simple', name));
create index files_trashed_at_idx on files(trashed_at) where status = 'trashed';

create table file_logs (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null,
  folder_id uuid not null,
  action text not null check (action in ('upload', 'reupload', 'trash', 'restore', 'purge')),
  actor text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index file_logs_file_id_idx on file_logs(file_id);

-- document_logs와 동일한 원칙: 로그는 한 번 쓰면 수정·삭제할 수 없다
create or replace function file_logs_block_mutation() returns trigger as $$
begin
  raise exception 'file_logs 테이블은 수정·삭제할 수 없습니다';
end;
$$ language plpgsql;

create trigger file_logs_no_update
  before update on file_logs
  for each row execute function file_logs_block_mutation();

create trigger file_logs_no_delete
  before delete on file_logs
  for each row execute function file_logs_block_mutation();

-- 이 프로젝트 전역 방침: RLS는 anon/authenticated 권한을 전부 회수해 차단하고
-- service_role(서버 코드)만 접근한다 (documents 테이블과 동일한 모델)
alter table file_folders enable row level security;
alter table files enable row level security;
alter table file_logs enable row level security;

revoke all on file_folders from anon, authenticated;
revoke all on files from anon, authenticated;
revoke all on file_logs from anon, authenticated;
