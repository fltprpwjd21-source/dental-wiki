-- PRD 7번(등록되지 않은 사원번호로는 접속 불가) 구현: 화이트리스트에 is_active 추가
--
-- 왜 물리 삭제가 아니라 비활성화인가
--   documents.created_by 와 document_logs.edited_by 가 employee_whitelist(employee_id)를
--   ON DELETE NO ACTION 외래키로 참조한다. 그래서 문서를 한 번이라도 작성·수정한
--   사원번호는 물리 삭제가 아예 불가능하다 (실제로 00001은 문서 4건·로그 7건 때문에
--   삭제가 막혀 있었고, 결과적으로 퇴사자 차단 수단이 없는 상태였다).
--
--   또한 PRD 5번②에 따라 로그의 "누가 고쳤는지"는 반드시 보존되어야 한다.
--   따라서 계정을 지우는 것이 아니라 비활성화해 로그인만 막는 것이 요건에 맞다.
--
-- 이 컬럼을 쓰는 곳
--   - 로그인 시 is_active 확인 (app/api/auth/login/route.ts)
--   - 매 요청 세션 확인 시 is_active 재확인 (lib/auth.ts)
--     세션 토큰은 서버가 무효화할 수 없는 HMAC 방식이라, 요청마다 DB를 확인해야
--     비활성화가 즉시 반영된다 (관리자 강등도 마찬가지)
--   - 설정 탭에서 비활성화/재활성화 (app/api/settings/whitelist/...)

alter table employee_whitelist
  add column is_active boolean not null default true;

comment on column employee_whitelist.is_active is
  '로그인 허용 여부. false면 로그인·기존 세션 모두 차단된다. 로그 보존을 위해 행은 삭제하지 않는다.';
