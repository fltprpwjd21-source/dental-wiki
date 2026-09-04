-- 파일함(file_folders/files/file_logs)을 트리형 노트(nodes/node_logs)로 교체한다.
--
-- 왜 바꾸는가
--   실제로 필요했던 건 "파일을 올리고 받는" 기능이 아니라, 상위/하위 폴더로
--   정리되는 트리 안에서 마크다운 노트를 쓰고 사진을 바로 볼 수 있는 메모장이었다
--   (docs/01-plan/features/notes.plan.md 참고). 옵시디언의 "볼트(vault) = 파일
--   트리" 모델처럼, 폴더·노트·이미지를 별도 테이블로 나누지 않고 하나의 nodes
--   테이블에서 type으로만 구분한다 — 트리 조회가 테이블 하나로 끝난다.
--
-- 기존 데이터는 지우지 않고 옮긴다
--   실제로 "치주과 인수인계" 폴더를 만들고 사진을 하나 올려본 흔적이 있어서,
--   같은 id를 유지한 채 새 구조로 백필한다.

create table nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references nodes(id),
  type text not null check (type in ('folder', 'note', 'image')),
  name text not null,
  content text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  version int not null default 1,
  status text not null default 'active' check (status in ('active', 'trashed')),
  created_by text not null,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint note_has_content check (type <> 'note' or content is not null),
  constraint image_has_storage check (type <> 'image' or storage_path is not null),
  constraint folder_has_no_payload check (type <> 'folder' or (content is null and storage_path is null))
);
create index nodes_parent_id_idx on nodes(parent_id);
create index nodes_name_search_idx on nodes using gin (to_tsvector('simple', name));
create index nodes_trashed_at_idx on nodes(trashed_at) where status = 'trashed';

create table node_logs (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null,
  action text not null check (action in
    ('create_folder', 'create_note', 'update_note', 'upload_image',
     'rename', 'trash', 'restore', 'purge')),
  actor text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index node_logs_node_id_idx on node_logs(node_id);

-- document_logs/file_logs와 같은 함수를 재사용해 수정·삭제를 차단한다
create trigger node_logs_no_update before update on node_logs
  for each row execute function file_logs_block_mutation();
create trigger node_logs_no_delete before delete on node_logs
  for each row execute function file_logs_block_mutation();

alter table nodes enable row level security;
alter table node_logs enable row level security;
revoke all on nodes from anon, authenticated;
revoke all on node_logs from anon, authenticated;

-- ── 기존 파일함 데이터 백필 (id를 그대로 유지) ──────────────────────────
insert into nodes (id, parent_id, type, name, version, status, created_by, created_at, updated_at)
select id, null, 'folder', name, 1, 'active', created_by, created_at, created_at
from file_folders;

insert into nodes (
  id, parent_id, type, name, storage_path, mime_type, size_bytes,
  version, status, created_by, trashed_at, created_at, updated_at
)
select
  id, folder_id, 'image', name, storage_path, mime_type, size_bytes,
  version, status, uploaded_by, trashed_at, created_at, updated_at
from files;

insert into node_logs (id, node_id, action, actor, detail, created_at)
select
  id, file_id,
  case action when 'upload' then 'upload_image' else action end,
  actor, detail, created_at
from file_logs;

-- ── 옛 구조 정리 ─────────────────────────────────────────────────────
drop function if exists register_uploaded_file(uuid, uuid, text, text, bigint, text, text);
drop function if exists reupload_file(uuid, bigint, text, text);
drop function if exists trash_file(uuid, text);
drop function if exists restore_file(uuid, text);
drop function if exists purge_file(uuid);

drop table if exists file_logs;
drop table if exists files;
drop table if exists file_folders;
