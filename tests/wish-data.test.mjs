import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migration-wish.sql", import.meta.url), "utf8");
const remote = await readFile(new URL("../src/data/remote.js", import.meta.url), "utf8");
const store = await readFile(new URL("../src/store.js", import.meta.url), "utf8");

const compact = (text) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

function tableDefinition(sql, table) {
  return sql.match(new RegExp(`create table if not exists ${table} \\([\\s\\S]*?\\n\\);`))?.[0];
}

function exportedFunction(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} 함수를 찾지 못했다`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

test("schema.sql 과 위시 마이그레이션의 두 표가 같은 구조다", () => {
  for (const table of ["wish_items", "wish_agreements"]) {
    const inSchema = tableDefinition(schema, table);
    const inMigration = tableDefinition(migration, table);
    assert.ok(inSchema, `schema.sql 에 ${table} 이 없다`);
    assert.ok(inMigration, `migration-wish.sql 에 ${table} 이 없다`);
    assert.equal(compact(inSchema), compact(inMigration), `${table} 정의가 서로 다르다`);
  }

  for (const sql of [schema, migration]) {
    assert.match(sql, /estimated_price integer check \(estimated_price is null or estimated_price > 0\)/);
    assert.match(sql, /created_by\s+uuid not null references profiles\(id\)/);
    assert.match(sql, /state in \('proposed', 'pursuing', 'achieved'\)/);
  }
});

test("집마다 향하는 위시는 부분 유니크 인덱스로 하나만 허용한다", () => {
  for (const sql of [schema, migration]) {
    assert.match(
      sql,
      /create unique index if not exists wish_items_one_pursuing_per_household_idx\s+on wish_items \(household_id\)\s+where state = 'pursuing'/,
    );
  }
});

test("합의는 사람 수가 늘어도 되는 별도 표이고 올린 사람도 첫 합의로 센다", () => {
  for (const sql of [schema, migration]) {
    assert.match(sql, /primary key \(wish_id, user_id\)/);
    assert.match(
      sql,
      /insert into wish_agreements \(wish_id, user_id\)\s+values \(v_wish_id, auth\.uid\(\)\)/,
    );
    assert.match(
      sql,
      /count\(\*\) from wish_agreements where wish_id = p_wish_id[\s\S]*?count\(\*\) from profiles p where p\.household_id = v_household/,
    );
  }
});

test("위시와 합의 RLS 는 current_household_id 로 같은 집만 읽힌다", () => {
  for (const sql of [schema, migration]) {
    assert.match(sql, /alter table wish_items\s+enable row level security/);
    assert.match(sql, /alter table wish_agreements\s+enable row level security/);
    assert.match(
      sql,
      /create policy wish_items_read on wish_items\s+for select using \(household_id = current_household_id\(\)\)/,
    );
    const policy = sql.match(/create policy wish_agreements_read[\s\S]*?\n\s*\);/)?.[0] || "";
    assert.match(policy, /w\.id = wish_agreements\.wish_id/);
    assert.match(policy, /w\.household_id = current_household_id\(\)/);
  }
});

test("위시 상태와 합의는 인증 사용자도 표를 직접 바꾸지 못한다", () => {
  for (const sql of [schema, migration]) {
    assert.match(sql, /revoke all on wish_items, wish_agreements from authenticated, anon/);
    assert.match(sql, /grant select on wish_items, wish_agreements to authenticated/);
    assert.doesNotMatch(
      sql,
      /grant[^;]*(insert|update|delete)[^;]*on wish_items[^;]*to authenticated/i,
    );
    for (const fn of ["create_wish", "agree_wish", "achieve_wish", "delete_wish"]) {
      assert.match(sql, new RegExp(`create or replace function ${fn}`));
      assert.match(sql, new RegExp(`revoke execute on function ${fn}`));
    }
  }
});

test("지출을 지워도 이룬 기록과 날짜는 남는다", () => {
  for (const sql of [schema, migration]) {
    const wishTable = tableDefinition(sql, "wish_items");
    assert.match(wishTable, /expense_id\s+uuid references expenses\(id\) on delete set null/);
    assert.match(sql, /set state = 'achieved',[\s\S]*?achieved_on = v_spent_on/);
    assert.match(sql, /select e\.spent_on into v_spent_on[\s\S]*?e\.household_id = v_household/);
    assert.doesNotMatch(wishTable, /expense_id\s+uuid[^\n]*on delete cascade/);
  }
});

test("합의와 이룸 전환은 같은 집 요청을 잠그고 가구 범위를 다시 확인한다", () => {
  for (const sql of [schema, migration]) {
    assert.ok(
      (sql.match(/pg_advisory_xact_lock\(hashtextextended\(v_household::text, 0\)\)/g) || []).length >= 3,
      "생성·합의·이룸이 같은 가구 잠금을 함께 써야 한다",
    );
    assert.match(sql, /where w\.id = p_wish_id\s+and w\.household_id = v_household/);
    assert.match(sql, /where e\.id = p_expense_id\s+and e\.household_id = v_household/);
  }
});

test("migration-wish.sql 은 다시 실행해도 충돌하지 않는 형태다", () => {
  assert.equal((migration.match(/create table if not exists wish_/g) || []).length, 2);
  assert.equal((migration.match(/create (?:unique )?index if not exists wish_/g) || []).length, 2);
  assert.equal((migration.match(/drop policy if exists wish_/g) || []).length, 2);
  assert.doesNotMatch(migration, /^create table wish_/m);
  assert.doesNotMatch(migration, /^create (?:unique )?index wish_/m);
  assert.match(migration, /if not exists \([\s\S]*?alter publication supabase_realtime add table wish_items/);
  assert.match(migration, /if not exists \([\s\S]*?alter publication supabase_realtime add table wish_agreements/);
});

test("위시 열 목록과 읽기 조합은 remote.js 한 곳에서 관리한다", () => {
  assert.match(remote, /export const WISH_COLUMNS\s*=\s*\n?\s*"[^"]*estimated_price[^"]*achieved_at"/);
  assert.match(remote, /export const WISH_AGREEMENT_COLUMNS = "wish_id, user_id, agreed_at"/);
  assert.match(remote, /const WISH_RESULT_COLUMNS = `\$\{WISH_COLUMNS\}, agreement_user_ids`/);
  // 담기·합의·이룸·고치기 넷이 같은 열 목록을 쓴다.
  assert.equal((remote.match(/\.select\(WISH_RESULT_COLUMNS\)/g) || []).length, 4);
  const fetch = exportedFunction(remote, "fetchWishes");
  assert.match(fetch, /select\(WISH_COLUMNS\)/);
  assert.match(fetch, /select\(WISH_AGREEMENT_COLUMNS\)/);
  assert.match(fetch, /return rows\.map\(\(row\) => toWish/);
});

test("위시 쓰기는 RPC 성공 뒤에만 메모리 사본을 바꾼다", () => {
  const cases = [
    ["addWish", /await remote\.insertWish/, /wishes = \[created, \.\.\.wishes\]/],
    ["agreeWish", /await remote\.agreeWish/, /wishes = wishes\.map/],
    ["achieveWish", /await remote\.achieveWish/, /wishes = wishes\.map/],
    ["removeWish", /await remote\.deleteWish/, /wishes = wishes\.filter/],
  ];
  for (const [name, request, mutation] of cases) {
    const body = exportedFunction(store, name);
    assert.match(body, request);
    assert.match(body, mutation);
    assert.ok(body.search(request) < body.search(mutation), `${name} 이 서버 확인 전에 사본을 바꾼다`);
  }
  assert.match(store, /export function getWishes\(\) \{\s+return wishes;/);
  assert.doesNotMatch(store, /export async function getWishes/);
});

test("초기 불러오기·다시 읽기·초기화가 위시 사본도 함께 다룬다", () => {
  assert.match(remote, /fetchWishes\(householdId\)[\s\S]*?return \{ members, expenses, fixedCosts, applied, noteCounts, wishes \}/);
  assert.match(exportedFunction(store, "loadAll"), /wishes = data\.wishes/);
  assert.match(exportedFunction(store, "reloadHousehold"), /remote\.fetchWishes\(session\.householdId\)/);
  assert.match(store, /function 비우기\(\)[\s\S]*?wishes = \[\]/);
  for (const sql of [schema, migration]) {
    assert.match(sql, /delete from wish_items\s+where household_id = v_household/);
  }
});
