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
  -- 목록·요약에서 두 사람을 구분하는 색. 직접 고른 6자리 HEX만 허용한다.
  avatar_color text not null default '#20211e'
    check (avatar_color ~ '^#[0-9a-f]{6}$'),
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

-- ── 위시리스트 ──────────────────────────────────────────────────
create table if not exists wish_items (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  name            text not null check (char_length(trim(name)) > 0),
  url             text check (url is null or char_length(trim(url)) > 0),
  -- 왜 갖고 싶은지 한 줄. 값이나 링크보다 이것이 나중에 더 오래 남는다.
  note            text check (note is null or char_length(trim(note)) between 1 and 100),
  estimated_price integer check (estimated_price is null or estimated_price > 0),
  -- 링크에서 찾아낸 대표 그림. 그림 자체는 갖지 않고 주소만 적어 둔다.
  image_url       text check (image_url is null or image_url ~ '^https?://'),
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now(),
  state           text not null default 'proposed'
    check (state in ('proposed', 'pursuing', 'achieved')),
  pursuing_at     timestamptz,
  -- 지출을 지워도 이룬 사실과 날짜는 남긴다. 연결만 끊어지도록 set null.
  expense_id      uuid references expenses(id) on delete set null,
  achieved_on     date,
  achieved_at     timestamptz,
  -- 작을수록 위. 담은 사람마다 따로 센다 — 각자의 목록이라 남의 순서에 끼지 않는다.
  sort_order      integer not null default 0,
  constraint wish_items_state_check check (
    (state = 'proposed' and pursuing_at is null
      and expense_id is null and achieved_on is null and achieved_at is null)
    or
    (state = 'pursuing' and pursuing_at is not null
      and expense_id is null and achieved_on is null and achieved_at is null)
    or
    -- 이룬 것에는 pursuing_at 을 안 묻는다. 혼자 담아 두고 혼자 이룰 수 있다.
    (state = 'achieved' and achieved_on is not null and achieved_at is not null)
  )
);

create index if not exists wish_items_order_idx
  on wish_items (household_id, created_by, sort_order);

create index if not exists wish_items_household_created_idx
  on wish_items (household_id, created_at desc);

-- 사람 수를 열 개수로 굳히지 않는다. 지금은 둘이지만 profiles 는 여러 사람을 담을 수 있다.
create table if not exists wish_agreements (
  wish_id   uuid not null references wish_items(id) on delete cascade,
  user_id   uuid not null references profiles(id),
  agreed_at timestamptz not null default now(),
  primary key (wish_id, user_id)
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
alter table wish_items              enable row level security;
alter table wish_agreements         enable row level security;

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

drop policy if exists wish_items_read on wish_items;
create policy wish_items_read on wish_items
  for select using (household_id = current_household_id());

-- 합의에는 household_id 가 없으므로 expense_notes 처럼 부모를 거쳐 확인한다.
drop policy if exists wish_agreements_read on wish_agreements;
create policy wish_agreements_read on wish_agreements
  for select using (
    exists (
      select 1 from wish_items w
      where w.id = wish_agreements.wish_id
        and w.household_id = current_household_id()
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

-- 위시 상태와 합의는 아래 함수만 바꾼다. 항목과 합의가 절반만 저장되는 일을 막는다.
revoke all on wish_items, wish_agreements from authenticated, anon;
grant select on wish_items, wish_agreements to authenticated;

-- 울린 기록은 아무도 직접 못 만진다. fire_nags 만 넣고, 그래야 한 번만 울린다.
revoke all on nag_fires from authenticated, anon;

revoke all on households, profiles, fixed_costs, expenses, fixed_cost_applications,
  expense_notes, nags, wish_items, wish_agreements from anon;

-- ── 서버가 통째로 처리하는 일 ───────────────────────────────────
-- 함수 하나는 트랜잭션 하나다. 여러 요청으로 나누면 중간에 끊겼을 때
-- 절반만 적용된 상태가 남는데, 여기 모아 두면 전부 되거나 전부 안 된다.

-- 위시 쓰기 함수가 돌려줄 공통 모양. 직접 부르면 RLS 를 우회하므로 공개하지 않는다.
create type wish_row as (
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
  sort_order integer,
  agreement_user_ids uuid[]
);

create or replace function wish_snapshot(p_wish_id uuid)
returns setof wish_row
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id, w.household_id, w.name, w.url, w.note, w.estimated_price, w.image_url,
    w.created_by, w.created_at, w.state, w.pursuing_at,
    w.expense_id, w.achieved_on, w.achieved_at, w.sort_order,
    array(
      select a.user_id
      from wish_agreements a
      where a.wish_id = w.id
      order by a.agreed_at, a.user_id
    )
  from wish_items w
  where w.id = p_wish_id
$$;

/* ── 4. 쓰기 넷 ──────────────────────────────────────────── */

-- 올린다는 것 자체가 첫 찬성이다. 항목과 첫 합의가 한 트랜잭션으로 함께 생긴다.
create or replace function create_wish(
  p_name text,
  p_url text,
  p_estimated_price integer,
  p_note text
)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_wish_id uuid;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  -- 같은 집의 합의·이룸 전환과 줄을 세운다. 한 사람 가구도 유니크 제약과 안전하게 맞물린다.
  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

  -- 새로 담은 것이 맨 위다. 방금 적은 것을 찾으러 아래로 내려가게 두지 않는다.
  insert into wish_items (household_id, name, url, note, estimated_price, created_by, sort_order)
  values (v_household, trim(p_name), nullif(trim(p_url), ''), nullif(trim(p_note), ''),
          p_estimated_price, auth.uid(),
          coalesce((select min(w.sort_order) - 1 from wish_items w
                    where w.household_id = v_household and w.created_by = auth.uid()), 0))
  returning wish_items.id into v_wish_id;

  insert into wish_agreements (wish_id, user_id)
  values (v_wish_id, auth.uid());

  if (select count(*) from profiles p where p.household_id = v_household) = 1 then
    update wish_items
       set state = 'pursuing', pursuing_at = now()
     where wish_items.id = v_wish_id;
  end if;

  return query select * from wish_snapshot(v_wish_id);
end;
$$;

-- 합의 기록과 필요하다면 pursuing 전환까지 한 트랜잭션 안에서 끝낸다.
create or replace function agree_wish(p_wish_id uuid)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_state text;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  -- 같은 집의 두 요청이 동시에 마지막 표를 세는 틈을 없앤다.
  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

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

  insert into wish_agreements (wish_id, user_id)
  values (p_wish_id, auth.uid())
  on conflict (wish_id, user_id) do nothing;

  if v_state = 'proposed'
     and (select count(*) from wish_agreements where wish_id = p_wish_id)
       = (select count(*) from profiles p where p.household_id = v_household) then
    -- 함께 바라는 것은 여럿이어도 된다. 하나로 묶어 두면 나중에 담은 것은 앞의 것이
    -- 끝날 때까지 아무 표시도 못 받는다.
    update wish_items
       set state = 'pursuing', pursuing_at = now()
     where wish_items.id = p_wish_id;
  end if;

  return query select * from wish_snapshot(p_wish_id);
end;
$$;

-- 지출 날짜 복사와 achieved 전환을 한 요청 안에서 끝낸다.
create or replace function achieve_wish(p_wish_id uuid, p_expense_id uuid)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_spent_on date;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

  -- 아직 안 이룬 것이면 된다. 혼자 바라는 것(proposed)도 여기에 들어온다.
  if not exists (
    select 1 from wish_items w
    where w.id = p_wish_id and w.household_id = v_household and w.state <> 'achieved'
  ) then
    raise exception '아직 안 이룬 위시를 찾을 수 없습니다';
  end if;

  select e.spent_on into v_spent_on
    from expenses e
   where e.id = p_expense_id and e.household_id = v_household;
  if not found then
    raise exception '지출을 찾을 수 없습니다';
  end if;

  update wish_items
     set state = 'achieved',
         expense_id = p_expense_id,
         achieved_on = v_spent_on,
         achieved_at = now()
   where wish_items.id = p_wish_id;

  return query select * from wish_snapshot(p_wish_id);
end;
$$;

-- 담아 둔 것을 고친다. 이룬 것은 못 고친다 — 이미 끝난 줄이다.
create or replace function update_wish(
  p_wish_id uuid,
  p_name text,
  p_url text,
  p_estimated_price integer,
  p_note text
)
returns setof wish_row
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

-- 맨 위로 · 위로 · 아래로. 바뀐 줄만 돌려준다 — 위·아래는 두 줄, 맨 위로는 한 줄이다.
--
-- 남의 목록은 못 건드린다. 각자의 목록이고 순서는 담은 사람이 정한다.
-- 이룬 것은 화면에 없으므로 자리 다툼에서도 뺀다.
create or replace function move_wish(p_wish_id uuid, p_where text)
returns setof wish_row
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
  v_me uuid := auth.uid();
  v_order integer;
  v_min integer;
  v_other_id uuid;
  v_other_order integer;
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;
  if p_where not in ('top', 'up', 'down') then
    raise exception '어디로 옮길지 알 수 없습니다';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_household::text, 0));

  select w.sort_order into v_order
    from wish_items w
   where w.id = p_wish_id
     and w.household_id = v_household
     and w.created_by = v_me
     and w.state <> 'achieved';
  if not found then
    raise exception '옮길 위시를 찾을 수 없습니다';
  end if;

  select min(w.sort_order) into v_min
    from wish_items w
   where w.household_id = v_household and w.created_by = v_me and w.state <> 'achieved';

  if p_where = 'top' then
    -- 이미 맨 위면 그대로 둔다. 안 그러면 누를 때마다 값이 끝없이 작아진다.
    if v_order > v_min then
      update wish_items set sort_order = v_min - 1 where wish_items.id = p_wish_id;
    end if;
    return query select * from wish_snapshot(p_wish_id);
    return;
  end if;

  -- 위로면 바로 위의 것, 아래로면 바로 아래의 것과 맞바꾼다.
  -- 값이 같을 수 있으므로 id 까지 묶어 견준다 — 화면이 세우는 차례와 같은 규칙이다.
  if p_where = 'up' then
    select w.id, w.sort_order into v_other_id, v_other_order
      from wish_items w
     where w.household_id = v_household and w.created_by = v_me
       and w.state <> 'achieved'
       and (w.sort_order, w.id) < (v_order, p_wish_id)
     order by w.sort_order desc, w.id desc
     limit 1;
  else
    select w.id, w.sort_order into v_other_id, v_other_order
      from wish_items w
     where w.household_id = v_household and w.created_by = v_me
       and w.state <> 'achieved'
       and (w.sort_order, w.id) > (v_order, p_wish_id)
     order by w.sort_order asc, w.id asc
     limit 1;
  end if;

  -- 끝에 있으면 더 갈 곳이 없다. 잘못이 아니라 그냥 그대로다.
  if v_other_id is null then
    return query select * from wish_snapshot(p_wish_id);
    return;
  end if;

  -- 값이 같으면 맞바꿔도 자리가 안 바뀐다. 그때는 한 칸 벌린다.
  if v_other_order = v_order then
    v_other_order := case when p_where = 'up' then v_order - 1 else v_order + 1 end;
  end if;

  update wish_items set sort_order = v_other_order where wish_items.id = p_wish_id;
  update wish_items set sort_order = v_order where wish_items.id = v_other_id;

  return query
    select * from wish_snapshot(p_wish_id)
    union all
    select * from wish_snapshot(v_other_id);
end;
$$;

-- 담아 둔 것을 지운다. 합의 기록도 함께 사라진다(on delete cascade).
create or replace function delete_wish(p_wish_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  delete from wish_items
   where wish_items.id = p_wish_id
     and household_id = v_household;
  if not found then
    raise exception '위시를 찾을 수 없습니다';
  end if;
end;
$$;

-- 담은 뒤에 대표 그림 주소만 따로 붙인다. 담기는 바로 끝나야 하고 남의 사이트를
-- 읽는 일은 몇 초가 걸리므로, 두 일을 한 요청에 묶지 않는다.
create or replace function set_wish_image(p_wish_id uuid, p_image_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := current_household_id();
begin
  if v_household is null then
    raise exception '가구를 찾을 수 없습니다';
  end if;

  update wish_items
     set image_url = nullif(trim(p_image_url), '')
   where id = p_wish_id
     and household_id = v_household;
end;
$$;

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

  delete from wish_items  where household_id = v_household;
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

-- 표와 달리 함수는 실행 권한이 기본으로 PUBLIC 에 열려 있다.
-- grant 만 적어 두면 anon key 를 아는 사람 누구나 부를 수 있고,
-- 이 셋은 definer 라 소유자 권한으로 돈다. 먼저 닫고 필요한 역할에만 연다.
revoke execute on function reset_household()                  from public, anon;
revoke execute on function apply_fixed_cost(uuid, date, date) from public, anon;
revoke execute on function fire_nags(uuid)                    from public, anon;
revoke execute on function wish_snapshot(uuid)                from public, authenticated, anon;
revoke execute on function create_wish(text, text, integer, text)   from public, anon;
revoke execute on function agree_wish(uuid)                   from public, anon;
revoke execute on function achieve_wish(uuid, uuid)           from public, anon;
revoke execute on function move_wish(uuid, text)              from public, anon;
revoke execute on function update_wish(uuid, text, text, integer, text) from public, anon;
revoke execute on function delete_wish(uuid)                  from public, anon;
revoke execute on function set_wish_image(uuid, text)          from public, anon;

grant execute on function reset_household()                    to authenticated;
grant execute on function apply_fixed_cost(uuid, date, date)   to authenticated;
grant execute on function fire_nags(uuid)                      to authenticated;
grant execute on function create_wish(text, text, integer, text) to authenticated;
grant execute on function agree_wish(uuid)                     to authenticated;
grant execute on function achieve_wish(uuid, uuid)             to authenticated;
grant execute on function move_wish(uuid, text)                to authenticated;
grant execute on function update_wish(uuid, text, text, integer, text) to authenticated;
grant execute on function delete_wish(uuid)                    to authenticated;
grant execute on function set_wish_image(uuid, text)            to authenticated;

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

  -- 고정비도 넣는다. 빠지면 한쪽이 초기화해도 상대 화면에 지운 고정비가 남는다.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fixed_costs'
  ) then
    alter publication supabase_realtime add table fixed_costs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wish_items'
  ) then
    alter publication supabase_realtime add table wish_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wish_agreements'
  ) then
    alter publication supabase_realtime add table wish_agreements;
  end if;
end $$;
