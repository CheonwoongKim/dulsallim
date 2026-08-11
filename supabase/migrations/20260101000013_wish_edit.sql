-- 담아 둔 위시를 고칠 수 있게 한다. (기존 프로젝트용)
--
-- 표는 그대로다. 함수 하나만 는다.

-- 담아 둔 것을 고친다. 이룬 것은 못 고친다 — 이미 끝난 줄이다.
--
-- 링크가 바뀌면 그림 주소를 지운다. 다른 물건의 그림이 그대로 남으면 안 되고,
-- 비워 두면 화면이 다음에 열릴 때 새 링크에서 다시 찾아 온다.
create or replace function update_wish(
  p_wish_id uuid,
  p_name text,
  p_url text default null,
  p_estimated_price integer default null,
  p_note text default null
)
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

revoke execute on function update_wish(uuid, text, text, integer, text) from public, anon;
grant execute on function update_wish(uuid, text, text, integer, text)  to authenticated;
