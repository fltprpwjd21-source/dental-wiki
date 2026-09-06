-- 왜 필요한가
--   purge_nodes 는 "지울 목록"을 받아 리프부터 지우는데, 살아 있는 자식이 딸린 가지는
--   건너뛴다(20260906130000). 그런데 반환값이 void 라 라우트는 몇 개가 실제로 지워졌는지
--   알 수 없고, 넘긴 개수를 그대로 purged 로 보고했다.
--   실제로 2건을 넘겨 1건만 지워진 회차가 {"purged":2} 로 성공처럼 보였다 —
--   배치가 조용히 거짓말하면 나중에 "왜 안 지워지지"를 추적할 근거가 사라진다.
--
-- 주의: 반환 타입을 void → int 로 바꾸는 것이라 create or replace 로는 안 된다.
--   Postgres 는 "기존 함수의 반환 타입을 바꿀 수 없다"며 거부한다. 반드시 먼저 DROP 한다.
--   (같은 함정을 이 프로젝트에서 이미 세 번 겪었다 — LESSONS §2.4)
drop function if exists purge_nodes(uuid[]);

create function purge_nodes(p_ids uuid[])
returns int
language plpgsql
as $$
declare
  remaining uuid[] := p_ids;
  leaves uuid[];
  deleted int := 0;
begin
  while array_length(remaining, 1) > 0 loop
    select array_agg(n.id) into leaves
      from nodes n
     where n.id = any(remaining)
       and not exists (select 1 from nodes c where c.parent_id = n.id);

    exit when leaves is null or array_length(leaves, 1) = 0;

    insert into node_logs (node_id, action, actor, detail)
    select id, 'purge', 'system', '{}'::jsonb from unnest(leaves) as id;

    delete from nodes where id = any(leaves);
    deleted := deleted + array_length(leaves, 1);

    select coalesce(array_agg(x), array[]::uuid[]) into remaining
      from unnest(remaining) as x
     where x <> all(leaves);
  end loop;

  return deleted;
end;
$$;

revoke all on function purge_nodes(uuid[]) from anon, authenticated;
