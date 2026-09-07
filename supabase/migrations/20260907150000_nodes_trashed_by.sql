-- 왜 필요한가
--   휴지통을 "본인이 버린 것만" 보여주려면 누가 버렸는지를 알아야 하는데, nodes 에는
--   trashed_at 만 있고 trashed_by 가 없었다. 지금은 node_logs 의 action='trash' 행에
--   actor 로만 남아 있어서, 목록을 만들 때마다 노드별 최신 trash 로그를 다시 찾아야 한다.
--   자주 읽는 값이라 컬럼으로 둔다.
--
-- 왜 로그를 지우지 않는가
--   node_logs 는 수정·삭제가 불가능한 감사 기록이다. 이 컬럼은 그 기록을 대체하는 것이
--   아니라 조회를 위해 복제해 두는 값이다. 진실은 여전히 로그에 있다.
alter table nodes add column if not exists trashed_by text;

-- 이미 휴지통에 있는 항목은 로그에서 되살린다.
--   폴더를 지우면 하위 전체에 같은 actor 로 trash 로그가 남으므로, 노드별로 가장 최근
--   trash 로그의 actor 를 쓰면 정확하다.
update nodes n
   set trashed_by = l.actor
  from (
    select distinct on (node_id) node_id, actor
    from node_logs
    where action = 'trash'
    order by node_id, created_at desc
  ) l
 where n.id = l.node_id
   and n.status = 'trashed'
   and n.trashed_by is null;

-- 휴지통 목록은 "내가 버린 것"으로 자주 거른다.
create index if not exists nodes_trashed_by_idx
  on nodes(trashed_by) where status = 'trashed';

-- 앞으로 버리는 것은 함수가 직접 채운다.
--   폴더를 지우면 하위 전체가 함께 버려지는데, 그 하위 항목의 trashed_by 도 "지운 사람"
--   으로 채운다. 남이 만든 노트라도 내가 폴더째 버렸으면 내 휴지통에서 되돌릴 수 있어야
--   하기 때문이다 — 되돌릴 책임은 만든 사람이 아니라 버린 사람에게 있다.
create or replace function trash_node(p_id uuid, p_employee_id text)
returns setof nodes
language plpgsql
as $$
declare
  v_status text;
  v_ids uuid[];
begin
  select status into v_status from nodes where id = p_id for update;
  if not found then
    raise exception 'NODE_NOT_FOUND';
  end if;
  if v_status = 'trashed' then
    raise exception 'ALREADY_TRASHED';
  end if;

  with recursive subtree as (
    select id from nodes where id = p_id
    union all
    select n.id from nodes n join subtree s on n.parent_id = s.id
  )
  select array_agg(id) into v_ids from subtree;

  update nodes
     set status = 'trashed',
         trashed_at = now(),
         trashed_by = p_employee_id,
         updated_at = now()
   where id = any(v_ids);

  insert into node_logs (node_id, action, actor, detail)
  select id, 'trash', p_employee_id, '{}'::jsonb from unnest(v_ids) as id;

  return query select * from nodes where id = any(v_ids);
end;
$$;

revoke all on function trash_node(uuid, text) from anon, authenticated;

-- 복구하면 "버린 사람" 정보는 의미가 없어지므로 비운다.
--   남겨두면 다시 버렸을 때 옛 값이 남아 엉뚱한 사람의 휴지통에 뜰 수 있다.
--
-- 아래 본문은 20260906130000 의 정의를 그대로 옮기고 update 문에 trashed_by = null 만
-- 더한 것이다. 조상 복구 로직(v_ancestors)은 그 마이그레이션에서 버그를 고치며 만든
-- 부분이라 손대지 않는다 — 자식만 되살리면 트리에서 갈 곳을 잃고, 나중에 그 부모를
-- 완전삭제할 때 외래키 위반이 난다.
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

  with recursive subtree as (
    select id from nodes where id = p_id
    union all
    select n.id from nodes n join subtree s on n.parent_id = s.id
  )
  select array_agg(id) into v_ids from subtree;

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

  update nodes set status = 'active', trashed_at = null, trashed_by = null, updated_at = now()
  where id = any(v_ids);

  insert into node_logs (node_id, action, actor, detail)
  select id, 'restore', p_employee_id, '{}'::jsonb from unnest(v_ids) as id;

  return query select * from nodes where id = any(v_ids);
end;
$$;

revoke all on function restore_node(uuid, text) from anon, authenticated;
