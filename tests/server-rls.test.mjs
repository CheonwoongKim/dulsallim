import assert from "node:assert/strict";
import test from "node:test";

import { 가구, 판세우기 } from "./helpers/db.mjs";

/*
 * 가구 밖으로는 한 줄도 안 나간다는 약속.
 *
 * anon key 는 프론트엔드에 공개된다 — 그것을 아는 사람이 곧장 표를 물어봐도 남의 가계부가
 * 보이면 안 된다. 여태 이 약속을 schema.sql 을 글자로 읽어서만 봤다. 여기서는 진짜
 * Postgres 에 올려 놓고 실제로 물어본다.
 */

const 지출넣기 = (db, householdId, by, item = "커피") =>
  db.query(
    `insert into expenses (household_id, paid_by, spent_on, category, item, amount, created_by)
     values ($1, $2, '2026-08-01', 'food', $3, 4500, $2) returning id`,
    [householdId, by, item],
  );

test("남의 가구 지출은 아예 안 보인다", async () => {
  const db = await 판세우기();
  await 지출넣기(db, 가구.집, 가구.우리, "우리커피");
  await 지출넣기(db, 가구.남의집, 가구.남, "남커피");

  await db.로서(가구.우리);
  const 보이는것 = await db.query("select item from expenses");
  assert.deepEqual(보이는것.rows.map((r) => r.item), ["우리커피"]);

  await db.로서(가구.남);
  assert.deepEqual((await db.query("select item from expenses")).rows.map((r) => r.item), ["남커피"]);
});

let db0;

test("가구로 갈리는 표는 하나도 빠짐없이 갈린다", async () => {
  /*
   * 표마다 정책이 따로 있다. 하나를 빠뜨리거나 나중에 표를 더하면서 정책을 안 붙이면
   * 그 표만 조용히 열린다 — 지출만 재고 넘어가면 못 본다.
   */
  db0 = await 판세우기();
  const { rows: 우리고정 } = await db0.query(
    `insert into fixed_costs (household_id, paid_by, category, item, amount, day_of_month, start_month)
     values ($1, $2, 'housing', '우리월세', 500000, 1, '2026-01-01') returning id`, [가구.집, 가구.우리]);
  const { rows: 남고정 } = await db0.query(
    `insert into fixed_costs (household_id, paid_by, category, item, amount, day_of_month, start_month)
     values ($1, $2, 'housing', '남월세', 700000, 1, '2026-01-01') returning id`, [가구.남의집, 가구.남]);
  await db0.query(`insert into fixed_cost_applications (fixed_cost_id, month) values ($1, '2026-08-01'), ($2, '2026-08-01')`,
    [우리고정[0].id, 남고정[0].id]);
  const { rows: 우리지출 } = await 지출넣기(db0, 가구.집, 가구.우리, "우리커피");
  await 지출넣기(db0, 가구.남의집, 가구.남, "남커피");
  await db0.query(`insert into wish_items (household_id, name, created_by) values ($1, '우리의자', $2), ($3, '남의자', $4)`,
    [가구.집, 가구.우리, 가구.남의집, 가구.남]);
  await db0.query(`insert into expense_notes (expense_id, author_id, body) values ($1, $2, '우리말')`,
    [우리지출[0].id, 가구.우리]);

  await db0.로서(가구.우리);
  const 센다 = async (표) => (await db0.query(`select count(*)::int c from ${표}`)).rows[0].c;
  assert.equal(await 센다("households"), 1, "남의 집이 보인다");
  assert.equal(await 센다("profiles"), 2, "남의 집 사람이 보인다");
  assert.equal(await 센다("fixed_costs"), 1, "남의 집 고정비가 보인다");
  assert.equal(await 센다("fixed_cost_applications"), 1, "남의 집 반영 기록이 보인다");
  assert.equal(await 센다("expenses"), 1, "남의 집 지출이 보인다");
  assert.equal(await 센다("wish_items"), 1, "남의 집 위시가 보인다");
  assert.equal(await 센다("expense_notes"), 1);

  // 남의 집 고정비에 손댈 수도 없다.
  assert.equal((await db0.query("update fixed_costs set amount = 1 where item = '남월세' returning id")).rows.length, 0);
  assert.ok(await db0.막히나(
    `insert into fixed_costs (household_id, paid_by, category, item, amount, day_of_month, start_month)
     values ($1, $2, 'housing', '몰래', 1, 1, '2026-01-01')`, [가구.남의집, 가구.남]));
});

test("로그인하지 않으면 아무것도 안 보인다", async () => {
  const db = await 판세우기();
  await 지출넣기(db, 가구.집, 가구.우리);
  // anon key 만 들고 온 사람이다. 가구를 알 길이 없으니 한 줄도 안 나가야 한다.
  await db.로서(null);
  for (const 표 of ["expenses", "profiles", "households", "fixed_costs", "wish_items", "nags"]) {
    assert.equal((await db.query(`select count(*)::int c from ${표}`)).rows[0].c, 0, `${표} 가 열려 있다`);
  }
});

test("남의 가구에 적어 넣을 수 없다", async () => {
  const db = await 판세우기();
  await db.로서(가구.우리);
  const 막힘 = await db.막히나(
    `insert into expenses (household_id, paid_by, spent_on, category, item, amount, created_by)
     values ($1, $2, '2026-08-01', 'food', '몰래', 1000, $2)`,
    [가구.남의집, 가구.남],
  );
  assert.ok(막힘, "남의 가구에 지출이 들어갔다");
  assert.match(막힘, /row-level security|policy/i);
});

test("남의 가구 지출을 고치거나 지울 수 없다", async () => {
  const db = await 판세우기();
  const { rows } = await 지출넣기(db, 가구.남의집, 가구.남);
  const id = rows[0].id;

  await db.로서(가구.우리);
  // 안 보이는 줄이라 고치기도 지우기도 0줄에 닿는다 — 조용히 아무 일도 안 일어나야 한다.
  assert.equal((await db.query("update expenses set amount = 1 where id = $1 returning id", [id])).rows.length, 0);
  assert.equal((await db.query("delete from expenses where id = $1 returning id", [id])).rows.length, 0);

  await db.주인으로();
  assert.equal((await db.query("select amount from expenses where id = $1", [id])).rows[0].amount, 4500);
});

test("같은 가구 사람 것은 함께 본다", async () => {
  // 둘이 하나의 장부를 본다. 각자 적어도 상대 것이 보여야 한다.
  const db = await 판세우기();
  await 지출넣기(db, 가구.집, 가구.우리, "내커피");
  await 지출넣기(db, 가구.집, 가구.너와, "짝커피");
  await db.로서(가구.우리);
  assert.equal((await db.query("select count(*)::int c from expenses")).rows[0].c, 2);
  // 상대 것도 고칠 수 있다 — 하나의 장부라 그렇게 정했다.
  assert.equal((await db.query("update expenses set amount = 5000 where item = '짝커피' returning id")).rows.length, 1);
});

test("내 프로필만 고칠 수 있다", async () => {
  const db = await 판세우기();
  await db.로서(가구.우리);
  assert.equal((await db.query("update profiles set display_name = '바뀜' where id = $1 returning id", [가구.우리])).rows.length, 1);
  // 같은 가구여도 상대 이름은 못 고친다.
  assert.equal((await db.query("update profiles set display_name = '몰래' where id = $1 returning id", [가구.너와])).rows.length, 0);
});

test("프로필에서 손댈 수 있는 열이 정해져 있다", async () => {
  /*
   * 이름·색·목표·잔소리 켜기만 열려 있다. 가구를 바꿀 수 있으면 남의 집으로 걸어 들어간다.
   */
  const db = await 판세우기();
  await db.로서(가구.우리);
  const 막힘 = await db.막히나("update profiles set household_id = $1 where id = $2", [가구.남의집, 가구.우리]);
  assert.ok(막힘, "가구를 스스로 바꿀 수 있다");
  assert.match(막힘, /permission denied/i);
});

test("대화는 남기되 고치거나 지울 수 없다", async () => {
  /*
   * 주고받은 말은 남는다. 지울 수 있으면 "그런 말 한 적 없다" 가 되고,
   * 고칠 수 있으면 상대가 읽은 것과 달라진다.
   */
  const db = await 판세우기();
  const { rows } = await 지출넣기(db, 가구.집, 가구.우리);
  await db.로서(가구.우리);
  await db.query(`insert into expense_notes (expense_id, author_id, body) values ($1, $2, '이건 뭐야')`,
    [rows[0].id, 가구.우리]);

  assert.match(await db.막히나("update expense_notes set body = '아니야'"), /permission denied/i);
  assert.match(await db.막히나("delete from expense_notes"), /permission denied/i);
});

test("남의 이름으로 말할 수 없다", async () => {
  const db = await 판세우기();
  const { rows } = await 지출넣기(db, 가구.집, 가구.우리);
  await db.로서(가구.우리);
  const 막힘 = await db.막히나(
    `insert into expense_notes (expense_id, author_id, body) values ($1, $2, '짝인 척')`,
    [rows[0].id, 가구.너와],
  );
  assert.ok(막힘, "작성자를 남으로 적어 넣었다");
});

test("잔소리는 쓴 사람만 본다", async () => {
  /*
   * 대상이 미리 읽으면 잔소리가 잔소리가 아니다. 같은 가구여도 남의 것은 안 보인다.
   */
  const db = await 판세우기();
  await db.로서(가구.우리);
  await db.query(`insert into nags (household_id, author_id, target_id, percent, body)
    values ($1, $2, $3, 80, '이번 달 좀 쓰네')`, [가구.집, 가구.우리, 가구.너와]);

  assert.equal((await db.query("select count(*)::int c from nags")).rows[0].c, 1);
  await db.로서(가구.너와);
  assert.equal((await db.query("select count(*)::int c from nags")).rows[0].c, 0, "대상이 미리 읽었다");
});

test("울린 기록에는 아무도 직접 손대지 못한다", async () => {
  // 서버 함수만 적는다. 손으로 지우면 같은 잔소리가 매번 다시 울린다.
  const db = await 판세우기();
  await db.로서(가구.우리);
  assert.match(await db.막히나("select count(*) from nag_fires"), /permission denied/i);
  assert.match(await db.막히나("delete from nag_fires"), /permission denied/i);
});

test("위시는 읽기만 열려 있다", async () => {
  /*
   * 담기·나도·이룸은 전부 서버 함수를 지난다. 표를 직접 열어 두면 남의 위시를
   * 이룬 것으로 바꾸거나 합의를 손으로 적을 수 있다.
   */
  const db = await 판세우기();
  await db.로서(가구.우리);
  for (const 문장 of [
    `insert into wish_items (household_id, name, created_by) values ('${가구.집}', '몰래', '${가구.우리}')`,
    `update wish_items set name = '바꿔'`,
    `delete from wish_items`,
    `insert into wish_agreements (wish_id, user_id) values (gen_random_uuid(), '${가구.우리}')`,
  ]) {
    assert.match(await db.막히나(문장), /permission denied/i, `${문장.slice(0, 30)} 가 열려 있다`);
  }
  // 읽기는 된다 — 목록을 그려야 하니까.
  assert.equal((await db.막히나("select count(*) from wish_items")), null);
});
