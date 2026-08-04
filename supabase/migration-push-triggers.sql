-- 언제 알림을 보낼지 (migration-push.sql 다음에, 한 번만 실행)
--
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 먼저 아래 두 줄의 값을 채워 넣으세요.
--   프로젝트 URL   : Settings → API → Project URL
--   service_role 키 : Settings → API → service_role (비밀입니다. 이 파일에 적어 두지 마세요)

-- 값을 DB 안에만 둔다. Edge Function 을 부를 때 쓰고, 앱에서는 읽을 수 없다.
create table if not exists app_secrets (
  key   text primary key,
  value text not null
);
alter table app_secrets enable row level security;
revoke all on app_secrets from anon, authenticated;

-- ↓ 여기 두 줄만 채워서 실행하세요
-- insert into app_secrets (key, value) values ('function_url', 'https://<프로젝트>.supabase.co/functions/v1/send-push')
--   on conflict (key) do update set value = excluded.value;
-- insert into app_secrets (key, value) values ('service_key', '<service_role 키>')
--   on conflict (key) do update set value = excluded.value;

create extension if not exists pg_net;
create extension if not exists pg_cron;

/*
 * 알림 보내기. 여기서 기다리지 않는다(pg_net 은 비동기다) —
 * 알림이 늦거나 실패해도 지출 기록 자체는 반드시 저장돼야 한다.
 */
create or replace function notify_push(p_user_ids uuid[], p_title text, p_body text, p_url text default '/', p_tag text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select value into v_url from app_secrets where key = 'function_url';
  select value into v_key from app_secrets where key = 'service_key';
  if v_url is null or v_key is null then return; end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'userIds', to_jsonb(p_user_ids),
      'title', p_title,
      'body', p_body,
      'url', p_url,
      'tag', p_tag
    )
  );
end;
$$;

/* ── ① 상대가 기록하면 ───────────────────────────────────── */
/*
 * 적은 사람 말고 같은 가구의 나머지에게만 보낸다.
 * 고정비가 자동으로 채워질 때도 이 트리거가 돈다 — 열두 달이 밀렸으면 한꺼번에 울린다.
 * 그래서 사람이 직접 적은 것(fixed_cost_id 가 비어 있는 것)만 알린다.
 */
create or replace function on_expense_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_targets uuid[];
  v_name text;
begin
  if new.fixed_cost_id is not null then return new; end if;

  select array_agg(id) into v_targets
  from profiles
  where household_id = new.household_id and id <> new.created_by;
  if v_targets is null or array_length(v_targets, 1) = 0 then return new; end if;

  select display_name into v_name from profiles where id = new.created_by;

  perform notify_push(
    v_targets,
    coalesce(v_name, '상대') || '님이 기록했어요',
    new.item || ' ' || to_char(new.amount, 'FM999,999,999') || '원',
    '/',
    'expense'
  );
  return new;
end;
$$;

drop trigger if exists expense_push on expenses;
create trigger expense_push after insert on expenses
  for each row execute function on_expense_inserted();

/* ── ② 목표를 넘기면 ─────────────────────────────────────── */
/*
 * 이미 있는 잔소리(nag_fires)가 울릴 때 같이 보낸다.
 * 잔소리는 한 달에 한 번만 울리도록 이미 막혀 있으므로 여기서 또 막지 않는다.
 */
create or replace function on_nag_fired()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
begin
  -- nag_fires 에는 어떤 잔소리가 울렸는지 대신 (대상, 몇 %) 만 남는다. 그걸로 문구를 찾는다.
  select body into v_body
  from nags
  where target_id = new.target_id and percent = new.percent
  order by created_at desc
  limit 1;
  perform notify_push(
    array[new.target_id],
    '목표를 넘겼어요',
    coalesce(v_body, '이번 달 지출을 한번 볼까요?'),
    '/',
    'nag'
  );
  return new;
end;
$$;

drop trigger if exists nag_push on nag_fires;
create trigger nag_push after insert on nag_fires
  for each row execute function on_nag_fired();

/* ── ③ 월말 요약 ─────────────────────────────────────────── */
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
    select coalesce(sum(amount), 0) into v_total
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

-- 매달 마지막 날 밤 9시(한국 시간). cron 은 UTC 로 도므로 12시를 뺀다.
select cron.unschedule('dulsallim-month-summary')
where exists (select 1 from cron.job where jobname = 'dulsallim-month-summary');

select cron.schedule(
  'dulsallim-month-summary',
  '0 12 28-31 * *',
  $cron$
    select send_month_summary()
    where (now() at time zone 'Asia/Seoul')::date =
          (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month - 1 day')::date;
  $cron$
);
