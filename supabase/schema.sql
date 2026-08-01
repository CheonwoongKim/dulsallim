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
  select value in ('food', 'cafe', 'grocery', 'living', 'transport', 'housing', 'leisure', 'etc')
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
    exists (
      select 1 from expenses e
      where e.id = expense_notes.expense_id
        and e.household_id = current_household_id()
    )
  );

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
grant update (display_name, avatar_color, monthly_goal) on profiles to authenticated;

grant select, insert, update, delete
  on fixed_costs, expenses, fixed_cost_applications, expense_notes
  to authenticated;

revoke all on households, profiles, fixed_costs, expenses, fixed_cost_applications, expense_notes from anon;

-- ── 실시간 ──────────────────────────────────────────────────────
-- 상대가 남긴 메시지와 지출이 새로고침 없이 바로 뜨게 한다.
alter publication supabase_realtime add table expense_notes;
alter publication supabase_realtime add table expenses;
