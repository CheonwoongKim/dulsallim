-- agree_wish 가 없는 표를 보고 있었다. "나도" 가 아예 안 눌린다.
--
-- migration-wish-order.sql 에서 다섯 함수의 반환 모양을 wish_row 타입으로 바꾸면서
-- agree_wish 의 몸통을 다시 적었는데, 그때 사람 수를 household_members 에서 세도록
-- 적었다. 이 스키마에 그런 표는 없다 — 한 집의 사람은 profiles.household_id 로 센다.
--
-- 목 서버에는 그 구분이 없어 브라우저 시험도 통과했다. 옛 함수(migration-wish-multi.sql)
-- 의 세는 법을 그대로 되살린다. 바뀌는 것은 세는 자리뿐이고 반환 모양은 그대로다.

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

revoke execute on function agree_wish(uuid) from public, anon;
grant execute on function agree_wish(uuid)  to authenticated;

-- 확인: 없는 표를 보는 함수가 남아 있지 않다
--   select proname from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and prosrc like '%household_members%';   -- 0줄이어야 한다
