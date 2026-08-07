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
const appjs = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const syncjs = await readFile(new URL("../src/sync.js", import.meta.url), "utf8");

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

test("schema.sql 은 처음 표에서 나중 마이그레이션이 더한 것만큼만 다르다", () => {
  /*
   * schema.sql 은 새 프로젝트가 한 번에 갖는 마지막 모습이고, migration-wish.sql 은 처음
   * 모습이다. 나중 마이그레이션이 더한 것만큼 둘이 달라야 하고, 그 밖에는 같아야 한다 —
   * 다르면 새로 만든 집과 쓰던 집이 서로 다른 표를 갖게 된다.
   *
   * 지금까지 더한 것: note · image_url(각각 제 마이그레이션) · sort_order 와 느슨해진
   * 상태 제약(migration-wish-order.sql).
   */
  assert.equal(compact(tableDefinition(schema, "wish_agreements")),
               compact(tableDefinition(migration, "wish_agreements")),
               "wish_agreements 는 바뀐 적이 없다");

  const 지금 = compact(tableDefinition(schema, "wish_items"));
  const 처음 = compact(tableDefinition(migration, "wish_items"));
  const 뺀다 = (글) => 글
    .replace(/note text check \(note is null[^)]*\)[^,]*, /, "")
    .replace(/image_url text check \(image_url is null[^)]*\)[^,]*, /, "")
    .replace(/is_goal boolean not null default false, /, "")
    .replace(/constraint wish_items_state_check /, "")
    .replace(/pursuing_at is not null and achieved_on/, "achieved_on");
  assert.equal(뺀다(지금), 뺀다(처음), "더한 것 말고도 표가 갈렸다");

  // 나중 마이그레이션이 더한 것은 schema.sql 에 실제로 있어야 한다.
  assert.match(schema, /is_goal\s+boolean not null default false/);
  // 사람마다 하나뿐이라는 것은 부분 유니크 인덱스가 지킨다 — 화면이 두 번 눌러도 하나다.
  assert.match(schema, /create unique index if not exists wish_items_goal_idx[\s\S]*?where is_goal and state <> 'achieved'/);

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
    // 올린 사람이 곧 첫 찬성이다. 변수 이름은 파일마다 다르니 뜻만 본다.
    assert.match(sql, /insert into wish_agreements \(wish_id, user_id\)\s+values \(v_\w+, (auth\.uid\(\)|v_me)\)/);
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
  assert.match(remote, /export const WISH_COLUMNS\s*=\s*\n?\s*"[^"]*estimated_price[^"]*is_goal"/);
  assert.match(remote, /export const WISH_AGREEMENT_COLUMNS = "wish_id, user_id, agreed_at"/);
  assert.match(remote, /const WISH_RESULT_COLUMNS = `\$\{WISH_COLUMNS\}, agreement_user_ids`/);
  /*
   * 담기·합의·이룸·고치기 넷이 같은 열 목록을 쓴다. 함수마다 적던 때는 한 곳만 빠져도
   * 그 자리만 400 이 났다(image_url 을 더하다 create_wish 가 그랬다). 이제 한 곳뿐이다.
   */
  // 쓰기 넷은 위시바꾸기 한 곳을 지나고, 자리 옮기기만 따로다(돌아오는 줄이 둘이라 .single() 을 못 쓴다).
  assert.equal((remote.match(/\.select\(WISH_RESULT_COLUMNS\)/g) || []).length, 2);
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
  assert.match(remote, /fetchWishes\(householdId\)[\s\S]*?return \{ members: 명부, expenses, fixedCosts, applied, noteCounts, wishes \}/);
  /*
   * 명부는 받으면 그것을 쓰고 안 받으면 읽는다. 로그인이 내 프로필과 함께 이미 읽어 두므로
   * 시작할 때는 같은 표를 두 번 왕복하지 않는다(계측: profiles 2번 → 1번).
   * 앱으로 돌아왔을 때는 안 넘긴다 — 그 사이 상대가 이름을 바꿨을 수 있다.
   */
  assert.match(remote, /members\?\.length \? members : fetchMembers\(householdId\)/);
  assert.match(store, /export async function loadAll\(profile, members\)/);
  assert.match(appjs, /await loadAll\(profile, getLoadedMembers\(\)\)/);
  assert.match(syncjs, /await loadAll\(profile\);/, "돌아왔을 때는 명부를 다시 읽어야 한다");
  assert.match(exportedFunction(store, "loadAll"), /wishes = data\.wishes/);
  assert.match(exportedFunction(store, "reloadHousehold"), /remote\.fetchWishes\(session\.householdId\)/);
  assert.match(store, /function 비우기\(\)[\s\S]*?wishes = \[\]/);
  for (const sql of [schema, migration]) {
    assert.match(sql, /delete from wish_items\s+where household_id = v_household/);
  }
});

test("schema.sql 의 위시 함수 몸통은 마지막 마이그레이션과 글자까지 같다", async () => {
  /*
   * 반환 모양을 바꾸느라 다섯 함수를 다시 적으면서 몸통까지 손으로 옮겨 적었고, 세 곳이
   * 조용히 어긋났다 — 사람 수를 없는 표에서 세고("나도" 가 아예 안 눌렸다), 한 사람 가구
   * 갈래가 없어지고, "이미 이룬 위시입니다" 가 뭉뚱그린 말로 바뀌었다.
   *
   * 목 서버에는 제약도 다른 표도 없어 브라우저 시험이 다 통과했다. 그래서 여기서 글자로 센다.
   */
  const 짝 = Object.fromEntries(
    ["wish_snapshot", "create_wish", "agree_wish", "achieve_wish", "update_wish", "set_wish_goal"]
      .map((이름) => [이름, "migration-wish-goal.sql"]),
  );
  const 몸통 = (글, 이름) => {
    const m = new RegExp(`create or replace function ${이름}\\([\\s\\S]*?\\nas \\$\\$([\\s\\S]*?)\\n\\$\\$;`).exec(글);
    return m ? m[1].replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim() : null;
  };

  for (const [이름, 파일] of Object.entries(짝)) {
    const 마이그 = await readFile(new URL(`../supabase/${파일}`, import.meta.url), "utf8");
    const a = 몸통(schema, 이름);
    const b = 몸통(마이그, 이름);
    assert.ok(a, `schema.sql 에 ${이름} 이 없다`);
    assert.ok(b, `${파일} 에 ${이름} 이 없다`);
    assert.equal(a, b, `${이름} 몸통이 ${파일} 과 다르다 — 옮겨 적지 말고 그대로 복사할 것`);
  }
});
