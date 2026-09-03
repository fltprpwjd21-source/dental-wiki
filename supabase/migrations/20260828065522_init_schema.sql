-- PLAN.md 작업 1: 문서·카테고리·수정로그·사원번호 화이트리스트(관리자 여부 포함) 데이터 구조
-- DESIGN.md 3장 기준: pgvector로 의미 검색용 임베딩 저장 (OpenAI text-embedding-3-small = 1536차원)

create extension if not exists vector;

-- 문서 카테고리: PRD 6번에 정의된 3가지로 고정
create type document_category as enum (
  'handover',      -- 진료과별 인수인계
  'insurance',     -- 보험·비보험 수가
  'policy'         -- 병원 내규·운영회칙
);

-- 사원번호 화이트리스트: 로그인 허용 목록 + 관리자 여부(PRD 7번)
create table employee_whitelist (
  employee_id text primary key,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 문서: 위키 본문 + 의미 검색용 임베딩
create table documents (
  id uuid primary key default gen_random_uuid(),
  category document_category not null,
  title text not null,
  content text not null,
  embedding vector(1536),
  created_by text not null references employee_whitelist(employee_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);

create index documents_category_idx on documents(category);

-- 수정 로그: 최초 등록도 하나의 로그로 남김 (PRD 5번②), 되돌리기 대상
create type document_log_action as enum ('create', 'update', 'revert');

create table document_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id),
  action document_log_action not null,
  previous_content text,
  new_content text not null,
  edited_by text not null references employee_whitelist(employee_id),
  edited_at timestamptz not null default now()
);

create index document_logs_document_id_idx on document_logs(document_id);

-- PRD 5번②: 기록된 로그는 수정·삭제할 수 없다 → DB 트리거로 강제
create function forbid_log_mutation() returns trigger as $$
begin
  raise exception 'document_logs 테이블은 수정·삭제할 수 없습니다 (PRD 5번② 규칙)';
end;
$$ language plpgsql;

create trigger document_logs_no_update
  before update on document_logs
  for each row execute function forbid_log_mutation();

create trigger document_logs_no_delete
  before delete on document_logs
  for each row execute function forbid_log_mutation();
