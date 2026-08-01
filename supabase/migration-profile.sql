-- 마이페이지 추가에 따른 변경 (한 번만 실행)
--
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 이미 schema.sql 을 실행한 프로젝트에 덧붙이는 용도다. 여러 번 실행해도 안전하다.

-- ── 1) 아바타 색상 ──────────────────────────────────────────────
alter table profiles
  add column if not exists avatar_color text not null default '#20211e';

-- 지금 화면과 똑같이 맞춘다. 먼저 만든 사람이 먹색, 다음 사람이 살구색.
with ordered as (
  select id, row_number() over (order by created_at) as seat from profiles
)
update profiles p
   set avatar_color = '#f2674b'
  from ordered o
 where o.id = p.id and o.seat = 2 and p.avatar_color = '#20211e';

-- 팔레트에 없는 값이 들어오면 거절한다. 화면에서 고르게 하더라도 판단은 DB가 한다.
alter table profiles drop constraint if exists profiles_avatar_color_check;
alter table profiles add constraint profiles_avatar_color_check
  check (avatar_color in ('#20211e', '#f2674b', '#8da697', '#5b7fa6', '#c2883f', '#8d6a91'));

-- ── 2) 본인 프로필만 수정 ───────────────────────────────────────
-- 읽기는 같은 가구 전체, 쓰기는 자기 자신만. 상대 이름을 내가 바꿀 일은 없다.
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- 권한을 열 단위로 준다. 이게 핵심이다.
-- 테이블 전체에 update 를 주면 본인 행의 household_id 를 남의 가구로 바꿔치기할 수 있고,
-- 그러면 RLS 의 "같은 가구" 판단 자체가 뚫린다. 바꿀 수 있는 열만 정확히 연다.
revoke update on profiles from authenticated;
grant update (display_name, avatar_color) on profiles to authenticated;

revoke all on profiles from anon;

-- ── 확인 ────────────────────────────────────────────────────────
-- 아래가 정확히 display_name, avatar_color 두 줄만 나와야 한다.
select column_name
  from information_schema.column_privileges
 where grantee = 'authenticated'
   and table_name = 'profiles'
   and privilege_type = 'UPDATE'
 order by column_name;
