-- 왜 필요한가
--   document_graph 는 "각 문서와 가장 가까운 k개"를 구하는 함수인데, 지금은 문서를
--   자기 자신과 교차 조인해서 **모든 쌍의 거리를 다 계산한 뒤** 순위를 매겨 상위 k개만
--   남긴다. 계산량이 문서 수의 제곱으로 늘어난다.
--     11건 →     110쌍   (지금. 측정상 왕복 지연에 묻혀 0ms 수준)
--    100건 →   9,900쌍   (90배)
--   1000건 → 999,000쌍   (9,082배)
--   메인 화면은 열 때마다 이 함수를 부르므로, 문서가 쌓이면 가장 느린 부분이 된다.
--
--   그런데 documents.embedding 에는 최초 스키마부터 HNSW 인덱스가 있다
--   (20260828065522 의 documents_embedding_idx). "가장 가까운 k개 찾기"는 정확히
--   그 인덱스가 하라고 있는 일인데, 교차 조인은 인덱스를 쓸 수 없는 형태라 그동안
--   한 번도 쓰이지 않았다. (LESSONS §9-7 이 지적한 '무용지물' 상태의 다른 얼굴이다)
--
-- 무엇이 달라지나
--   lateral 조인으로 바꿔서, 문서마다 `order by embedding <=> ? limit k` 를 돌린다.
--   이 형태는 HNSW 인덱스를 탈 수 있으므로, 전체 쌍을 도는 대신 문서 수에 거의
--   비례하는 비용이 된다. 반환 형태(a_id, b_id, similarity)와 대칭 쌍 처리 규칙은
--   그대로라 앱 코드는 손대지 않는다.
--
-- limit 을 k 가 아니라 k+1 로 잡는 이유
--   자기 자신이 언제나 거리 0 으로 1등이다. 안쪽에서 `b.id <> a.id` 로 거르면 그
--   조건이 인덱스 스캔 뒤에 적용되어(post-filter) 이웃이 k−1개만 남을 수 있다.
--   그래서 k+1 개를 받아 온 뒤 바깥에서 자기 자신을 뺀다 — 안쪽 스캔은 조건 없이
--   깨끗하게 두고, 개수는 항상 k개가 확보된다.
--
-- 정확도에 대한 정직한 메모
--   HNSW 는 근사 최근접이다. 문서가 많아져 플래너가 실제로 인덱스를 타기 시작하면,
--   상위 k개가 정확해와 아주 드물게 다를 수 있다. 이 값은 지도의 선을 그리는 데만
--   쓰이고 검색·답변에는 쓰이지 않으므로 그 정도 오차는 받아들인다.
--   (문서가 적은 동안은 플래너가 순차 스캔을 골라 정확해와 완전히 동일하다 —
--    적용 직후 11건 기준으로 기존 함수와 결과가 한 줄도 다르지 않음을 확인했다)
create or replace function document_graph(p_top_k int default 5)
returns table (
  a_id uuid,
  b_id uuid,
  similarity real
)
language sql
stable
as $$
  with neighbors as (
    select
      a.id as a_id,
      n.id as b_id,
      n.sim
    from documents a
    cross join lateral (
      select
        b.id,
        (1 - (b.embedding <=> a.embedding))::real as sim
      from documents b
      order by b.embedding <=> a.embedding
      limit p_top_k + 1
    ) n
    where a.embedding is not null
      and n.id <> a.id
      and n.sim is not null
  )
  select
    least(a_id, b_id)    as a_id,
    greatest(a_id, b_id) as b_id,
    max(sim)             as similarity
  from neighbors
  group by least(a_id, b_id), greatest(a_id, b_id)
  order by similarity desc;
$$;

-- 공개용 롤에서는 실행 권한을 회수한다 (앱은 service_role 로만 호출한다).
revoke all on function document_graph(int) from anon, authenticated;
