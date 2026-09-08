-- ① 회의록 카테고리 추가
--
--   부서 회의·컨퍼런스 기록을 인수인계나 내규에 섞어 두면 나중에 "지난달 회의에서
--   뭐라고 했지"를 찾을 수 없다. 별도 카테고리로 뺀다.
--
--   enum 값 추가는 트랜잭션 안에서 못 하는 경우가 있어 이 문장만 따로 둔다.
alter type document_category add value if not exists 'meeting';
