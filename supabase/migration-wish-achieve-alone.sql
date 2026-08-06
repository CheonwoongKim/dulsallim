-- 이룸을 혼자서도 누를 수 있게 한다.
--
-- 지금까지는 state = 'pursuing' 인 것만 이룰 수 있었다. 담은 사람 혼자 바라는 것은
-- 상대가 "나도" 를 누르기 전까지 proposed 에 머무는데, 그동안은 이미 산 물건도
-- 이룸으로 넘길 길이 없었다 — 화면에는 "상대 기다리는 중" 만 떴다.
--
-- 위시는 각자가 담는 것이고 이룸은 담은 사람의 일이다. 상대의 동의는 "함께 바라는 것"
-- 으로 올라가는 조건이지, 내가 산 것을 산 것으로 적는 조건이 아니다.
--
-- 바꾸는 것은 조건 한 줄뿐이다. 돌려주는 모양도, 지출을 하나 고르게 하는 것도 그대로다.
-- 그래서 drop 없이 create or replace 로 덮는다(반환 타입이 그대로라 가능하다).

create or replace function achieve_wish(p_wish_id uuid, p_expense_id uuid)
returns table (
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

  -- 아직 안 이룬 것이면 된다. 혼자 바라는 것(proposed)도 여기에 들어온다.
  if not exists (
    select 1 from wish_items w
    where w.id = p_wish_id
      and w.household_id = v_household
      and w.state <> 'achieved'
  ) then
    raise exception '아직 안 이룬 위시를 찾을 수 없습니다';
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

revoke execute on function achieve_wish(uuid, uuid) from public, anon;
grant execute on function achieve_wish(uuid, uuid)  to authenticated;

-- 확인: 혼자 바라는 것도 이룸으로 넘어가는가
--   select state from wish_items where id = '...';   -- proposed
--   select state from achieve_wish('...', '...');    -- achieved
