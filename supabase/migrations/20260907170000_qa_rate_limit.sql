-- Q&A 호출 횟수 제한 (요금 방어) — LESSONS §9-8
--
-- 왜 필요한가
--   /api/qa 는 호출 한 번마다 OpenAI 를 두 번 부른다(질문 임베딩 + 답변 생성).
--   그런데 로그인만 되어 있으면 무제한으로 부를 수 있었다. 세션 하나만 있으면
--   요금이 끝없이 늘어난다 — 브라우저 콘솔에서 for 문 한 줄이면 된다.
--
--   로그인에는 이미 시도 횟수 제한이 있는데(20260903142230), 그건 "인증을 뚫는 문" 에만
--   걸려 있고 "돈이 나가는 문" 에는 없었다. 비용이 요청 수에 비례하는 경로는 인증
--   뒤에 있어도 한도가 필요하다.
--
-- 로그인 제한과 다른 점
--   로그인은 **실패만** 기록한다(성공하면 지운다). Q&A 는 성공해도 돈이 나가므로
--   **모든 호출**을 기록한다.
--
-- 왜 DB 에 기록하는가
--   Vercel 은 서버리스라 요청마다 다른 인스턴스에서 처리될 수 있고 메모리도 초기화된다.
--   프로세스 메모리에 카운터를 두면 셀 수 없다. (로그인 제한이 같은 이유로 DB 를 쓴다)
--
-- 기준값을 정한 근거
--   스탭이 실제로 질문하는 속도는 아무리 빨라도 20~30초에 한 번이고, 하루에 수십 건이다.
--   아래 값은 그보다 넉넉해서 정상 사용에는 걸리지 않고, 자동화된 폭주만 걸린다.
--     - 1분당  10회  → 사람이 낼 수 없는 속도. 스크립트·무한 재시도를 잡는다
--     - 1일당 200회  → 비용 상한. gpt-4o-mini 기준 한 사람이 하루에 낼 수 있는 요금을 묶는다
--   한도는 **사번 단위**다. IP 로 묶으면 병원 내 같은 회선을 쓰는 동료들이 서로 때문에
--   막힌다 — 로그인 제한에서 이미 같은 이유로 IP 한도를 넉넉히 잡았다.
create table qa_requests (
  id bigserial primary key,
  employee_id text not null,
  requested_at timestamptz not null default now()
);

comment on table qa_requests is
  'Q&A 호출 기록. 요금 방어용 카운터이며 질문 내용은 남기지 않는다.';

create index qa_requests_employee_idx on qa_requests(employee_id, requested_at desc);

-- 20260903061446 의 방침과 동일: 공개용 롤은 접근 불가
alter table qa_requests enable row level security;
revoke all on table qa_requests from anon, authenticated;
revoke all on sequence qa_requests_id_seq from anon, authenticated;

-- 한도를 확인하고, 통과하면 1회를 소비한다.
--
-- 확인과 기록을 한 함수 안에서 함께 하는 이유
--   따로 두면 그 사이에 다른 요청이 끼어들어 한도를 넘길 수 있다. 함수 하나로 묶으면
--   같은 트랜잭션 안에서 처리된다.
--
-- 왜 호출 전에 소비하는가
--   OpenAI 호출이 실패해도 이미 돈이 나갔을 수 있고, 실패는 대개 재시도를 부른다.
--   먼저 소비해 두면 재시도 폭주도 같은 한도에 걸린다.
create or replace function qa_guard_consume(p_employee_id text)
returns table (allowed boolean, retry_after_seconds int, reason text)
language plpgsql
as $$
declare
  c_minute_window constant interval := interval '1 minute';
  c_minute_max    constant int := 10;
  c_day_window    constant interval := interval '1 day';
  c_day_max       constant int := 200;
  v_count  int;
  v_oldest timestamptz;
begin
  select count(*), min(r.requested_at) into v_count, v_oldest
    from qa_requests r
   where r.employee_id = p_employee_id
     and r.requested_at > now() - c_minute_window;

  if v_count >= c_minute_max then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_oldest + c_minute_window - now())))::int),
      'minute'::text;
    return;
  end if;

  select count(*), min(r.requested_at) into v_count, v_oldest
    from qa_requests r
   where r.employee_id = p_employee_id
     and r.requested_at > now() - c_day_window;

  if v_count >= c_day_max then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_oldest + c_day_window - now())))::int),
      'day'::text;
    return;
  end if;

  insert into qa_requests (employee_id) values (p_employee_id);

  -- 이틀이 지난 기록은 어떤 창에도 쓰이지 않으므로 함께 정리한다.
  delete from qa_requests where requested_at < now() - interval '2 days';

  return query select true, 0, ''::text;
end;
$$;

revoke all on function qa_guard_consume(text) from anon, authenticated;
