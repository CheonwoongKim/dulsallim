-- 위아래 옮기기를 걷고 "지금 목표" 하나를 고르는 것으로 바꾼다.
--
-- 자리를 한 칸씩 옮기는 것은 여러 개를 줄 세우는 일이었다. 정작 알고 싶은 것은
-- "지금 무엇을 향해 아끼고 있나" 하나다. 사람마다 하나만 고를 수 있고, 그것이 맨 위에 선다.
--
-- sort_order 는 그 줄 세우기만을 위해 있던 열이라 함께 걷는다. 남겨 두면 아무도 안 읽는
-- not null 열이 모든 함수의 반환 모양에 남는다.
--
-- 하나뿐이라는 것은 부분 유니크 인덱스가 지킨다. 화면이 두 번 눌러도, 두 폰이 같은 순간에
-- 눌러도 한 사람에게 목표는 하나다.

/* ── 1. 열 ───────────────────────────────────────────────── */

alter table wish_items add column if not exists is_goal boolean not null default false;

drop index if exists wish_items_order_idx;
alter table wish_items drop column if exists sort_order;

-- 사람마다 하나. 이룬 것은 목표일 수 없다 — 이미 지난 일이다.
drop index if exists wish_items_goal_idx;
create unique index wish_items_goal_idx
  on wish_items (household_id, created_by)
  where is_goal and state <> 'achieved';

/* ── 2. 모양 하나 ────────────────────────────────────────── */

drop function if exists move_wish(uuid, text);
drop function if exists set_wish_goal(uuid, boolean);
drop function if exists achieve_wish(uuid, uuid);
drop function if exists agree_wish(uuid);
drop function if exists update_wish(uuid, text, text, integer, text);
drop function if exists create_wish(text, text, integer, text);
drop function if exists wish_snapshot(uuid);
drop type if exists wish_row;

create type wish_row as (
  id uuid,
  household_id uuid,
  name text,
  url text,
  note text,
  estimated_price integer,
  image_url text,
  created_by uuid,
  created_at timestamptz,
  state text,
  pursuing_at timestamptz,
  expense_id uuid,
  achieved_on date,
  achieved_at timestamptz,
  is_goal boolean,
  agreement_user_ids uuid[]
);

create or replace function wish_snapshot(p_wish_id uuid)
returns setof wish_row
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id, w.household_id, w.name, w.url, w.note, w.estimated_price, w.image_url,
    w.created_by, w.created_at, w.state, w.pursuing_at,
    w.expense_id, w.achieved_on, w.achieved_at, w.is_goal,
    array(
      select a.user_id
      from wish_agreements a
      where a.wish_id = w.id
      order by a.agreed_at, a.user_id
    )
  from wish_items w
  where w.id = p_wish_id
$$;

create or replace function create_wish(
  p_name text,
  p_url text,
  p_estimated_price integer,
  p_note text
)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_wish_id uuid;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  -- 같은 집의 합의·이룸 전환과 줄을 세운다. 한 사람 가구도 유니크 제약과 안전하게 맞물린다.
  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

  insert into wish_items (household_id, name, url, note, estimated_price, created_by)
  values (v_household, trim(p_name), nullif(trim(p_url), ''), nullif(trim(p_note), ''),
          p_estimated_price, auth.uid())
  returning wish_items.id into v_wish_id;

  insert into wish_agreements (wish_id, user_id)
  values (v_wish_id, auth.uid());

  if (select count(*) from profiles p where p.household_id = v_household) = 1 then
    update wish_items
       set state = 'pursuing', pursuing_at = now()
     where wish_items.id = v_wish_id;
  end if;

  return query select * from wish_snapshot(v_wish_id);
end;
$$;

create or replace function agree_wish(p_wish_id uuid)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_state text;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  -- 같은 집의 두 요청이 동시에 마지막 표를 세는 틈을 없앤다.
  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

  select w.state into v_state
    from wish_items w
   where w.id = p_wish_id
     and w.household_id = v_household;
  if not found then
    raise exception '위시를 찾을 수 없습니다';
  end if;
  if v_state = 'achieved' then
    raise exception '이미 이룬 위시입니다';
  end if;

  insert into wish_agreements (wish_id, user_id)
  values (p_wish_id, auth.uid())
  on conflict (wish_id, user_id) do nothing;

  if v_state = 'proposed'
     and (select count(*) from wish_agreements where wish_id = p_wish_id)
       = (select count(*) from profiles p where p.household_id = v_household) then
    -- 함께 바라는 것은 여럿이어도 된다. 하나로 묶어 두면 나중에 담은 것은 앞의 것이
    -- 끝날 때까지 아무 표시도 못 받는다.
    update wish_items
       set state = 'pursuing', pursuing_at = now()
     where wish_items.id = p_wish_id;
  end if;

  return query select * from wish_snapshot(p_wish_id);
end;
$$;

create or replace function achieve_wish(p_wish_id uuid, p_expense_id uuid)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_spent_on date;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

  -- 아직 안 이룬 것이면 된다. 혼자 바라는 것(proposed)도 여기에 들어온다.
  if not exists (
    select 1 from wish_items w
    where w.id = p_wish_id and w.household_id = v_household and w.state <> 'achieved'
  ) then
    raise exception '아직 안 이룬 위시를 찾을 수 없습니다';
  end if;

  select e.spent_on into v_spent_on
    from expenses e
   where e.id = p_expense_id and e.household_id = v_household;
  if not found then
    raise exception '지출을 찾을 수 없습니다';
  end if;

  update wish_items
     set state = 'achieved',
         expense_id = p_expense_id,
         achieved_on = v_spent_on,
         achieved_at = now()
   where wish_items.id = p_wish_id;

  return query select * from wish_snapshot(p_wish_id);
end;
$$;

create or replace function update_wish(
  p_wish_id uuid,
  p_name text,
  p_url text,
  p_estimated_price integer,
  p_note text
)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_url text := nullif(trim(p_url), '');
  v_state text;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  select w.state into v_state
    from wish_items w
   where w.id = p_wish_id
     and w.household_id = v_household;
  if not found then
    raise exception '위시를 찾을 수 없습니다';
  end if;
  if v_state = 'achieved' then
    raise exception '이미 이룬 위시입니다';
  end if;

  update wish_items
     set name = trim(p_name),
         url = v_url,
         note = nullif(trim(p_note), ''),
         estimated_price = p_estimated_price,
         -- 링크가 그대로면 찾아 둔 그림도 그대로 둔다. 바뀌었으면 비워 다시 찾게 한다.
         image_url = case when url is not distinct from v_url then image_url else null end
   where wish_items.id = p_wish_id;

  return query select * from wish_snapshot(p_wish_id);
end;
$$;

/* ── 3. 지금 목표 ────────────────────────────────────────── */

-- 사람마다 하나. 새로 고르면 앞의 것은 저절로 풀린다.
--
-- 바뀐 줄만 돌려준다 — 새로 고른 것과, 있었다면 풀린 것. 화면은 그 둘만 갈아 끼우면 된다.
-- 남의 것은 못 고른다. 내 목표는 내가 정한다.
create or replace function set_wish_goal(p_wish_id uuid, p_on boolean)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_me uuid := auth.uid();
  v_old_id uuid;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  -- 두 폰이 같은 순간에 고르면 유니크 인덱스에 걸린다. 줄을 세워 그 틈을 없앤다.
  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

  if not exists (
    select 1 from wish_items w
    where w.id = p_wish_id
      and w.household_id = v_household
      and w.created_by = v_me
      and w.state <> 'achieved'
  ) then
    raise exception '목표로 삼을 위시를 찾을 수 없습니다';
  end if;

  -- 거는 것일 때만 앞의 것을 찾는다. 푸는 것이라면 남의 목표를 건드릴 까닭이 없다.
  if p_on then
    select w.id into v_old_id
      from wish_items w
     where w.household_id = v_household
       and w.created_by = v_me
       and w.is_goal
       and w.state <> 'achieved'
       and w.id <> p_wish_id;
  end if;

  -- 먼저 풀고 나서 건다. 반대로 하면 그 사이에 둘이 되어 인덱스에 걸린다.
  if v_old_id is not null then
    update wish_items set is_goal = false where wish_items.id = v_old_id;
  end if;
  update wish_items set is_goal = p_on where wish_items.id = p_wish_id;

  return query select * from wish_snapshot(p_wish_id);
  if v_old_id is not null then
    return query select * from wish_snapshot(v_old_id);
  end if;
end;
$$;

/* ── 4. 권한 ─────────────────────────────────────────────── */

revoke execute on function wish_snapshot(uuid)                          from public, anon;
revoke execute on function create_wish(text, text, integer, text)       from public, anon;
revoke execute on function agree_wish(uuid)                             from public, anon;
revoke execute on function achieve_wish(uuid, uuid)                     from public, anon;
revoke execute on function update_wish(uuid, text, text, integer, text) from public, anon;
revoke execute on function set_wish_goal(uuid, boolean)                 from public, anon;

grant execute on function create_wish(text, text, integer, text)        to authenticated;
grant execute on function agree_wish(uuid)                              to authenticated;
grant execute on function achieve_wish(uuid, uuid)                      to authenticated;
grant execute on function update_wish(uuid, text, text, integer, text)  to authenticated;
grant execute on function set_wish_goal(uuid, boolean)                  to authenticated;

-- 확인
--   select name, is_goal from wish_items where created_by = auth.uid() and state <> 'achieved';
--   select name, is_goal from set_wish_goal('<id>', true);   -- 새것 true, 앞의 것 false
