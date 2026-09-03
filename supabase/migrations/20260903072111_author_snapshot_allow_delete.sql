-- 작성자·수정자 기록을 "스냅샷"으로 바꾸고, 사원번호 계정 삭제를 가능하게 한다.
--
-- 이전 설계의 문제
--   documents.created_by 와 document_logs.edited_by 가 employee_whitelist(employee_id)를
--   외래키로 참조하고 있었다. 그래서 문서를 한 번이라도 작성·수정한 사원번호는
--   삭제 자체가 불가능했고(실제로 00001은 문서 4건·로그 7건 때문에 막혀 있었다),
--   20260903062552_whitelist_is_active.sql 에서 삭제 대신 비활성화하는 우회책을 넣었다.
--
-- 왜 바꾸는가
--   감사 로그는 과거의 기록이다. 행위자는 그 시점의 값으로 남겨두면 충분하고,
--   살아있는 계정 테이블을 참조할 이유가 없다. 외래키를 떼면 사원번호는 텍스트로
--   그대로 보존되므로 "누가 고쳤는지"(PRD 5번②)는 유지되고, 계정은 자유롭게 삭제된다.
--   퇴사자 계정을 삭제하면 lib/auth.ts가 요청마다 계정 존재를 확인하므로
--   이미 로그인해 있던 세션도 그 즉시 끊긴다 (PRD 7번 충족).
--
-- 이 선택으로 잃는 것
--   DB가 "edited_by에는 실존하는 사원번호만 들어간다"를 더 이상 보장하지 않는다.
--   다만 이 값은 항상 로그인 시 화이트리스트로 검증된 세션(session.employeeId)에서만
--   오므로 앱 차원의 정합성은 유지된다.
--   또한 퇴사자 사원번호를 회수해 새 직원에게 재부여하면 옛 기록이 새 직원 것으로
--   보일 수 있다. 사번을 재사용하지 않는 운영을 전제한다.

alter table documents     drop constraint documents_created_by_fkey;
alter table document_logs drop constraint document_logs_edited_by_fkey;

comment on column documents.created_by is
  '최초 등록자 사원번호. 등록 시점의 값을 보존하는 스냅샷이며 employee_whitelist를 참조하지 않는다.';
comment on column document_logs.edited_by is
  '수정자 사원번호. 수정 시점의 값을 보존하는 스냅샷이며 employee_whitelist를 참조하지 않는다.';

-- is_active 우회책 제거: 계정을 실제로 삭제할 수 있게 되어 더 이상 필요하지 않다.
alter table employee_whitelist drop column is_active;
