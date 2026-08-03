-- 코드 리뷰에서 나온 서버 쪽 문제 세 가지 (한 번만 실행)
--
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 여러 번 실행해도 안전하다.
--
-- 새 프로젝트라면 이 파일은 필요 없다. schema.sql 에 이미 들어 있다.

-- ── 1) 대화 작성자 위조 막기 ────────────────────────────────────
-- 지금까지는 "같은 가구의 지출인가"만 봤다. 작성자가 나인지는 보지 않아서,
-- 브라우저를 거치지 않고 API 를 직접 부르면 상대 이름으로 메시지를 지어낼 수 있었다.
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

-- 고치거나 지우는 화면이 없으므로 권한도 회수한다.
-- 정책이 위조를 막고, 여기서 상대 말에 손댈 길까지 없앤다.
-- 지출을 지울 때 대화가 함께 사라지는 건 on delete cascade 라 이 권한과 무관하다.
revoke update, delete on expense_notes from authenticated;
grant select, insert on expense_notes to authenticated;

-- ── 2) 초기화를 한 트랜잭션으로 ─────────────────────────────────
-- 요청 두 번으로 나누면 두 번째가 실패했을 때 고정비만 사라진 절반 상태가 남는다.
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

  -- 고정비를 먼저 지워야 반영 기록이 함께 사라지고,
  -- 그래야 초기화 직후에 지난 달 고정비가 되살아나지 않는다.
  delete from fixed_costs where household_id = v_household;
  delete from expenses    where household_id = v_household;
end;
$$;

-- ── 3) 고정비 반영을 한 트랜잭션으로 ────────────────────────────
-- 반영 표시 → 지출 생성 → 연결을 세 요청으로 하면,
-- 지출이 저장된 뒤 응답만 유실됐을 때 표시를 지우고 재시도해 같은 지출이 두 번 생겼다.
-- 한 트랜잭션이면 전부 되거나 전부 안 된다.
--   · 지출 생성 실패 → 반영 표시도 함께 사라져 다음에 다시 시도된다
--   · 커밋 뒤 응답 유실 → 표시가 남아 재시도해도 중복이 생기지 않는다
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

grant execute on function reset_household()                  to authenticated;
grant execute on function apply_fixed_cost(uuid, date, date) to authenticated;

-- ── 확인 ────────────────────────────────────────────────────────
select
  (select count(*) from pg_proc
    where proname in ('reset_household', 'apply_fixed_cost')) as 함수_2개,
  (select count(*) from information_schema.column_privileges
    where grantee = 'authenticated' and table_name = 'expense_notes'
      and privilege_type in ('UPDATE', 'DELETE')) as 대화_수정삭제권한_0건,
  (select count(*) from pg_policies
    where tablename = 'expense_notes' and qual is not null
      and with_check like '%auth.uid()%') as 작성자검사_1건;
