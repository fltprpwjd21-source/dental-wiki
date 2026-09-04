-- 조각(청크) 인자가 없는 옛 쓰기 함수를 제거한다.
--
-- 왜 필요한가
--   앞 마이그레이션에서 p_chunks 인자를 기본값과 함께 추가했는데, Postgres 는 인자
--   목록이 다르면 기존 함수를 바꾸지 않고 새 함수를 하나 더 만든다(오버로드).
--   그 결과 같은 이름의 함수가 두 개가 되어 호출이 모호해지고,
--   옛 함수가 불리면 조각이 갱신되지 않은 채 문서만 바뀌어 검색 결과가 어긋난다.

drop function if exists create_document(document_category, text, text, vector, text);
drop function if exists update_document(uuid, text, text, vector, text);
drop function if exists revert_document(uuid, uuid, vector, text);
