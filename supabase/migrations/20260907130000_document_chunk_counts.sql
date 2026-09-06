-- 왜 필요한가
--   지도는 점 크기를 정하려고 문서마다 조각이 몇 개인지만 알면 된다. 그런데 지금은
--   document_chunks 의 **전체 행을 앱까지 받아 와서** 세고 버린다
--   (lib/knowledge-map.ts). 메인 화면을 열 때마다 그렇게 한다.
--     문서 11건 → 조각 78행
--     문서 1000건 → 조각 7000행 (문서당 평균 7조각)
--   세는 일은 DB 가 하면 되는 일이고, 그러면 오가는 것이 문서 수만큼으로 줄어든다.
--
-- 왜 뷰가 아니라 함수인가
--   이 프로젝트는 anon/authenticated 롤에서 테이블 접근을 전부 회수해 두고, 필요한
--   것만 함수로 열어 service_role 로 부르는 방식을 쓴다(RLS 마이그레이션 참고).
--   뷰를 만들면 그 권한 설계를 한 번 더 해야 하므로 기존 방식에 맞춘다.
create or replace function document_chunk_counts()
returns table (
  document_id uuid,
  chunk_count int
)
language sql
stable
as $$
  select document_id, count(*)::int as chunk_count
  from document_chunks
  group by document_id;
$$;

-- 공개용 롤에서는 실행 권한을 회수한다 (앱은 service_role 로만 호출한다).
revoke all on function document_chunk_counts() from anon, authenticated;
