-- 소비 잔소리 (한 번만 실행)
--
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 여러 번 실행해도 안전하다.

-- ── 1) 잔소리를 켤지 끌지 ───────────────────────────────────────
alter table profiles
  add column if not exists nag_enabled boolean not null default true;

revoke update on profiles from authenticated;
grant update (display_name, avatar_color, monthly_goal, nag_enabled) on profiles to authenticated;

-- ── 2) 잔소리 문구 ──────────────────────────────────────────────
create table if not exists nags (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  author_id    uuid not null references profiles(id) on delete cascade,
  target_id    uuid not null references profiles(id) on delete cascade,
  -- 목표의 몇 %를 넘을 때 울릴지. 100을 넘겨 두는 것도 뜻이 있다.
  percent      smallint not null check (percent between 1 and 200),
  body         text not null check (char_length(trim(body)) > 0),
  created_at   timestamptz not null default now()
);

-- 같은 구간에 두 마디를 둘 수 없다. 어느 것이 울릴지 알 수 없어진다.
create unique index if not exists nags_author_percent_idx on nags (author_id, percent);

-- ── 3) 울린 기록 ────────────────────────────────────────────────
-- (대상, 달, 구간)이 기본키다. 두 폰이 동시에 계산해도 DB가 하나만 통과시킨다.
-- 이게 없으면 80%를 넘긴 뒤 지출할 때마다 매번 잔소리가 붙는다.
create table if not exists nag_fires (
  target_id  uuid not null references profiles(id) on delete cascade,
  month      date not null check (month = date_trunc('month', month)::date),
  percent    smallint not null,
  expense_id uuid references expenses(id) on delete set null,
  fired_at   timestamptz not null default now(),
  primary key (target_id, month, percent)
);

-- ── 4) 접근 권한 ────────────────────────────────────────────────
alter table nags      enable row level security;
alter table nag_fires enable row level security;

-- 잔소리는 쓴 사람만 본다. 대상이 미리 읽으면 재미가 없다.
drop policy if exists nags_own on nags;
create policy nags_own on nags
  for all using (author_id = auth.uid())
  with check (author_id = auth.uid() and household_id = current_household_id());

-- nag_fires 에는 정책을 두지 않는다. 아래 함수(security definer)만 손댄다.
grant select, insert, update, delete on nags to authenticated;
revoke all on nag_fires from authenticated, anon;
revoke all on nags from anon;

-- ── 5) 울리기 ───────────────────────────────────────────────────
-- 서버가 판단하고 서버가 적는다.
--   · 대상의 폰이 문구를 미리 읽을 수 없다 (nags 는 쓴 사람만 볼 수 있으므로)
--   · 누가 기록했든 한 번만 울린다
--   · 메시지의 작성자가 실제로 그 말을 쓴 사람이 된다
create or replace function fire_nags(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid_by uuid;
  v_month   date;
  v_goal    integer;
  v_spent   bigint;
  v_ratio   numeric;
  v_top     smallint;
  v_nag     nags%rowtype;
begin
  select paid_by, date_trunc('month', spent_on)::date
    into v_paid_by, v_month
    from expenses
   where id = p_expense_id
     and household_id = current_household_id();   -- 남의 가구 지출로는 부를 수 없다
  if not found then return; end if;

  -- 이번 달 지출에만 울린다. 9월에 7월 기록을 넣었다고 울리면 이상하다.
  if v_month <> date_trunc('month', current_date)::date then return; end if;

  select monthly_goal into v_goal from profiles where id = v_paid_by;
  if v_goal is null or v_goal <= 0 then return; end if;

  select coalesce(sum(amount), 0) into v_spent
    from expenses
   where paid_by = v_paid_by
     and date_trunc('month', spent_on)::date = v_month;

  v_ratio := (v_spent::numeric / v_goal) * 100;

  -- 넘어선 구간을 모두 '울림'으로 표시한다.
  -- 40% 에서 85% 로 뛰면 50·70·80 을 한꺼번에 지나므로, 표시하지 않으면
  -- 다음 지출에서 70 이, 그다음에 50 이 뒤늦게 울린다.
  with newly as (
    insert into nag_fires (target_id, month, percent, expense_id)
    select n.target_id, v_month, n.percent, p_expense_id
      from nags n
      join profiles p on p.id = n.author_id
     where n.target_id = v_paid_by
       and p.nag_enabled
       and n.percent <= v_ratio
    on conflict (target_id, month, percent) do nothing
    returning percent
  )
  select max(percent) into v_top from newly;

  if v_top is null then return; end if;

  -- 실제로 말하는 건 가장 높은 구간 하나. 셋이 한꺼번에 붙으면 도배가 된다.
  select * into v_nag from nags where target_id = v_paid_by and percent = v_top;
  if not found then return; end if;

  insert into expense_notes (expense_id, author_id, body)
  values (p_expense_id, v_nag.author_id, v_nag.body);
end;
$$;

grant execute on function fire_nags(uuid) to authenticated;

-- ── 확인 ────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('nags', 'nag_fires')) as 표_2개,
  (select count(*) from information_schema.column_privileges
    where grantee = 'authenticated' and table_name = 'nag_fires') as 울린기록_직접접근_0건,
  (select count(*) from pg_proc where proname = 'fire_nags') as 함수_1개;
