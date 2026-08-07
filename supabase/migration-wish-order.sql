-- 위시에 우선순위를 준다. 그리고 혼자 이룬 것이 제약에 걸리던 것을 고친다.
--
-- 두 가지를 한 파일에 담는 까닭: 둘 다 wish_items 의 제약과 위시 함수들의 반환 모양을
-- 건드린다. 나눠 돌리면 그 사이에 반환 모양이 어긋난 함수가 남는다.
--
-- ── 1. 혼자 이룬 것이 제약에 걸렸다 ─────────────────────────────
--
-- state = 'achieved' 는 pursuing_at is not null 을 함께 요구하고 있었다. 상대의 "나도" 가
-- 있어야만 이룰 수 있던 시절의 규칙이다. 혼자서도 이룰 수 있게 푼 뒤로는(achieve_wish 의
-- state <> 'achieved') 혼자 담은 것을 이루면 pursuing_at 이 없어 이 제약에 걸린다.
-- 목 서버에는 제약이 없어 E2E 로도 안 잡혔다.
--
-- 이룬 것에 "언제 함께 바라기 시작했나" 를 요구할 까닭이 없다. 그 줄만 뗀다.
--
-- ── 2. 우선순위 ───────────────────────────────────────────────
--
-- sort_order 가 작을수록 위다. 사람마다 따로 센다 — 각자의 목록이라 남의 순서에 끼지 않는다.
-- 값이 겹쳐도 된다. 옮기기는 두 줄을 맞바꾸는 것이라 겹쳐도 서로를 밀어내지 않는다.
--
-- ── 3. 반환 모양을 타입 하나로 ────────────────────────────────
--
-- 다섯 함수가 열 목록을 저마다 적고 있었다. 한 곳만 빠지면 그 자리만 400 이 난다 —
-- image_url 을 더할 때 create_wish 가 실제로 그랬다. 이제 wish_row 타입 하나를 쓴다.

/* ── 1. 제약 ─────────────────────────────────────────────── */

-- 이름 없이 적힌 표 제약은 wish_items_check 로 붙는다. 이 파일을 두 번 돌려도 되도록
-- 새 이름도 함께 지우고 다시 만든다.
alter table wish_items drop constraint if exists wish_items_check;
alter table wish_items drop constraint if exists wish_items_state_check;

alter table wish_items add constraint wish_items_state_check check (
  (state = 'proposed' and pursuing_at is null
    and expense_id is null and achieved_on is null and achieved_at is null)
  or
  (state = 'pursuing' and pursuing_at is not null
    and expense_id is null and achieved_on is null and achieved_at is null)
  or
  -- 이룬 것에는 pursuing_at 을 안 묻는다. 혼자 담아 두고 혼자 이룰 수 있다.
  (state = 'achieved' and achieved_on is not null and achieved_at is not null)
);

/* ── 2. 자리 ─────────────────────────────────────────────── */

alter table wish_items add column if not exists sort_order integer not null default 0;

-- 이미 있는 것은 담은 순으로 자리를 매긴다. 최근에 담은 것이 위다 — 지금 보이는 차례 그대로.
-- 한 번만 매긴다. 두 번째부터는 사람이 정해 둔 순서를 뒤엎으면 안 된다.
update wish_items w set sort_order = 차례.자리
  from (
    select id, row_number() over (
      partition by household_id, created_by order by created_at desc, id
    ) - 1 as 자리
    from wish_items
  ) 차례
 where 차례.id = w.id
   and not exists (select 1 from wish_items x where x.sort_order <> 0);

create index if not exists wish_items_order_idx
  on wish_items (household_id, created_by, sort_order);

/* ── 3. 모양 하나 ────────────────────────────────────────── */

drop function if exists move_wish(uuid, text);
drop function if exists achieve_wish(uuid, uuid);
drop function if exists agree_wish(uuid);
drop function if exists update_wish(uuid, text, text, integer, text);
drop function if exists create_wish(text, text, integer, text);
drop function if exists create_wish(text, text, integer);
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
  sort_order integer,
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
    w.expense_id, w.achieved_on, w.achieved_at, w.sort_order,
    array(
      select a.user_id
      from wish_agreements a
      where a.wish_id = w.id
      order by a.agreed_at, a.user_id
    )
  from wish_items w
  where w.id = p_wish_id
$$;

/* ── 4. 쓰기 넷 ──────────────────────────────────────────── */

-- 올린다는 것 자체가 첫 찬성이다. 항목과 첫 합의가 한 트랜잭션으로 함께 생긴다.
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
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

  -- 새로 담은 것이 맨 위다. 방금 적은 것을 찾으러 아래로 내려가게 두지 않는다.
  insert into wish_items (household_id, name, url, note, estimated_price, created_by, sort_order)
  values (
    v_household, trim(p_name), nullif(trim(coalesce(p_url, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''), p_estimated_price, v_me,
    coalesce((select min(w.sort_order) - 1 from wish_items w
              where w.household_id = v_household and w.created_by = v_me), 0)
  )
  returning id into v_id;

  insert into wish_agreements (wish_id, user_id) values (v_id, v_me);

  return query select * from wish_snapshot(v_id);
end;
$$;

-- 합의 기록과 필요하다면 pursuing 전환까지 한 트랜잭션 안에서 끝낸다.
create or replace function agree_wish(p_wish_id uuid)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_me uuid := auth.uid();
  v_all int;
  v_agreed int;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

  if not exists (
    select 1 from wish_items w
    where w.id = p_wish_id and w.household_id = v_household and w.state = 'proposed'
  ) then
    raise exception '담아 둔 위시를 찾을 수 없습니다';
  end if;

  insert into wish_agreements (wish_id, user_id)
  values (p_wish_id, v_me)
  on conflict do nothing;

  -- 주의: 이 줄이 한동안 household_members 를 보고 있었다. 그런 표는 없다 —
  -- 한 집의 사람은 profiles.household_id 로 센다. migration-wish-agree-fix.sql 이 고친다.
  select count(*) into v_all from profiles p where p.household_id = v_household;
  select count(*) into v_agreed from wish_agreements a where a.wish_id = p_wish_id;

  if v_agreed >= v_all then
    update wish_items
       set state = 'pursuing', pursuing_at = now()
     where wish_items.id = p_wish_id;
  end if;

  return query select * from wish_snapshot(p_wish_id);
end;
$$;

-- 지출 날짜 복사와 achieved 전환을 한 요청 안에서 끝낸다.
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

-- 담아 둔 것을 고친다. 이룬 것은 못 고친다 — 이미 끝난 줄이다.
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
  v_old_url text;
  v_new_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  select w.url into v_old_url
    from wish_items w
   where w.id = p_wish_id and w.household_id = v_household and w.state <> 'achieved';
  if not found then
    raise exception '고칠 위시를 찾을 수 없습니다';
  end if;

  update wish_items
     set name = trim(p_name),
         url = v_new_url,
         note = nullif(trim(coalesce(p_note, '')), ''),
         estimated_price = p_estimated_price,
         -- 링크가 바뀌면 그림 주소를 지운다. 다른 물건의 그림이 남으면 안 된다.
         image_url = case when v_new_url is distinct from v_old_url then null else image_url end
   where wish_items.id = p_wish_id;

  return query select * from wish_snapshot(p_wish_id);
end;
$$;

/* ── 5. 자리 옮기기 ──────────────────────────────────────── */

-- 맨 위로 · 위로 · 아래로. 바뀐 줄만 돌려준다 — 위·아래는 두 줄, 맨 위로는 한 줄이다.
--
-- 남의 목록은 못 건드린다. 각자의 목록이고 순서는 담은 사람이 정한다.
-- 이룬 것은 화면에 없으므로 자리 다툼에서도 뺀다.
create or replace function move_wish(p_wish_id uuid, p_where text)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_me uuid := auth.uid();
  v_order integer;
  v_min integer;
  v_other_id uuid;
  v_other_order integer;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;
  if p_where not in ('top', 'up', 'down') then
    raise exception '어디로 옮길지 알 수 없습니다';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

  select w.sort_order into v_order
    from wish_items w
   where w.id = p_wish_id
     and w.household_id = v_household
     and w.created_by = v_me
     and w.state <> 'achieved';
  if not found then
    raise exception '옮길 위시를 찾을 수 없습니다';
  end if;

  select min(w.sort_order) into v_min
    from wish_items w
   where w.household_id = v_household and w.created_by = v_me and w.state <> 'achieved';

  if p_where = 'top' then
    -- 이미 맨 위면 그대로 둔다. 안 그러면 누를 때마다 값이 끝없이 작아진다.
    if v_order > v_min then
      update wish_items set sort_order = v_min - 1 where wish_items.id = p_wish_id;
    end if;
    return query select * from wish_snapshot(p_wish_id);
    return;
  end if;

  -- 위로면 바로 위의 것, 아래로면 바로 아래의 것과 맞바꾼다.
  -- 값이 같을 수 있으므로 id 까지 묶어 견준다 — 화면이 세우는 차례와 같은 규칙이다.
  if p_where = 'up' then
    select w.id, w.sort_order into v_other_id, v_other_order
      from wish_items w
     where w.household_id = v_household and w.created_by = v_me
       and w.state <> 'achieved'
       and (w.sort_order, w.id) < (v_order, p_wish_id)
     order by w.sort_order desc, w.id desc
     limit 1;
  else
    select w.id, w.sort_order into v_other_id, v_other_order
      from wish_items w
     where w.household_id = v_household and w.created_by = v_me
       and w.state <> 'achieved'
       and (w.sort_order, w.id) > (v_order, p_wish_id)
     order by w.sort_order asc, w.id asc
     limit 1;
  end if;

  -- 끝에 있으면 더 갈 곳이 없다. 잘못이 아니라 그냥 그대로다.
  if v_other_id is null then
    return query select * from wish_snapshot(p_wish_id);
    return;
  end if;

  -- 값이 같으면 맞바꿔도 자리가 안 바뀐다. 그때는 한 칸 벌린다.
  if v_other_order = v_order then
    v_other_order := case when p_where = 'up' then v_order - 1 else v_order + 1 end;
  end if;

  update wish_items set sort_order = v_other_order where wish_items.id = p_wish_id;
  update wish_items set sort_order = v_order where wish_items.id = v_other_id;

  return query
    select * from wish_snapshot(p_wish_id)
    union all
    select * from wish_snapshot(v_other_id);
end;
$$;

/* ── 6. 권한 ─────────────────────────────────────────────── */

revoke execute on function wish_snapshot(uuid)                          from public, anon;
revoke execute on function create_wish(text, text, integer, text)       from public, anon;
revoke execute on function agree_wish(uuid)                             from public, anon;
revoke execute on function achieve_wish(uuid, uuid)                     from public, anon;
revoke execute on function update_wish(uuid, text, text, integer, text) from public, anon;
revoke execute on function move_wish(uuid, text)                        from public, anon;

grant execute on function create_wish(text, text, integer, text)        to authenticated;
grant execute on function agree_wish(uuid)                              to authenticated;
grant execute on function achieve_wish(uuid, uuid)                      to authenticated;
grant execute on function update_wish(uuid, text, text, integer, text)  to authenticated;
grant execute on function move_wish(uuid, text)                         to authenticated;

-- 확인
--   select name, created_by, sort_order from wish_items where state <> 'achieved'
--     order by created_by, sort_order;
--   select name, sort_order from move_wish('<id>', 'top');
