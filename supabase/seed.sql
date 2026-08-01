-- 가구 하나를 만들고 두 계정을 연결한다.
--
-- 실행 전에 반드시 할 것
--   1) schema.sql 을 먼저 실행
--   2) Authentication → Users → Add user 로 계정 두 개 생성 (Auto Confirm User 체크)
--   3) 아래 이메일 두 줄을 실제로 만든 계정 이메일로 바꾸기
--
-- 여러 번 실행해도 안전하다. 가구는 하나만 만들고, 프로필은 이름만 갱신한다.

do $$
declare
  target_household uuid;
  linked int;
begin
  select id into target_household from households order by created_at limit 1;

  if target_household is null then
    insert into households (name) values ('둘살림') returning id into target_household;
  end if;

  insert into profiles (id, household_id, display_name)
  select u.id, target_household, v.display_name
  from (values
    ('여기에-천웅-이메일@example.com', '천웅'),
    ('여기에-주연-이메일@example.com', '주연')
  ) as v(email, display_name)
  join auth.users u on lower(u.email) = lower(v.email)
  on conflict (id) do update
    set display_name = excluded.display_name,
        household_id = excluded.household_id;

  get diagnostics linked = row_count;

  if linked < 2 then
    raise exception
      '계정을 % 개만 찾았습니다. 이메일이 auth.users 와 정확히 일치하는지 확인하세요.', linked;
  end if;

  raise notice '가구 % 에 계정 %개를 연결했습니다.', target_household, linked;
end $$;

-- 확인용
select p.display_name, u.email, h.name as household
from profiles p
join auth.users u on u.id = p.id
join households h on h.id = p.household_id
order by p.created_at;
