-- 화이트리스트 이름을 필수로 만든다 (2026-09-10).
--
-- 왜 지금인가
--   name 은 2026-09-07 에 nullable 로 추가했다. 이미 등록된 사원번호가 있는데 그
--   사람들의 이름을 마이그레이션이 지어낼 수 없었기 때문이다. 등록 API 와 설정 화면은
--   그때부터 이름을 필수로 받고 있었지만(app/api/settings/whitelist/route.ts),
--   DB 는 여전히 빈 값을 허용하는 상태였다 — 앱을 거치지 않는 경로(SQL 콘솔, 시드)로
--   들어오면 이름 없는 계정이 다시 생길 수 있었다.
--
--   업무지시(PRD ⑨)가 들어오면서 이게 실제 문제가 된다. 담당자를 여러 명 고르는
--   화면에서 목록에 사원번호만 뜨면 누구를 고르는지 알 수 없다. 그래서 마지막 남은
--   구멍인 DB 제약을 막는다.
--
-- 적용 전에 할 일
--   이름이 비어 있는 계정이 하나라도 남아 있으면 이 마이그레이션은 실패한다.
--   일부러 그렇게 뒀다 — 여기서 임시 이름("미상" 같은 것)으로 채워버리면 그 값이
--   그대로 화면에 실명인 척 남는다. 설정 화면에서 사람이 직접 채운 뒤 적용한다.
--
--   확인:
--     select employee_id from employee_whitelist where name is null or btrim(name) = '';

-- 공백만 있는 이름도 이름이 없는 것과 같다. NOT NULL 만으로는 ' ' 가 통과한다.
alter table employee_whitelist
  add constraint employee_whitelist_name_not_blank
  check (btrim(name) <> '');

alter table employee_whitelist
  alter column name set not null;

comment on column employee_whitelist.name is
  '표시용 실명. 필수다 (2026-09-10). 화면에서 사람은 어디서나 이 이름으로 표시되며, 사원번호는 로그인과 이 설정 화면에서만 쓴다.';
