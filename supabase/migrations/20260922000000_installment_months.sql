-- 할부 — 고정비에 "몇 번 하고 그만둘지" 를 붙인다 (한 번만 실행)
--
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 이미 schema.sql 을 실행해 쓰고 있는 프로젝트에 덧붙이는 용도다.
--
-- 할부를 위해 새 표도 새 반영 기계도 만들지 않았다. 고정비에 없던 것은 "끝" 하나뿐이라
-- 칸 하나로 족하다 — apply_fixed_cost 도, 중복을 막는 fixed_cost_applications 도,
-- 자정을 넘겼을 때 밀린 것을 채우는 자리도 그대로 쓴다.
--
-- null 이면 무기한(구독), 5 면 다섯 달 하고 끝난다. 이미 있는 고정비는 전부 null 이 되어
-- 지금까지와 똑같이 돈다.

alter table fixed_costs add column if not exists months smallint check (months is null or months > 0);
