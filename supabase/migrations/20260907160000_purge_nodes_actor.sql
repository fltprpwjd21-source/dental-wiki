-- 왜 필요한가
--   purge_nodes 는 완전삭제 로그의 actor 를 'system' 으로 박아 넣는다. 크론이 부르는
--   경로만 있을 때는 맞는 값이었지만, 이제 관리자가 휴지통 화면에서 직접 지울 수 있다.
--   그대로 두면 "누가 지웠나"가 전부 system 으로 남아, 감사 로그가 사람의 행위를
--   기록하지 못한다. node_logs 는 수정·삭제가 불가능한 기록인데 그 내용이 틀리면
--   나중에 되짚을 방법이 없다.
--
-- 왜 기존 함수를 DROP 하는가
--   인자 하나짜리를 남겨둔 채 기본값을 가진 두 인자짜리를 만들면, purge_nodes(ids) 호출이
--   두 후보에 모두 맞아 Postgres 가 "function is not unique" 로 거부한다.
--   반드시 먼저 지우고 하나만 남긴다. (반환 타입은 int 그대로다)
drop function if exists purge_nodes(uuid[]);

create function purge_nodes(p_ids uuid[], p_actor text default 'system')
returns int
language plpgsql
as $$
declare
  remaining uuid[] := p_ids;
  leaves uuid[];
  deleted int := 0;
begin
  -- 살아 있는 자식이 딸린 가지는 건너뛰고 리프부터 지운다 (20260906130000 의 규칙).
  -- 그래야 parent_id 외래키를 어기지 않는다.
  while array_length(remaining, 1) > 0 loop
    select array_agg(n.id) into leaves
      from nodes n
     where n.id = any(remaining)
       and not exists (select 1 from nodes c where c.parent_id = n.id);

    exit when leaves is null or array_length(leaves, 1) = 0;

    insert into node_logs (node_id, action, actor, detail)
    select id, 'purge', p_actor, '{}'::jsonb from unnest(leaves) as id;

    delete from nodes where id = any(leaves);
    deleted := deleted + array_length(leaves, 1);

    select coalesce(array_agg(x), array[]::uuid[]) into remaining
      from unnest(remaining) as x
     where x <> all(leaves);
  end loop;

  return deleted;
end;
$$;

revoke all on function purge_nodes(uuid[], text) from anon, authenticated;
