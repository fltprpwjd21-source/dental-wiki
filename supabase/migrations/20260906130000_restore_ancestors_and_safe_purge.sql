-- 왜 필요한가
--   폴더를 통째로 휴지통에 넣은 뒤 그 안의 노트 하나만 복구하면, 노트는 active 인데
--   부모 폴더는 trashed 로 남는다. 두 가지가 한꺼번에 깨진다.
--     (1) 화면: buildTree 가 부모를 못 찾아 그 노트를 최상위로 올린다 — 원래 폴더가
--         아니라 트리 꼭대기에 뜬다.
--     (2) 배치: 30일 뒤 그 부모 폴더가 완전삭제 대상이 되는데, purge_nodes 는 "넘겨받은
--         목록 안에 자식이 없으면 리프"로 판정한다. 복구된 자식은 목록 밖(active)이라
--         부모를 리프로 착각해 delete 하고, nodes.parent_id 외래키 위반이 난다.
--         함수 전체가 예외로 끝나 그 회차가 통째로 롤백되므로, 다른 만료 항목도 함께
--         영원히 정리되지 않는다.
--
--   지금까지 이게 드러나지 않은 이유는 Vercel Cron 이 GET 으로 호출하는데 라우트가
--   POST 만 export 해서 배치 자체가 한 번도 실행된 적이 없었기 때문이다. 같은 날
--   그 문제를 고쳤으므로, 이 마이그레이션이 없으면 다음 회차부터 매일 500 이 난다.
--
-- 무엇을 고치는가
--   restore_node : 하위 서브트리뿐 아니라 **조상 체인**도 함께 되살린다.
--                  꺼내려는 항목이 트리에 다시 보이려면 그 위로 가는 길이 전부
--                  살아 있어야 한다 (부모가 휴지통이면 자식만 살려도 갈 곳이 없다).
--   purge_nodes  : 리프 판정에서 "목록 안의 자식"이 아니라 **모든 자식**을 본다.
--                  목록 밖에 살아 있는 자식이 있으면 그 가지는 이번 회차에서 건너뛴다.
--                  실패로 회차 전체를 죽이는 대신 다음 회차로 미루는 쪽이 안전하다.

-- 원본(20260904050000)의 행 잠금·예외 문구는 그대로 두고, 조상 복구만 더한다.
create or replace function restore_node(p_id uuid, p_employee_id text)
returns setof nodes
language plpgsql
as $$
declare
  v_status text;
  v_ids uuid[];
  v_ancestors uuid[];
begin
  select status into v_status from nodes where id = p_id for update;
  if not found then
    raise exception 'NODE_NOT_FOUND';
  end if;
  if v_status = 'active' then
    raise exception 'NOT_TRASHED';
  end if;

  -- 되살릴 하위 전체 (원본과 동일)
  with recursive subtree as (
    select id from nodes where id = p_id
    union all
    select n.id from nodes n join subtree s on n.parent_id = s.id
  )
  select array_agg(id) into v_ids from subtree;

  -- 여기부터가 추가분: 휴지통에 남아 있는 조상들도 함께 되살린다.
  -- 이게 없으면 자식만 active 가 되어 트리에서 갈 곳을 잃고(최상위로 튀어나오고),
  -- 나중에 그 부모를 완전삭제할 때 외래키 위반이 난다.
  with recursive up as (
    select n.parent_id as id from nodes n where n.id = p_id and n.parent_id is not null
    union all
    select n.parent_id from nodes n join up on n.id = up.id where n.parent_id is not null
  )
  select coalesce(array_agg(u.id), array[]::uuid[]) into v_ancestors
    from up u
    join nodes a on a.id = u.id
   where a.status = 'trashed';

  v_ids := v_ids || v_ancestors;

  update nodes set status = 'active', trashed_at = null, updated_at = now()
  where id = any(v_ids);

  insert into node_logs (node_id, action, actor, detail)
  select id, 'restore', p_employee_id, '{}'::jsonb from unnest(v_ids) as id;

  return query select * from nodes where id = any(v_ids);
end;
$$;

create or replace function purge_nodes(p_ids uuid[])
returns void
language plpgsql
as $$
declare
  remaining uuid[] := p_ids;
  leaves uuid[];
begin
  while array_length(remaining, 1) > 0 loop
    -- 자식이 하나도 없는 것만 리프로 본다. 예전에는 "remaining 안에 자식이 없으면"
    -- 이었는데, 그러면 목록 밖에 살아 있는 자식을 가진 부모까지 리프로 보고 지우려다
    -- 외래키 위반으로 회차 전체가 롤백됐다.
    select array_agg(n.id) into leaves
      from nodes n
     where n.id = any(remaining)
       and not exists (select 1 from nodes c where c.parent_id = n.id);

    -- 남은 것이 전부 "밖에 자식이 있는" 노드라면 이번 회차에서는 더 지울 게 없다.
    -- 조용히 빠져나가 다음 회차로 미룬다 (예외를 던지면 이미 지운 것까지 롤백된다).
    exit when leaves is null or array_length(leaves, 1) = 0;

    insert into node_logs (node_id, action, actor, detail)
    select id, 'purge', 'system', '{}'::jsonb from unnest(leaves) as id;

    delete from nodes where id = any(leaves);

    select coalesce(array_agg(x), array[]::uuid[]) into remaining
      from unnest(remaining) as x
     where x <> all(leaves);
  end loop;
end;
$$;

revoke all on function restore_node(uuid, text) from anon, authenticated;
revoke all on function purge_nodes(uuid[]) from anon, authenticated;
