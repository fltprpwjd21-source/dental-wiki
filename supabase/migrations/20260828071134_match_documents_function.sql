-- PLAN.md 작업 5: 질문 임베딩과 문서 임베딩의 코사인 유사도로 관련 문서를 찾는 함수
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
  select
    documents.id,
    documents.category,
    documents.title,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.embedding is not null
    and 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;
