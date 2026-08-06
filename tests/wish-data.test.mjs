import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migration-wish.sql", import.meta.url), "utf8");
const multiMigration = await readFile(
  new URL("../supabase/migration-wish-multi.sql", import.meta.url),
  "utf8",
);
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

test("함께 바라는 것은 여럿이어도 된다", () => {
  /*
   * 하나로 묶어 뒀던 때는 나중에 담은 것이 앞의 것이 끝날 때까지 아무 표시도 못 받았다.
   * 진척이 동기인 화면에서 그건 올려두고 아무것도 안 하는 것과 같다.
   */
  for (const sql of [schema, migration]) {
    assert.doesNotMatch(
      sql,
      /create unique index[\s\S]*?wish_items_one_pursuing_per_household_idx/,
      "묶는 제약이 남아 있다",
    );
  }
  // 이미 돌린 프로젝트에서도 걷어야 한다.
  assert.match(multiMigration, /drop index if exists wish_items_one_pursuing_per_household_idx;/);
  // 인덱스만 지우면 함수 안의 주석이 거짓이 된다. 반환 모양은 그대로라 replace 로 족하다.
  assert.match(multiMigration, /create or replace function agree_wish\(p_wish_id uuid\)/);
  assert.doesNotMatch(multiMigration, /drop function if exists agree_wish/);
  for (const sql of [schema, migration, multiMigration]) {
    assert.doesNotMatch(sql, /부분 유니크 인덱스가 이 요청 전체를 되돌린다/, "주석이 거짓이 됐다");
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
  // 표마다 하나씩. 향하는 것을 묶던 유니크 인덱스는 걷었다.
  assert.equal((migration.match(/create (?:unique )?index if not exists wish_/g) || []).length, 1);
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
  /*
   * 담기·합의·이룸·고치기 넷이 같은 열 목록을 쓴다. 함수마다 적던 때는 한 곳만 빠져도
   * 그 자리만 400 이 났다(image_url 을 더하다 create_wish 가 그랬다). 이제 한 곳뿐이다.
   */
  assert.equal((remote.match(/\.select\(WISH_RESULT_COLUMNS\)/g) || []).length, 1);
  for (const [이름, rpc] of [
    ["insertWish", "create_wish"],
    ["agreeWish", "agree_wish"],
    ["achieveWish", "achieve_wish"],
    ["updateWish", "update_wish"],
  ]) {
    assert.match(
      exportedFunction(remote, 이름),
      new RegExp(`위시바꾸기\\("[^"]+", "${rpc}"`),
      `${이름} 이 제 손으로 열 목록을 적고 있다`,
    );
  }
  // 담기와 고치기가 보내는 칸도 한 곳에서 만든다.
  assert.match(remote, /const 위시값 = \(\{ name, url, estimatedPrice, note \}\) => \(\{/);
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
