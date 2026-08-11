-- 위시리스트 (여러 번 실행해도 안전)
--
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 항목·합의·상태 전환을 한꺼번에 추가한다.

-- ── 1) 위시와 합의 ──────────────────────────────────────────────
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
  check (
    (state = 'proposed' and pursuing_at is null
      and expense_id is null and achieved_on is null and achieved_at is null)
    or
    (state = 'pursuing' and pursuing_at is not null
      and expense_id is null and achieved_on is null and achieved_at is null)
    or
    (state = 'achieved' and pursuing_at is not null
      and achieved_on is not null and achieved_at is not null)
  )
);

create index if not exists wish_items_household_created_idx
  on wish_items (household_id, created_at desc);

-- 사람 수를 열 개수로 굳히지 않는다. 지금은 둘이지만 profiles 는 여러 사람을 담을 수 있다.
create table if not exists wish_agreements (
  wish_id   uuid not null references wish_items(id) on delete cascade,
  user_id   uuid not null references profiles(id),
  agreed_at timestamptz not null default now(),
  primary key (wish_id, user_id)
);

-- ── 2) 같은 집만 읽기 ───────────────────────────────────────────
alter table wish_items      enable row level security;
alter table wish_agreements enable row level security;

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

-- 상태와 합의는 아래 함수만 바꾼다. 그래야 작성자 위조와 절반 전환을 막을 수 있다.
revoke all on wish_items, wish_agreements from authenticated, anon;
grant select on wish_items, wish_agreements to authenticated;

-- ── 3) 서버가 원자적으로 처리하는 일 ───────────────────────────
-- 쓰기 함수가 돌려줄 공통 모양. 직접 부르면 definer 권한으로 RLS 를 우회하므로 공개하지 않는다.
drop function if exists wish_snapshot(uuid);
create or replace function wish_snapshot(p_wish_id uuid)
returns table (
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
  agreement_user_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id, w.household_id, w.name, w.url, w.note, w.estimated_price, w.image_url,
    w.created_by, w.created_at, w.state, w.pursuing_at,
    w.expense_id, w.achieved_on, w.achieved_at,
    array(
      select a.user_id
      from wish_agreements a
      where a.wish_id = w.id
      order by a.agreed_at, a.user_id
    )
  from wish_items w
  where w.id = p_wish_id
$$;

-- 올린다는 것 자체가 첫 찬성이다. 항목과 첫 합의가 한 트랜잭션으로 함께 생긴다.
drop function if exists create_wish(text, text, integer);
drop function if exists create_wish(text, text, integer, text);
create or replace function create_wish(
  p_name text,
  p_url text default null,
  p_estimated_price integer default null,
  p_note text default null
)
returns table (
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
  agreement_user_ids uuid[]
)
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

  insert into wish_items (household_id, name, url, note, estimated_price, created_by)
  values (v_household, trim(p_name), nullif(trim(p_url), ''), nullif(trim(p_note), ''),
          p_estimated_price, auth.uid())
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

-- 현재 가구 구성원 모두가 누르면 향하는 것으로 바꾼다.
drop function if exists agree_wish(uuid);
create or replace function agree_wish(p_wish_id uuid)
returns table (
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
  agreement_user_ids uuid[]
)
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

-- 산 지출의 날짜를 복사해 둔다. 나중에 그 지출을 지워도 이룬 날짜는 사라지지 않는다.
drop function if exists achieve_wish(uuid, uuid);
create or replace function achieve_wish(p_wish_id uuid, p_expense_id uuid)
returns table (
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
  agreement_user_ids uuid[]
)
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

  if not exists (
    select 1 from wish_items w
    where w.id = p_wish_id
      and w.household_id = v_household
      and w.state = 'pursuing'
  ) then
    raise exception '지금 향하는 위시를 찾을 수 없습니다';
  end if;

  select e.spent_on into v_spent_on
    from expenses e
   where e.id = p_expense_id
     and e.household_id = v_household;
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

-- 기존 데이터 초기화에도 위시가 포함돼야 한다.
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

-- 함수는 기본으로 PUBLIC 실행 권한이 생기므로 먼저 모두 닫고 앱이 쓰는 네 개만 연다.
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

revoke execute on function wish_snapshot(uuid)               from public, authenticated, anon;
revoke execute on function create_wish(text, text, integer, text) from public, anon;
revoke execute on function agree_wish(uuid)                  from public, anon;
revoke execute on function achieve_wish(uuid, uuid)          from public, anon;
revoke execute on function delete_wish(uuid)                 from public, anon;
revoke execute on function set_wish_image(uuid, text)         from public, anon;

grant execute on function create_wish(text, text, integer, text) to authenticated;
grant execute on function agree_wish(uuid)                 to authenticated;
grant execute on function achieve_wish(uuid, uuid)         to authenticated;
grant execute on function delete_wish(uuid)                to authenticated;
grant execute on function set_wish_image(uuid, text)       to authenticated;

-- ── 4) 실시간 ───────────────────────────────────────────────────
do $$
begin
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

-- ── 확인 ────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('wish_items', 'wish_agreements')) as 표_2개,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename in ('wish_items', 'wish_agreements')) as 정책_2개,
  (select count(*) from pg_proc
    where proname in ('create_wish', 'agree_wish', 'achieve_wish', 'delete_wish')) as 함수_4개;
