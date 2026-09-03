-- 로컬 개발/테스트용 예시 데이터. `supabase start` 또는 `supabase db reset` 시 자동 실행된다.
-- 실제 사원번호는 이 파일에 추가하거나, 이후 만들 관리자 화면(PLAN 15번)에서 등록한다.
insert into employee_whitelist (employee_id, is_admin)
values ('00001', true)
on conflict (employee_id) do nothing;
