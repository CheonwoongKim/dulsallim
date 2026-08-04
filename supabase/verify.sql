-- 설정 점검
--
-- SQL Editor 에 붙여 실행하고, 결과의 status 열이 전부 OK 인지 확인한다.
-- 하나라도 FAIL 이면 그 항목의 hint 를 보고 고친 뒤 다시 실행한다.

with checks as (

  -- 1) 테이블 8개가 모두 있는가
  select
    1 as no,
    '테이블 생성' as item,
    count(*)::text || ' / 8' as detail,
    case when count(*) = 8 then 'OK' else 'FAIL' end as status,
    'schema.sql 을 다시 실행하세요' as hint
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('households','profiles','fixed_costs','expenses',
                       'fixed_cost_applications','expense_notes','nags','nag_fires')

  union all

  -- 2) 모든 테이블에 RLS 가 켜져 있는가 (가장 중요)
  select
    2,
    'RLS 활성화',
    count(*) filter (where rowsecurity)::text || ' / ' || count(*)::text,
    case when count(*) = 8 and count(*) = count(*) filter (where rowsecurity)
         then 'OK' else 'FAIL' end,
    'RLS 가 꺼진 테이블은 anon key 로 전부 읽힙니다'
  from pg_tables
  where schemaname = 'public'
    and tablename in ('households','profiles','fixed_costs','expenses',
                      'fixed_cost_applications','expense_notes','nags','nag_fires')

  union all

  -- 3) 정책이 8개 다 있는가
  -- nag_fires 에는 일부러 정책을 두지 않는다(fire_nags 만 손대므로). 그래서 표는 8개, 정책도 8개다.
  select
    3,
    '접근 정책',
    count(*)::text || ' / 8',
    case when count(*) = 8 then 'OK' else 'FAIL' end,
    'RLS 만 켜고 정책이 없으면 본인도 아무것도 못 봅니다'
  from pg_policies
  where schemaname = 'public'
    and tablename in ('households','profiles','fixed_costs','expenses',
                      'fixed_cost_applications','expense_notes','nags')

  union all

  -- 4) 가구가 하나 있는가
  select
    4,
    '가구',
    coalesce(string_agg(name, ', '), '없음'),
    case when count(*) = 1 then 'OK' else 'FAIL' end,
    'seed.sql 을 실행하세요. 2개 이상이면 중복 생성된 것입니다'
  from households

  union all

  -- 5) 계정 2개가 같은 가구에 연결됐는가
  select
    5,
    '계정 연결',
    coalesce(string_agg(display_name, ', ' order by created_at), '없음'),
    case when count(*) = 2 and count(distinct household_id) = 1 then 'OK' else 'FAIL' end,
    'seed.sql 의 이메일이 실제 계정과 일치하는지 확인하세요'
  from profiles

  union all

  -- 6) 두 계정 모두 이메일 인증이 끝났는가 (안 되어 있으면 로그인이 막힌다)
  select
    6,
    '이메일 인증',
    count(*) filter (where email_confirmed_at is not null)::text || ' / ' || count(*)::text,
    case when count(*) > 0 and count(*) = count(*) filter (where email_confirmed_at is not null)
         then 'OK' else 'FAIL' end,
    '계정 생성 시 Auto Confirm User 를 체크했어야 합니다'
  from auth.users

  union all

  -- 7) 비로그인(anon) 역할에 테이블 권한이 남아 있지 않은가
  select
    7,
    'anon 권한 차단',
    count(*)::text || ' 건 남음',
    case when count(*) = 0 then 'OK' else 'FAIL' end,
    'schema.sql 의 revoke 구문을 다시 실행하세요'
  from information_schema.role_table_grants
  where grantee = 'anon'
    and table_schema = 'public'
    and table_name in ('households','profiles','fixed_costs','expenses',
                       'fixed_cost_applications','expense_notes','nags','nag_fires')

  union all

  -- 8) 프로필 수정 권한이 정해진 열로만 한정됐는가 (household_id 가 열리면 가구 격리가 뚫린다)
  select
    8,
    '프로필 수정 권한',
    coalesce(string_agg(column_name, ', ' order by column_name), '없음'),
    case when count(*) = 4
          and count(*) filter (where column_name in ('display_name','avatar_color','monthly_goal','nag_enabled')) = 4
         then 'OK' else 'FAIL' end,
    'schema.sql 의 revoke/grant 구문을 다시 실행하세요'
  from information_schema.column_privileges
  where grantee = 'authenticated' and table_name = 'profiles' and privilege_type = 'UPDATE'

  union all

  -- 9) 실시간 반영 대상에 들어갔는가
  select
    9,
    '실시간 구독',
    coalesce(string_agg(tablename, ', '), '없음'),
    case when count(*) = 2 then 'OK' else 'FAIL' end,
    '대화가 즉시 뜨지 않을 뿐 앱은 동작합니다'
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and tablename in ('expenses','expense_notes')

  union all

  -- 10) 서버가 통째로 처리하는 함수 3개가 있는가
  select
    10,
    '서버 함수',
    coalesce(string_agg(proname, ', ' order by proname), '없음'),
    case when count(*) = 3 then 'OK' else 'FAIL' end,
    'migration-hardening.sql (또는 schema.sql) 을 실행하세요'
  from pg_proc
  where proname in ('fire_nags', 'reset_household', 'apply_fixed_cost')

  union all

  -- 11) 대화에 작성자 검사가 걸렸는가 (없으면 상대 이름으로 메시지를 지어낼 수 있다)
  select
    11,
    '대화 작성자 검사',
    case when count(*) = 1 then '있음' else '없음' end,
    case when count(*) = 1 then 'OK' else 'FAIL' end,
    'migration-hardening.sql 을 실행하세요'
  from pg_policies
  where schemaname = 'public'
    and tablename = 'expense_notes'
    and with_check like '%auth.uid()%'

  union all

  -- 12) 남의 말을 고치거나 지울 권한이 남아 있지 않은가
  select
    12,
    '대화 수정·삭제 차단',
    count(*)::text || ' 건 남음',
    case when count(*) = 0 then 'OK' else 'FAIL' end,
    'migration-hardening.sql 의 revoke 구문을 다시 실행하세요'
  from information_schema.role_table_grants
  where grantee = 'authenticated'
    and table_schema = 'public'
    and table_name = 'expense_notes'
    and privilege_type in ('UPDATE', 'DELETE')

  union all

  -- 13) 서버 함수를 비로그인이 부를 수 없는가
  -- 표와 달리 함수는 실행 권한이 기본으로 PUBLIC 에 열려 있다. grant 만으로는 닫히지 않는다.
  select
    13,
    '함수 실행 차단',
    count(*)::text || ' / 3 잠김',
    case when count(*) = 3 then 'OK' else 'FAIL' end,
    'migration-hardening.sql 의 revoke execute 를 실행하세요'
  from (values ('reset_household()'), ('apply_fixed_cost(uuid, date, date)'), ('fire_nags(uuid)')) as f(sig)
  where not has_function_privilege('anon', f.sig, 'execute')

  union all

  -- 14) 울린 기록에 직접 손댈 수 없는가 (열려 있으면 잔소리를 지우고 다시 울릴 수 있다)
  select
    14,
    '울린 기록 보호',
    count(*)::text || ' 건 남음',
    case when count(*) = 0 then 'OK' else 'FAIL' end,
    'schema.sql 의 revoke all on nag_fires 를 다시 실행하세요'
  from information_schema.role_table_grants
  where grantee in ('authenticated', 'anon')
    and table_schema = 'public'
    and table_name = 'nag_fires'

  union all

  -- 15) 상대 기기에 바로 전해져야 하는 표가 실시간 대상에 들어 있는가
  -- 빠지면 조용히 어긋난다 — 한쪽이 초기화해도 상대 화면에는 지운 고정비가 남는다.
  select
    15,
    '실시간 대상',
    count(*)::text || ' / 3 등록',
    case when count(*) = 3 then 'OK' else 'FAIL' end,
    'migration-fixed-sync.sql 을 실행하세요'
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename in ('expenses', 'expense_notes', 'fixed_costs')

  union all

  -- 16) 아바타 색상이 고정 팔레트가 아니라 안전한 6자리 HEX 범위로 열려 있는가
  select
    16,
    '아바타 직접 색상',
    case when count(*) = 1 then '6자리 HEX 허용' else '제약 확인 필요' end,
    case when count(*) = 1 then 'OK' else 'FAIL' end,
    'migration-avatar-custom-color.sql 을 실행하세요'
  from pg_constraint
  where conrelid = 'profiles'::regclass
    and conname = 'profiles_avatar_color_check'
    and pg_get_constraintdef(oid) like '%[0-9a-f]{6}%'
)

select status, item, detail, hint
from checks
order by no;
