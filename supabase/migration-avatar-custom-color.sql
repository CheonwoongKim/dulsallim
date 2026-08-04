-- 아바타 색상 직접 선택 허용 (한 번만 실행)
--
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 이미 schema.sql 을 실행해 사용 중인 프로젝트에 덧붙이는 용도다.

alter table profiles drop constraint if exists profiles_avatar_color_check;
alter table profiles add constraint profiles_avatar_color_check
  check (avatar_color ~ '^#[0-9a-f]{6}$');
