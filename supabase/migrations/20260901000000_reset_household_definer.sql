-- 초기화가 서버에서 막혀 있던 것을 푼다.
--
-- reset_household 는 wish_items 를 지우는데, authenticated 에게는 그 표에 select 밖에 없다
-- (wish 를 들일 때 revoke all / grant select 로 잠갔다). 그래서 "데이터 초기화" 를 누르면
-- permission denied for table wish_items 로 막혔다. 위시가 들어온 뒤로 계속 그랬다.
--
-- 진짜 Postgres 에 스키마를 올려 놓고 눌러 보고서야 알았다. 목 서버에는 권한이 없어
-- 브라우저에서는 되는 것처럼 보였다.
--
-- 몸통은 schema.sql 에서 그대로 복사한다. 옮겨 적지 않는다.

create or replace function reset_household()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  v_household := current_household_id();
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  delete from wish_items  where household_id = v_household;
  delete from fixed_costs where household_id = v_household;
  delete from expenses    where household_id = v_household;
end;
$$;
