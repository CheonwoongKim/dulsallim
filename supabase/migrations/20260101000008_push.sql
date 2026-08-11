-- 알림 받을 곳 (한 번만 실행)
--
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
--
-- 한 사람이 폰을 여러 대 쓸 수 있으므로 사람당 여러 줄이 될 수 있다.
-- endpoint 가 그 기기의 주소이자 열쇠다 — 다시 설치하면 새 값이 오고, 옛 줄은
-- 보내는 쪽이 410(사라짐)을 받으면 지운다.

create table if not exists push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- 자기 구독만 만들고 지운다. 남의 알림 주소는 읽지도 못한다.
drop policy if exists "own push subscriptions" on push_subscriptions;
create policy "own push subscriptions" on push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 보내는 쪽(Edge Function)은 service_role 로 읽는다. anon 에게는 아무 권한도 주지 않는다.
revoke all on push_subscriptions from anon;
