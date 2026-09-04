-- 검색을 "의미(임베딩) + 키워드" 두 갈래를 합친 방식으로 바꾼다.
--
-- 왜 필요한가
--   임베딩만 쓰면 한국어 고유명사에서 자주 틀린다. 실제로 측정한 결과:
--     "사랑니 빼는 거 얼마예요?"  → 틀니 0.2989 > 발치 0.2879   (오답)
--     "실란트 보험 되나요?"       → 틀니 0.2571 > 치석제거 0.2526 (오답)
--   두 경우 모두 정답 문서에 그 단어가 그대로 적혀 있는데도 밀렸다.
--   같은 질문을 키워드로 찾으면 둘 다 1위로 정확히 맞혔다
--   (발치 0.6051, 치석제거 0.3411).
--
-- 어떻게 합치는가
--   의미 점수 0.6 + 키워드 점수 0.4 의 가중합을 쓴다.
--   의미 검색은 "신경치료"처럼 표현이 달라도 찾아주고,
--   키워드 검색은 "사랑니"처럼 정확한 낱말을 놓치지 않는다. 서로의 약점을 메운다.
--
-- to_tsvector('simple') 을 쓰는 이유
--   Postgres 에 한국어 형태소 분석기가 기본으로 없다. 'simple' 은 공백과 문장부호로만
--   자르는데, 한국어는 어절이 공백으로 구분되어 실용적으로 잘 맞는다.
--   위 측정도 이 방식으로 한 결과다.

-- 키워드 검색용 색인. content 가 바뀌면 자동으로 따라 갱신된다.
alter table document_chunks
  add column content_tsv tsvector
  generated always as (to_tsvector('simple', content)) stored;

create index document_chunks_tsv_idx on document_chunks using gin (content_tsv);

-- 질문 원문을 함께 받아야 키워드 검색을 할 수 있어 인자가 하나 늘었다.
-- 옛 함수는 아래에서 지운다 (인자가 다르면 Postgres 가 새 함수를 만들기 때문).
create or replace function match_documents(
  query_embedding vector(1536),
  query_text text,
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
  with q as (
    select websearch_to_tsquery('simple', query_text) as tsq
  ),
  scored as (
    select
      c.document_id,
      c.content as chunk_content,
      -- 의미 점수(0~1)와 키워드 점수를 가중합한다
      0.6 * (1 - (c.embedding <=> query_embedding))
      + 0.4 * coalesce(
          case when c.content_tsv @@ q.tsq
               then least(ts_rank(c.content_tsv, q.tsq), 1.0)
               else 0 end, 0) as score,
      row_number() over (
        partition by c.document_id
        order by
          0.6 * (1 - (c.embedding <=> query_embedding))
          + 0.4 * coalesce(
              case when c.content_tsv @@ q.tsq
                   then least(ts_rank(c.content_tsv, q.tsq), 1.0)
                   else 0 end, 0) desc
      ) as rank_in_document
    from document_chunks c, q
    where c.embedding is not null
  )
  select
    d.id,
    d.category,
    d.title,
    -- 답변 근거로는 문서 전체가 아니라 실제로 걸린 조각을 넘긴다
    s.chunk_content as content,
    s.score as similarity
  from scored s
  join documents d on d.id = s.document_id
  where s.rank_in_document = 1
    and s.score > match_threshold
  order by s.score desc
  limit match_count;
$$;

-- 질문 원문을 받지 않는 옛 함수 제거 (오버로드로 남으면 호출이 모호해진다)
drop function if exists match_documents(vector, float, int);
