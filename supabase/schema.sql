-- 둘살림 스키마
--
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 실행하면 된다.
-- 여러 번 실행해도 안전하도록 작성했다(모두 if not exists / or replace).
--
-- 설계 원칙
--   1) 권한 판단의 기준은 "가구(household)"다. 로그인만 했다고 열어주지 않는다.
--      anon key는 프론트엔드에 공개되므로, 가입만 하면 남의 가계부가 보이는 일이 없어야 한다.
--   2) 중복 방지는 클라이언트가 아니라 DB가 한다. 폰이 두 대라 동시에 같은 일을 시도할 수 있다.
--   3) 금액은 원 단위 정수. 소수점이 없어 부동소수 오차가 끼어들 여지를 없앤다.

-- ── 가구 ────────────────────────────────────────────────────────
create table if not exists households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ── 계정 ↔ 표시 이름 ────────────────────────────────────────────
-- auth.users는 Supabase가 관리한다. 여기서는 참조만 하고 직접 건드리지 않는다.
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  display_name text not null,
  -- 목록·요약에서 두 사람을 구분하는 색. 팔레트 밖의 값은 DB가 거절한다.
  avatar_color text not null default '#20211e'
    check (avatar_color in ('#20211e', '#f2674b', '#8da697', '#5b7fa6', '#c2883f', '#8d6a91')),
  -- 한 달에 이만큼까지 쓰겠다는 다짐. 비어 있으면 정하지 않은 것이다.
  monthly_goal integer check (monthly_goal is null or monthly_goal > 0),
  -- 내가 심어 둔 소비 잔소리를 울릴지. 지우지 않고 잠시 멈출 수 있게 한다.
  nag_enabled  boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists profiles_household_idx on profiles (household_id);

-- ── 분류 ────────────────────────────────────────────────────────
-- 프론트엔드도 검증하지만 DB에서도 막는다. 잘못된 값은 조용히 저장되기보다 실패하는 편이 낫다.
-- 분류를 추가하려면 이 목록에 넣고 다시 실행한다.
create or replace function is_valid_category(value text)
returns boolean
language sql
immutable
as $$
  select value in (
    'food', 'cafe', 'grocery', 'living', 'transport', 'housing', 'leisure',
    'medical', 'pet',
    'etc'
  )
$$;

-- ── 고정비 템플릿 ───────────────────────────────────────────────
create table if not exists fixed_costs (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  paid_by      uuid not null references profiles(id),
  category     text not null check (is_valid_category(category)),
  item         text not null check (char_length(trim(item)) > 0),
  amount       integer not null check (amount > 0),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  -- 시작 "월"이지만 date 타입으로 두고 항상 1일로 정규화한다. 월 비교가 쉬워진다.
  start_month  date not null check (start_month = date_trunc('month', start_month)::date),
  created_at   timestamptz not null default now()
);

create index if not exists fixed_costs_household_idx on fixed_costs (household_id);

-- ── 지출 ────────────────────────────────────────────────────────
create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  paid_by       uuid not null references profiles(id),
  spent_on      date not null,
  category      text not null check (is_valid_category(category)),
  item          text not null check (char_length(trim(item)) > 0),
  amount        integer not null check (amount > 0),
  -- 고정비에서 자동 생성됐는지. 템플릿을 지워도 지출 기록은 남아야 하므로 set null.
  fixed_cost_id uuid references fixed_costs(id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid not null references profiles(id)
);

-- 화면이 항상 "한 달"을 조회하므로 이 조합으로 인덱스를 건다.
create index if not exists expenses_household_month_idx on expenses (household_id, spent_on desc);

-- ── 고정비 반영 기록 ────────────────────────────────────────────
-- (템플릿, 월)을 기본키로 두어 DB가 직접 중복을 막는다.
-- 폰 두 대가 동시에 앱을 열어도 두 번 반영될 수 없다. 두 번째 insert는 실패한다.
create table if not exists fixed_cost_applications (
  fixed_cost_id uuid not null references fixed_costs(id) on delete cascade,
  month         date not null check (month = date_trunc('month', month)::date),
  expense_id    uuid references expenses(id) on delete set null,
  applied_at    timestamptz not null default now(),
  primary key (fixed_cost_id, month)
);

-- ── 지출별 대화 ─────────────────────────────────────────────────
create table if not exists expense_notes (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  author_id  uuid not null references profiles(id),
  body       text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists expense_notes_expense_idx on expense_notes (expense_id, created_at);

-- ── 소비 잔소리 ─────────────────────────────────────────────────
-- 상대가 월 목표의 몇 %를 넘길 때 대신 남겨 줄 말을 미리 심어 둔다.
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

-- 울린 기록. (대상, 달, 구간)이 기본키라 두 폰이 동시에 계산해도 하나만 통과한다.
-- 이게 없으면 80%를 넘긴 뒤 지출할 때마다 매번 잔소리가 붙는다.
create table if not exists nag_fires (
  target_id  uuid not null references profiles(id) on delete cascade,
  month      date not null check (month = date_trunc('month', month)::date),
  percent    smallint not null,
  expense_id uuid references expenses(id) on delete set null,
  fired_at   timestamptz not null default now(),
  primary key (target_id, month, percent)
);

-- ── 권한 ────────────────────────────────────────────────────────
-- 호출자가 속한 가구를 돌려준다.
-- security definer: profiles를 읽어야 하는데 profiles 자체도 RLS가 걸려 있어 무한 재귀를 피하려면 필요하다.
create or replace function current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from profiles where id = auth.uid()
$$;

alter table households              enable row level security;
alter table profiles                enable row level security;
alter table fixed_costs             enable row level security;
alter table expenses                enable row level security;
alter table fixed_cost_applications enable row level security;
alter table expense_notes           enable row level security;
alter table nags                    enable row level security;
alter table nag_fires               enable row level security;

-- 같은 가구에 속한 사람만 읽고 쓴다. 로그인만 한 외부인은 아무것도 볼 수 없다.
drop policy if exists household_read on households;
create policy household_read on households
  for select using (id = current_household_id());

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select using (household_id = current_household_id());

-- 읽기는 같은 가구 전체, 쓰기는 자기 자신만. 상대 이름을 내가 바꿀 일은 없다.
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists fixed_costs_all on fixed_costs;
create policy fixed_costs_all on fixed_costs
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

drop policy if exists expenses_all on expenses;
create policy expenses_all on expenses
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- 반영 기록과 대화는 household_id를 따로 갖지 않으므로 부모를 거쳐 확인한다.
drop policy if exists fixed_cost_applications_all on fixed_cost_applications;
create policy fixed_cost_applications_all on fixed_cost_applications
  for all using (
    exists (
      select 1 from fixed_costs f
      where f.id = fixed_cost_applications.fixed_cost_id
        and f.household_id = current_household_id()
    )
  )
  with check (
    exists (
      select 1 from fixed_costs f
      where f.id = fixed_cost_applications.fixed_cost_id
        and f.household_id = current_household_id()
    )
  );

-- 읽기는 같은 가구 전체(상대가 남긴 말을 봐야 하니까), 쓰기는 반드시 자기 이름으로.
-- author_id 를 확인하지 않으면 브라우저를 거치지 않고 API 를 직접 불러
-- 상대 이름으로 메시지를 지어낼 수 있다.
drop policy if exists expense_notes_all on expense_notes;
create policy expense_notes_all on expense_notes
  for all using (
    exists (
      select 1 from expenses e
      where e.id = expense_notes.expense_id
        and e.household_id = current_household_id()
    )
  )
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from expenses e
      where e.id = expense_notes.expense_id
        and e.household_id = current_household_id()
    )
  );

-- 잔소리는 쓴 사람만 본다. 대상이 미리 읽으면 재미가 없다.
-- nag_fires 에는 정책을 두지 않는다. 아래 fire_nags(security definer)만 손댄다.
drop policy if exists nags_own on nags;
create policy nags_own on nags
  for all using (author_id = auth.uid())
  with check (author_id = auth.uid() and household_id = current_household_id());

-- ── 테이블 권한 ─────────────────────────────────────────────────
-- RLS와 별개인 두 번째 방어선이다.
--   · RLS는 "어떤 행을 볼 수 있나"를 정한다.
--   · GRANT는 "테이블에 손댈 수 있나"를 정한다.
-- 로그인하지 않은 anon 역할에는 아무 권한도 주지 않는다. 정책 실수가 있어도 비로그인 접근은 막힌다.
-- 대시보드에서 "새 테이블 자동 노출"을 꺼두더라도 이 구문 덕분에 앱이 정상 동작한다.
grant usage on schema public to authenticated;

grant select on households, profiles to authenticated;

-- 프로필 수정 권한은 열 단위로 준다. 테이블 전체에 update 를 주면 본인 행의 household_id 를
-- 남의 가구로 바꿔치기할 수 있고, 그러면 "같은 가구" 판단 자체가 뚫린다.
grant update (display_name, avatar_color, monthly_goal, nag_enabled) on profiles to authenticated;

grant select, insert, update, delete
  on fixed_costs, expenses, fixed_cost_applications
  to authenticated;

-- 대화는 남기기만 한다. 고치거나 지우는 화면이 없으므로 권한도 주지 않는다.
-- 정책의 with check 가 위조를 막고, 여기서 update/delete 를 빼 상대 말을 건드릴 길까지 없앤다.
-- (지출을 지우면 달린 대화도 사라지는데, 그건 on delete cascade 라 이 권한과 무관하다.)
revoke update, delete on expense_notes from authenticated;
grant select, insert on expense_notes to authenticated;

grant select, insert, update, delete on nags to authenticated;

-- 울린 기록은 아무도 직접 못 만진다. fire_nags 만 넣고, 그래야 한 번만 울린다.
revoke all on nag_fires from authenticated, anon;

revoke all on households, profiles, fixed_costs, expenses, fixed_cost_applications, expense_notes, nags from anon;

-- ── 서버가 통째로 처리하는 일 ───────────────────────────────────
-- 함수 하나는 트랜잭션 하나다. 여러 요청으로 나누면 중간에 끊겼을 때
-- 절반만 적용된 상태가 남는데, 여기 모아 두면 전부 되거나 전부 안 된다.

-- 가구의 기록을 지운다. 고정비를 먼저 지워야 반영 기록이 함께 사라지고,
-- 그래야 초기화 직후에 지난 달 고정비가 되살아나지 않는다.
create or replace function reset_household()
returns void
language plpgsql
as $$
declare
  v_household uuid;
begin
  v_household := current_household_id();
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  delete from fixed_costs where household_id = v_household;
  delete from expenses    where household_id = v_household;
end;
$$;

-- 고정비 한 건을 그 달의 지출로 만든다.
--
-- 반영 표시와 지출 생성이 한 트랜잭션 안에 있는 게 핵심이다.
--   · 지출 생성이 실패하면 반영 표시도 함께 사라져 다음에 다시 시도된다
--   · 커밋된 뒤 응답만 유실되면 표시가 남아 있어 재시도해도 중복이 생기지 않는다
-- 날짜 계산은 화면이 한다(말일 보정 규칙이 그쪽에 있고 이미 검증돼 있다).
--
-- @returns 만들어진 지출 한 줄. 이미 반영된 달이면 빈 결과.
create or replace function apply_fixed_cost(
  p_fixed_cost_id uuid,
  p_month         date,
  p_spent_on      date
)
returns setof expenses
language plpgsql
-- security definer 로 두는 이유: 본문에서 auth.uid() 를 직접 부른다.
-- RLS 를 우회하게 되므로, 아래 "내 가구인가" 검사가 그 자리를 대신한다. 지우면 안 된다.
security definer
set search_path = public
as $$
declare
  v_fixed   fixed_costs%rowtype;
  v_month   date := date_trunc('month', p_month)::date;
  v_claimed int;
  v_expense uuid;
begin
  -- 남의 가구 고정비로는 부를 수 없다. definer 라 RLS 가 안 걸리므로 여기서 직접 막는다.
  select * into v_fixed from fixed_costs
   where id = p_fixed_cost_id
     and household_id = current_household_id();
  if not found then
    raise exception '고정비를 찾을 수 없습니다';
  end if;

  insert into fixed_cost_applications (fixed_cost_id, month)
  values (p_fixed_cost_id, v_month)
  on conflict (fixed_cost_id, month) do nothing;

  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then return; end if;   -- 이미 누군가 반영했다

  insert into expenses
    (household_id, paid_by, spent_on, category, item, amount, fixed_cost_id, created_by)
  values
    (v_fixed.household_id, v_fixed.paid_by, p_spent_on, v_fixed.category,
     v_fixed.item, v_fixed.amount, v_fixed.id, auth.uid())
  returning id into v_expense;

  update fixed_cost_applications
     set expense_id = v_expense
   where fixed_cost_id = p_fixed_cost_id and month = v_month;

  return query select * from expenses where id = v_expense;
end;
$$;

-- 방금 기록한 지출이 목표 구간을 넘겼는지 서버가 판단하고, 넘겼으면 서버가 적는다.
--   · 문구는 쓴 사람만 읽을 수 있다. 대상의 폰이 미리 가져올 수 없어야 한다
--   · 두 폰이 같은 순간에 계산해도 한 번만 울린다
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

grant execute on function reset_household()                    to authenticated;
grant execute on function apply_fixed_cost(uuid, date, date)   to authenticated;
grant execute on function fire_nags(uuid)                      to authenticated;

-- ── 실시간 ──────────────────────────────────────────────────────
-- 상대가 남긴 메시지와 지출이 새로고침 없이 바로 뜨게 한다.
-- alter publication 에는 if not exists 가 없어 그냥 쓰면 두 번째 실행에서 멈춘다.
-- 이 파일은 여러 번 실행해도 안전해야 하므로 이미 들어 있는지 보고 넣는다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expense_notes'
  ) then
    alter publication supabase_realtime add table expense_notes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table expenses;
  end if;
end $$;
