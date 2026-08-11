-- 분류 추가: 의료, 반려견 (한 번만 실행)
--
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 여러 번 실행해도 안전하다.
--
-- expenses 와 fixed_costs 의 check 제약이 이 함수를 부른다.
-- 함수를 바꾸면 앞으로 들어오는 기록에만 적용되고, 이미 저장된 기록은 다시 검사하지 않는다.
-- (기존 기록의 분류를 옮기지 않는다는 뜻이기도 하다. 과거는 과거대로 둔다.)

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

-- ── 확인 ────────────────────────────────────────────────────────
-- 둘 다 true 가 나와야 한다.
select is_valid_category('pet') as 반려견_허용, is_valid_category('medical') as 의료_허용;
