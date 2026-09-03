-- 로그인 시도 횟수 제한 (무차별 대입 방어)
--
-- 왜 필요한가
--   로그인은 "사원번호 화이트리스트 + 전 직원 공통 비밀번호" 방식이다(PRD 7번).
--   그런데 사원번호는 비밀이 아니다 — 사내 메일 주소(예: 2251325@hyumc.com)나
--   명찰에서 그대로 드러난다. 즉 실질적인 방어선은 공통 비밀번호 하나뿐인데,
--   시도 횟수 제한이 없으면 인터넷에서 무제한 속도로 계속 찍어볼 수 있었다.
--
-- 왜 DB에 기록하는가
--   Vercel은 서버리스라 요청마다 다른 인스턴스에서 처리될 수 있고 메모리도 초기화된다.
--   따라서 프로세스 메모리에 카운터를 두면 셀 수 없다.
--
-- 기준값을 넉넉하게 잡은 이유
--   8자 비밀번호를 전수 조사하려면 조 단위 시도가 필요하다. IP당 20회/10분이면
--   하루 2,880회에 불과해 사실상 불가능하다. 반대로 너무 조이면 같은 IP를 공유하는
--   병원 내 직원들이 서로 때문에 잠기는 부작용이 더 크다.
--     - 사번당  5회 / 10분  → 특정 계정을 노린 시도 차단
--     - IP당   20회 / 10분  → 대량 시도 차단 (NAT 공유 환경 고려해 여유 있게)

create table login_attempts (
  id bigserial primary key,
  ip text not null,
  employee_id text not null,
  attempted_at timestamptz not null default now()
);

comment on table login_attempts is
  '로그인 실패 기록. 성공한 로그인은 남기지 않으며, 성공 시 해당 사번·IP의 기록은 삭제된다.';

create index login_attempts_ip_idx on login_attempts(ip, attempted_at desc);
create index login_attempts_employee_idx on login_attempts(employee_id, attempted_at desc);

-- 20260903061446 마이그레이션의 방침과 동일: 공개용 롤은 접근 불가
alter table login_attempts enable row level security;
revoke all on table login_attempts from anon, authenticated;
revoke all on sequence login_attempts_id_seq from anon, authenticated;

-- 차단 여부 확인. 차단이면 몇 초 뒤에 다시 시도할 수 있는지 함께 알려준다.
create or replace function login_guard_check(p_ip text, p_employee_id text)
returns table (blocked boolean, retry_after_seconds int)
language plpgsql
as $$
declare
  c_window  constant interval := interval '10 minutes';
  c_ip_max  constant int := 20;
  c_emp_max constant int := 5;
  v_count   int;
  v_oldest  timestamptz;
begin
  select count(*), min(a.attempted_at) into v_count, v_oldest
    from login_attempts a
   where a.ip = p_ip and a.attempted_at > now() - c_window;

  if v_count >= c_ip_max then
    return query select true,
      greatest(1, ceil(extract(epoch from (v_oldest + c_window - now())))::int);
    return;
  end if;

  select count(*), min(a.attempted_at) into v_count, v_oldest
    from login_attempts a
   where a.employee_id = p_employee_id and a.attempted_at > now() - c_window;

  if v_count >= c_emp_max then
    return query select true,
      greatest(1, ceil(extract(epoch from (v_oldest + c_window - now())))::int);
    return;
  end if;

  return query select false, 0;
end;
$$;

-- 실패 1건 기록. 하루가 지난 기록은 쓸 데가 없으므로 함께 정리한다.
create or replace function login_guard_fail(p_ip text, p_employee_id text)
returns void
language plpgsql
as $$
begin
  insert into login_attempts (ip, employee_id) values (p_ip, p_employee_id);
  delete from login_attempts where attempted_at < now() - interval '1 day';
end;
$$;

-- 로그인 성공 시 해당 사번과 IP의 실패 기록을 지운다.
-- 비밀번호를 몇 번 잘못 입력했다가 맞춘 정상 직원이 한도에 가까운 상태로 남지 않게 하고,
-- 같은 IP를 공유하는 동료들도 함께 풀린다.
create or replace function login_guard_reset(p_ip text, p_employee_id text)
returns void
language plpgsql
as $$
begin
  delete from login_attempts where employee_id = p_employee_id or ip = p_ip;
end;
$$;

revoke all on function login_guard_check(text, text) from anon, authenticated;
revoke all on function login_guard_fail(text, text)  from anon, authenticated;
revoke all on function login_guard_reset(text, text) from anon, authenticated;
