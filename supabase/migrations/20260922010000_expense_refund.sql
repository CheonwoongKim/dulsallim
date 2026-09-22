-- 실비 환급 — 결제 금액은 그대로 두고 돌려받은 금액을 따로 적는다.
--
-- 여태는 나중에 환급받으면 원래 금액을 덮어썼다. 그러면 둘이 깨진다.
--   · 10만 원이 나갔다는 사실이 사라진다
--   · 실비로 얼마나 돌려받았는지 알 길이 없다
--
-- 이걸로 안 풀리는 것 — 이미 울린 잔소리는 그대로다. 환급은 나중에 들어오니 잔소리는
-- 결제 금액으로 울린 뒤이고(nag_fires 가 (대상,달,구간) 을 기본키로 두어 그 달 그 구간은
-- 다시 안 운다), 그때 붙은 노트도 남는다. 되돌리지 않는다 — 그 순간 10만 원이 나간 것은
-- 사실이라 그때 운 것이 틀리지 않았다. 여기서 고치는 것은 "앞으로 무엇을 기준으로 우나" 다.
--
-- 받은 달에 음수로 넣는 길은 택하지 않았다. 이 앱에는 수입이라는 축이 아예 없어서,
-- 그러려면 분류별 비중·목표·추이가 모두 기대고 있는 "금액은 전부 지출" 전제를 잃는다.

alter table expenses add column if not exists refunded integer
  check (refunded is null or (refunded > 0 and refunded <= amount));

-- 서버도 실부담으로 세야 한다. 안 고치면 화면이 3만 원이라 말하는 달에 서버는 10만 원으로
-- 구간을 넘겼다고 판단한다. 아래 몸통은 schema.sql 에서 그대로 복사한 것이다 — 옮겨 적지 말 것.
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

  -- 실부담으로 센다. 화면의 합계도 amount - refunded 로 내므로, 여기서 결제 금액을 그대로
  -- 더하면 서버가 화면과 다른 숫자를 보고 잔소리를 울린다.
  select coalesce(sum(amount - coalesce(refunded, 0)), 0) into v_spent
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


-- 월말 요약 알림도 실부담으로 센다.
--
-- 왜 20260101000009_push_triggers.sql 을 그 자리에서 안 고치고 여기서 다시 적나.
-- README 가 "아직 실행하지 않은 것만" 실행하라고 안내하므로, 이미 9번을 돌린 집은
-- 그 파일을 다시 안 읽는다 — 거기서 고치면 정작 지금 틀린 숫자를 말하고 있는 집에는
-- 영영 안 닿는다. 게다가 9번이 refunded 를 가리키게 되면, 9번까지만 돌린 집에서는
-- 없는 열을 골라 매달 cron 이 터진다. 옛 마이그레이션은 그때의 몸통을 들고 있는 것이 맞다
-- (20260101000004_nag.sql 의 fire_nags 도 그대로 둔다).
--
-- 아래 몸통은 9번에서 그대로 오려 내고 합계 줄만 바꾼 것이다 — 옮겨 적지 말 것.
create or replace function send_month_summary()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household record;
  v_total bigint;
  v_month date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
begin
  for v_household in select id from households loop
    -- 실부담으로 센다. 결제 금액으로 세면 알림만 854,800 을 말하고 화면은 784,800 을 보여 준다.
    select coalesce(sum(amount - coalesce(refunded, 0)), 0) into v_total
    from expenses
    where household_id = v_household.id
      and spent_on >= v_month
      and spent_on < v_month + interval '1 month';

    perform notify_push(
      (select array_agg(id) from profiles where household_id = v_household.id),
      to_char(v_month, 'FMMM') || '월 마무리',
      '이번 달 둘이 ' || to_char(v_total, 'FM999,999,999') || '원 썼어요',
      '/',
      'summary'
    );
  end loop;
end;
$$;
