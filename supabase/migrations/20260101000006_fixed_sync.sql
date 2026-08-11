-- 고정비 변경을 상대 기기에도 알린다.
--
-- 지금까지 실시간 대상은 expenses 와 expense_notes 뿐이었다.
-- 그래서 한쪽에서 데이터를 초기화해도 상대 화면의 고정비 목록에는 지운 항목이 그대로 남았고,
-- 그 목록으로 반영을 시도하면 "고정비를 찾을 수 없습니다"만 돌아왔다.
--
-- 삭제 이벤트에는 필터도 RLS 도 걸리지 않는다(Postgres 가 지워진 행의 권한을 확인할 수 없다).
-- 대신 페이로드에는 기본 키만 담긴다. 앱은 그 값을 쓰지 않고 다시 읽기만 하므로 새 나갈 것이 없다.
--
-- alter publication 에는 if not exists 가 없다. 여러 번 실행해도 안전하도록 보고 넣는다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fixed_costs'
  ) then
    alter publication supabase_realtime add table fixed_costs;
  end if;
end $$;
