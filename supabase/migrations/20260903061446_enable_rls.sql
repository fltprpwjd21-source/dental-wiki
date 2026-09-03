-- PRD 7번(내부용 서비스, 외부인 접근 차단) 보강:
-- 3개 테이블에 RLS를 켜고, 공개용 롤의 테이블 권한을 회수한다.
--
-- 왜 필요한가
--   Supabase의 공개용 키(anon / publishable)는 브라우저에 노출되도록 설계된 키다.
--   그런데 이 프로젝트는 RLS가 꺼진 상태로 anon 롤에 SELECT/INSERT/UPDATE/DELETE/TRUNCATE가
--   모두 부여되어 있었다. 즉 공개용 키만 있으면 REST API로 사원번호 화이트리스트를 읽거나
--   위키 문서를 위조할 수 있었다. 사원번호 목록이 새면 공통 비밀번호와 조합해 로그인도 가능하다.
--
-- RLS만으로 부족한 이유 (TRUNCATE)
--   PostgreSQL에서 RLS는 TRUNCATE에 적용되지 않고, document_logs의 before delete 트리거도
--   TRUNCATE에는 발동하지 않는다. 따라서 RLS만 켜면 "기록된 로그는 수정·삭제할 수 없다"는
--   PRD 5번② 규칙이 TRUNCATE로 우회될 수 있다. 그래서 권한 자체를 회수한다.
--
-- 앱에 영향이 없는 이유
--   앱은 lib/supabase/server.ts 에서 SUPABASE_SERVICE_ROLE_KEY(secret 키)로만 접근한다.
--   이 키는 service_role 롤로 동작하며 RLS를 우회하고, 여기서 권한을 회수하는 대상도 아니다.
--   이 앱은 Supabase Auth를 쓰지 않으므로 authenticated 롤도 사용하지 않는다.

-- 1) RLS 활성화 (정책을 만들지 않으므로 공개용 롤에는 전면 차단)
alter table employee_whitelist enable row level security;
alter table documents          enable row level security;
alter table document_logs      enable row level security;

-- 2) 공개용 롤의 테이블 권한 회수 (RLS가 막지 못하는 TRUNCATE까지 차단)
revoke all on table employee_whitelist from anon, authenticated;
revoke all on table documents          from anon, authenticated;
revoke all on table document_logs      from anon, authenticated;

-- 3) 앞으로 public 스키마에 테이블이 추가돼도 공개용 롤에 권한이 자동 부여되지 않게 한다
alter default privileges in schema public revoke all on tables from anon, authenticated;
