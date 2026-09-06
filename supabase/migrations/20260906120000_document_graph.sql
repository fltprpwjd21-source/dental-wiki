-- 왜 필요한가
--   문서끼리 얼마나 가까운지를 화면에 그리려면 문서 쌍마다 유사도가 필요하다.
--   이걸 앱에서 계산하려면 임베딩(1536차원) 전부를 브라우저까지 내려보내야 하는데,
--   지금은 조각 78개라 480KB 남짓이지만 문서가 늘면 그대로 무너진다.
--   pgvector 가 DB 안에서 계산하면 내려가는 건 "선 몇 개"뿐이다.
--
-- 무엇을 쓰는가
--   documents.embedding — 청킹으로 검색 방식을 바꾼 뒤로 아무도 읽지 않던 값이다.
--   (LESSONS §9-6 에 "걷어낼 대상"으로 적어뒀지만, 지도의 근거로 쓰기로 하면서
--    용도가 생겼다. 조각이 아니라 문서 한 건 전체를 대표하는 벡터라 여기 딱 맞는다.)
--
-- 왜 문턱값이 아니라 노드당 상위 k개인가
--   문서 n건이면 쌍은 n(n-1)/2 다 — 11건이면 55쌍이지만 500건이면 12만 쌍이 된다.
--   계산은 Postgres 가 감당해도 화면이 털뭉치가 되어 못 읽는다.
--   각 문서가 "자기와 가장 가까운 k개"만 남기면 선의 수가 문서 수에 비례해서만
--   늘어나므로, 문서가 몇백 건이 되어도 지도가 읽힌다.
--
-- 반환 형태
--   대칭 쌍은 한 번만 내보낸다(a < b). A의 상위 k에 B가 있거나 B의 상위 k에 A가 있으면
--   그 선을 남긴다 — 한쪽에서만 가까운 관계도 지도에서는 의미가 있기 때문이다.
create or replace function document_graph(p_top_k int default 5)
returns table (
  a_id uuid,
  b_id uuid,
  similarity real
)
language sql
stable
as $$
  with ranked as (
    select
      a.id as a_id,
      b.id as b_id,
      (1 - (a.embedding <=> b.embedding))::real as sim,
      row_number() over (
        partition by a.id
        order by a.embedding <=> b.embedding
      ) as rk
    from documents a
    join documents b
      on a.id <> b.id
     and b.embedding is not null
    where a.embedding is not null
  )
  select
    least(a_id, b_id)    as a_id,
    greatest(a_id, b_id) as b_id,
    max(sim)             as similarity
  from ranked
  where rk <= p_top_k
  group by least(a_id, b_id), greatest(a_id, b_id)
  order by similarity desc;
$$;

-- 공개용 롤에서는 실행 권한을 회수한다 (앱은 service_role 로만 호출한다).
revoke all on function document_graph(int) from anon, authenticated;
