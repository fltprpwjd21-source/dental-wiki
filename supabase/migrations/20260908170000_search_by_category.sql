-- 검색을 카테고리 안으로 좁힐 수 있게 한다.
--
-- 왜 필요한가
--   지금 점수 문턱값(0.2)과 후보 개수(5)는 문서 7건·질문 14개로 맞춘 값이다.
--   문서가 늘면 그 5자리를 두고 경쟁하는 조각이 함께 늘어, 관련 없는 조각이
--   문턱을 넘어 들어오기 시작한다. 이건 에러도 안 나고 느려지지도 않고
--   그냥 답이 틀리기 시작하는 종류의 고장이다.
--   수가 질문인 걸 아는 사람이 수가 안에서만 찾을 수 있으면, 경쟁 후보가
--   그 카테고리 것으로 줄어 문턱값이 훨씬 오래 버틴다.
--
--   속도도 같이 좋아진다. 이 함수는 조각마다 점수를 매겨야 해서
--   document_chunks 를 전부 훑는다(HNSW 인덱스는 여기서 안 쓰인다 —
--   조각 단위 order by ... limit 이 없기 때문이다). 실측으로 조각 70개에 5.3ms,
--   즉 조각 하나당 약 0.076ms 다. 카테고리로 좁히면 훑는 양이 그만큼 줄어든다.
--
-- filter_category 를 null 로 두면 예전과 똑같이 전체를 찾는다.
--   상단 검색칸(어디 있는지 모를 때 쓰는 길)이 그 경로를 계속 쓴다.

-- 인자 개수가 다른 함수가 둘 남으면, 4개로 부르는 호출이 "모호하다"며 실패한다.
-- (기본값이 있는 5인자 함수와 4인자 함수가 같은 호출에 둘 다 맞기 때문)
drop function if exists match_documents(vector, text, float, int);

create or replace function match_documents(
  query_embedding vector(1536),
  query_text text,
  match_threshold float,
  match_count int,
  filter_category document_category default null
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
      d.id as doc_id,
      d.category as doc_category,
      d.title as doc_title,
      c.content as chunk_content,
      -- 의미 점수(0~1)와 키워드 점수를 가중합한다 (0.6 : 0.4)
      0.6 * (1 - (c.embedding <=> query_embedding))
      + 0.4 * coalesce(
          case when c.content_tsv @@ q.tsq
               then least(ts_rank(c.content_tsv, q.tsq), 1.0)
               else 0 end, 0) as score,
      row_number() over (
        partition by d.id
        order by
          0.6 * (1 - (c.embedding <=> query_embedding))
          + 0.4 * coalesce(
              case when c.content_tsv @@ q.tsq
                   then least(ts_rank(c.content_tsv, q.tsq), 1.0)
                   else 0 end, 0) desc
      ) as rank_in_document
    from document_chunks c
      join documents d on d.id = c.document_id
      cross join q
    where c.embedding is not null
      -- 카테고리를 안 넘기면 조건이 사라진다 = 예전과 같은 전체 검색
      and (filter_category is null or d.category = filter_category)
  )
  select
    doc_id,
    doc_category,
    doc_title,
    -- 답변 근거로는 문서 전체가 아니라 실제로 걸린 조각을 넘긴다
    chunk_content,
    score
  from scored
  where rank_in_document = 1
    and score > match_threshold
  order by score desc
  limit match_count;
$$;

-- 이 프로젝트 전역 방침: 브라우저 쪽 역할(anon/authenticated)에서는 회수하고,
-- 서버(service_role)만 부른다.
revoke all on function match_documents(vector, text, float, int, document_category)
  from anon, authenticated;
