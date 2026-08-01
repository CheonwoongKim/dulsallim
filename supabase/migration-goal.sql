-- 월 지출 목표 추가 (한 번만 실행)
--
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 여러 번 실행해도 안전하다.

-- 목표는 사람마다 하나. 비어 있으면(null) 목표를 정하지 않은 것이다.
-- 0원 목표는 뜻이 없으므로 양수만 받는다.
alter table profiles
  add column if not exists monthly_goal integer;

alter table profiles drop constraint if exists profiles_monthly_goal_check;
alter table profiles add constraint profiles_monthly_goal_check
  check (monthly_goal is null or monthly_goal > 0);

-- 수정 가능한 열 목록에 추가한다.
-- 이 구문을 빼먹으면 화면에서는 저장을 눌러도 DB가 거절한다.
-- 여전히 열 단위로만 연다. 테이블 전체에 update 를 주면 household_id 를
-- 남의 가구로 바꿔치기할 수 있고, 그러면 가구 격리가 통째로 뚫린다.
revoke update on profiles from authenticated;
grant update (display_name, avatar_color, monthly_goal) on profiles to authenticated;

revoke all on profiles from anon;

-- ── 확인 ────────────────────────────────────────────────────────
-- 정확히 avatar_color, display_name, monthly_goal 세 줄만 나와야 한다.
select column_name
  from information_schema.column_privileges
 where grantee = 'authenticated'
   and table_name = 'profiles'
   and privilege_type = 'UPDATE'
 order by column_name;
