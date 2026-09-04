-- 검색 단위를 문서에서 조각(청크)으로 바꾼다.
--
-- 왜 필요한가
--   문서 하나를 임베딩 하나로 만들면 문서가 길수록 특정 단어의 신호가 묻힌다.
--   실제로 발치 수가 문서(약 2,000자)에 "사랑니 빼는 거 얼마예요?"가 그대로 적혀 있는데도
--   같은 질문의 유사도가 0.27에 그쳐 문턱값 0.5를 넘지 못했다.
--   반면 281자짜리 예시 문서는 0.58을 받았다. 길이가 원인이라는 뜻이다.
--   더 나쁜 것은 순위까지 틀렸다는 점이다 — "사랑니"에 틀니 문서(0.2971)가
--   발치 문서(0.2665)보다 위로 올라왔다.
--
-- 어떻게 바꾸는가
--   문서를 `## ` 절 단위로 쪼개 조각마다 임베딩을 만든다.
--   검색은 조각을 대상으로 하고, 결과는 그 조각이 속한 문서로 묶어서 돌려준다.
--   화면에는 지금처럼 문서 단위로 보이므로 사용자 경험은 그대로다.
--
-- documents.embedding 은 남겨둔다
--   당장 쓰지 않지만, 조각 생성이 실패한 문서를 찾아내는 데 쓸 수 있고
--   되돌릴 여지를 남기기 위해서다.

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

comment on table document_chunks is
  '문서를 절 단위로 쪼갠 검색용 조각. 문서가 수정되면 통째로 다시 만든다.';
comment on column document_chunks.content is
  '임베딩에 넣은 본문. 조각만 봐도 무슨 문서인지 알 수 있게 맨 앞에 문서 제목이 붙어 있다.';

-- 문서가 지워지면 조각도 함께 지운다(on delete cascade). 조각은 원본이 아니라
-- 검색용 파생 데이터이므로 로그처럼 보존할 필요가 없다.

create index document_chunks_embedding_idx
  on document_chunks using hnsw (embedding vector_cosine_ops);
create index document_chunks_document_id_idx on document_chunks(document_id);

-- 20260903061446 마이그레이션의 방침과 동일: 공개용 롤은 접근 불가
alter table document_chunks enable row level security;
revoke all on table document_chunks from anon, authenticated;

-- 조각을 검색해 문서 단위로 묶어 돌려준다.
-- 한 문서에서 여러 조각이 걸리면 가장 비슷한 조각의 점수를 그 문서의 점수로 삼는다.
create or replace function match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  category document_category,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  with scored as (
    select
      c.document_id,
      1 - (c.embedding <=> query_embedding) as similarity,
      c.content as chunk_content,
      row_number() over (
        partition by c.document_id
        order by c.embedding <=> query_embedding
      ) as rank_in_document
    from document_chunks c
    where c.embedding is not null
  )
  select
    d.id,
    d.category,
    d.title,
    -- 답변 근거로는 문서 전체가 아니라 실제로 걸린 조각을 넘긴다.
    -- 문서 전체를 넘기면 관계없는 절까지 AI에게 전달되어 답이 흐려진다.
    s.chunk_content as content,
    s.similarity
  from scored s
  join documents d on d.id = s.document_id
  where s.rank_in_document = 1
    and s.similarity > match_threshold
  order by s.similarity desc
  limit match_count;
$$;
