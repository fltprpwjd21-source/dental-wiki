-- 낱말 검색을 따로 만든다. Q&A 가 답을 못 찾았을 때 문서 목록으로 대신 답하기 위한 것이다.
--
-- 무엇이 문제였나 (2026-09-08 실측)
--   「사랑니」 한 낱말로 검색하면 아무것도 안 나왔다. 문턱값을 0 으로 내려 보니
--   정답 문서(발치술 급여 수가)가 1위였는데 점수가 0.1872 로, 문턱값 0.2 에
--   0.0128 모자라 탈락한 것이었다.
--     "사랑니"                → 0.1872  탈락
--     "사랑니 발치 수가"       → 0.2672  통과
--     "사랑니 빼는 거 얼마예요?" → 0.4148  통과
--
--   한 낱말이 불리한 이유가 두 겹이다.
--     1) 임베딩: 세 글자짜리 입력은 문장보다 훨씬 흐릿한 벡터가 된다 (의미 0.2613)
--     2) ts_rank: 낱말 하나가 긴 조각에 한두 번 있으면 점수가 낮게 나온다 (키워드 0.0760)
--   문턱값 0.2 는 애초에 문장형 질문 14개로 맞춘 값이라, 낱말 검색에는 맞지 않는다.
--
-- 왜 문턱값을 내리지 않는가
--   0.2 → 0.15 로 내리면 「사랑니」는 통과하지만, 문장형 질문에서 위키에 없는 것을
--   물었을 때 무관한 문서가 근거로 딸려 들어온다 (없는 질문 4개의 최고점이 0.2713 이라
--   두 구간이 이미 겹쳐 있다 — 20260904000701 마이그레이션 참고).
--   답변의 정확도를 낱말 검색 편의와 바꾸는 셈이다.
--
-- 그래서 나누었다
--   질문에 답하는 일(match_documents)과 낱말이 든 문서를 찾는 일(이 함수)은 다른 일이다.
--   답을 못 찾으면 "없습니다"로 끝내지 않고 이 함수로 문서 목록을 보여준다.
--   임베딩을 안 쓰므로 OpenAI 호출도 없다.
--
-- websearch_to_tsquery 를 쓰는 이유
--   낱말을 직접 이어붙여 tsquery 를 만들면 "얼마예요?" 같은 물음표에서 문법 오류가 난다.
--   이 함수는 사용자 입력을 안전하게 받아주고, 낱말이 하나일 때는 AND/OR 구분도 없다
--   — 지금 고치려는 경우가 바로 그 한 낱말짜리다.
create or replace function search_documents(
  query_text text,
  filter_category document_category default null,
  match_count int default 8
)
returns table (
  id uuid,
  category document_category,
  title text,
  rank float
)
language sql stable
as $$
  with q as (
    select websearch_to_tsquery('simple', query_text) as tsq
  )
  select
    d.id,
    d.category,
    d.title,
    -- 문서 안에서 가장 잘 걸린 조각의 점수를 그 문서의 점수로 삼는다.
    -- 제목에만 든 낱말도 놓치지 않게 제목 일치에 최소 점수를 준다.
    greatest(
      max(coalesce(ts_rank(c.content_tsv, q.tsq), 0)),
      case when d.title ilike '%' || query_text || '%' then 0.05 else 0 end
    )::float as rank
  from documents d
    left join document_chunks c on c.document_id = d.id
    cross join q
  where (c.content_tsv @@ q.tsq or d.title ilike '%' || query_text || '%')
    and (filter_category is null or d.category = filter_category)
  group by d.id, d.category, d.title
  order by rank desc, d.updated_at desc
  limit match_count;
$$;

revoke all on function search_documents(text, document_category, int)
  from anon, authenticated;
