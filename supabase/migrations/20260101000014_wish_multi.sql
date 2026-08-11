-- 함께 바라는 것을 여럿 둘 수 있게 한다. (기존 프로젝트용)
--
-- 집마다 하나로 묶어 뒀는데, 그러면 나중에 담은 것은 앞의 것이 끝날 때까지 아무 표시도
-- 못 받는다. 진척이 동기인 화면에서 그건 "올려두고 아무것도 안 하는" 것과 같다.
--
-- 인덱스만 지우면 함수 안의 주석이 거짓이 된다. 반환 모양은 그대로라 replace 로 족하다.

drop index if exists wish_items_one_pursuing_per_household_idx;

create or replace function agree_wish(p_wish_id uuid)
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
