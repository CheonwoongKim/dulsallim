-- 위시에 대표 그림 한 칸을 더한다. (기존 프로젝트용 — 새 프로젝트는 schema.sql 에 이미 들어 있다)
--
-- 그림 자체는 우리가 갖지 않는다. 주소만 적어 두고 화면이 그 자리에서 불러온다.
-- 그쪽이 지우면 깨지는데, 그때 화면은 첫 글자 타일로 되돌아간다.
--
-- 칸 하나를 더하는 일인데 함수 넷을 다시 만드는 이유:
-- 그 넷의 반환 모양에 이 칸이 들어가야 한다. 반환 모양이 바뀌면 create or replace 로는
-- 못 바꾸므로 먼저 지우고 다시 만든다. 한 트랜잭션 안에서 도므로 중간 상태는 남지 않는다.
--
-- 담기(create_wish)는 그림을 기다리지 않는다. 남의 사이트를 읽는 데 몇 초가 걸리므로
-- 담긴 뒤에 set_wish_image 로 따로 붙인다.

alter table wish_items add column if not exists image_url text
  check (image_url is null or image_url ~ '^https?://');

drop function if exists wish_snapshot(uuid);
create or replace function wish_snapshot(p_wish_id uuid)
returns table (
  id uuid,
  household_id uuid,
  name text,
  url text,
  estimated_price integer,
  image_url text,
  created_by uuid,
  created_at timestamptz,
  state text,
  pursuing_at timestamptz,
  expense_id uuid,
  achieved_on date,
  achieved_at timestamptz,
  agreement_user_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id, w.household_id, w.name, w.url, w.estimated_price, w.image_url,
    w.created_by, w.created_at, w.state, w.pursuing_at,
    w.expense_id, w.achieved_on, w.achieved_at,
    array(
      select a.user_id
      from wish_agreements a
      where a.wish_id = w.id
      order by a.agreed_at, a.user_id
    )
  from wish_items w
  where w.id = p_wish_id
$$;

drop function if exists create_wish(text, text, integer);
create or replace function create_wish(
  p_name text,
  p_url text default null,
  p_estimated_price integer default null
)
returns table (
  id uuid,
  household_id uuid,
  name text,
  url text,
  estimated_price integer,
  image_url text,
  created_by uuid,
  created_at timestamptz,
  state text,
  pursuing_at timestamptz,
  expense_id uuid,
  achieved_on date,
  achieved_at timestamptz,
  agreement_user_ids uuid[]
)
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

  insert into wish_items (household_id, name, url, estimated_price, created_by)
  values (v_household, trim(p_name), nullif(trim(p_url), ''), p_estimated_price, auth.uid())
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

drop function if exists agree_wish(uuid);
create or replace function agree_wish(p_wish_id uuid)
returns table (
  id uuid,
  household_id uuid,
  name text,
  url text,
  estimated_price integer,
  image_url text,
  created_by uuid,
  created_at timestamptz,
  state text,
  pursuing_at timestamptz,
  expense_id uuid,
  achieved_on date,
  achieved_at timestamptz,
  agreement_user_ids uuid[]
)
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
    -- 이미 다른 위시를 향하고 있으면 부분 유니크 인덱스가 이 요청 전체를 되돌린다.
    update wish_items
       set state = 'pursuing', pursuing_at = now()
     where wish_items.id = p_wish_id;
  end if;

  return query select * from wish_snapshot(p_wish_id);
end;
$$;

drop function if exists achieve_wish(uuid, uuid);
create or replace function achieve_wish(p_wish_id uuid, p_expense_id uuid)
returns table (
  id uuid,
  household_id uuid,
  name text,
  url text,
  estimated_price integer,
  image_url text,
  created_by uuid,
  created_at timestamptz,
  state text,
  pursuing_at timestamptz,
  expense_id uuid,
  achieved_on date,
  achieved_at timestamptz,
  agreement_user_ids uuid[]
)
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

  if not exists (
    select 1 from wish_items w
    where w.id = p_wish_id
      and w.household_id = v_household
      and w.state = 'pursuing'
  ) then
    raise exception '지금 향하는 위시를 찾을 수 없습니다';
  end if;

  select e.spent_on into v_spent_on
    from expenses e
   where e.id = p_expense_id
     and e.household_id = v_household;
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

create or replace function set_wish_image(p_wish_id uuid, p_image_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  update wish_items
     set image_url = nullif(trim(p_image_url), '')
   where id = p_wish_id
     and household_id = v_household;
end;
$$;

-- 다시 만든 함수에는 예전 권한이 남지 않는다. 매번 다시 건다.
revoke execute on function wish_snapshot(uuid)               from public, authenticated, anon;
revoke execute on function create_wish(text, text, integer)  from public, anon;
revoke execute on function agree_wish(uuid)                  from public, anon;
revoke execute on function achieve_wish(uuid, uuid)          from public, anon;
revoke execute on function set_wish_image(uuid, text)        from public, anon;

grant execute on function create_wish(text, text, integer)   to authenticated;
grant execute on function agree_wish(uuid)                   to authenticated;
grant execute on function achieve_wish(uuid, uuid)           to authenticated;
grant execute on function set_wish_image(uuid, text)         to authenticated;
