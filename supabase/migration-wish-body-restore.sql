-- 다시 적다 어긋난 몸통 둘을 옛것으로 되돌린다.
--
-- migration-wish-order.sql 에서 반환 모양을 wish_row 타입으로 바꾸느라 다섯 함수를 다시
-- 적었는데, 그 김에 몸통까지 손으로 옮겨 적었다. 세 곳이 어긋났다 —
--
--   agree_wish   사람 수를 없는 표에서 셌다 (migration-wish-agree-fix.sql 이 이미 고침)
--   create_wish  한 사람 가구면 담자마자 pursuing 으로 올리던 갈래가 없어졌다
--   update_wish  이룬 것을 고치려 할 때 "이미 이룬 위시입니다" 대신 뭉뚱그린 말이 나왔다
--
-- 반환 모양만 바꿔야 했다. 이 파일은 옛 몸통을 그대로 되살리고 반환 모양만 wish_row 로
-- 둔다 — 새로 적은 것은 sort_order 를 채우는 한 줄뿐이다.

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

  -- 새로 담은 것이 맨 위다. 방금 적은 것을 찾으러 아래로 내려가게 두지 않는다.
  insert into wish_items (household_id, name, url, note, estimated_price, created_by, sort_order)
  values (v_household, trim(p_name), nullif(trim(p_url), ''), nullif(trim(p_note), ''),
          p_estimated_price, auth.uid(),
          coalesce((select min(w.sort_order) - 1 from wish_items w
                    where w.household_id = v_household and w.created_by = auth.uid()), 0))
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

revoke execute on function create_wish(text, text, integer, text)       from public, anon;
revoke execute on function update_wish(uuid, text, text, integer, text) from public, anon;

grant execute on function create_wish(text, text, integer, text)        to authenticated;
grant execute on function update_wish(uuid, text, text, integer, text)  to authenticated;

-- 확인
--   select prosrc from pg_proc where proname = 'create_wish';   -- count(*) from profiles 갈래가 있어야 한다
--   select prosrc from pg_proc where proname = 'update_wish';   -- '이미 이룬 위시입니다' 가 있어야 한다
