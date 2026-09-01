import assert from "node:assert/strict";
import test from "node:test";

import { 가구, 판세우기 } from "./helpers/db.mjs";

/*
 * 서버가 막아 주기로 한 것들.
 *
 * CLAUDE.md §6.5 가 적어 둔 그대로다 — "목 서버에는 제약도 RLS 도 없다.
 * 브라우저에서 되는 것을 봤다는 말은 서버가 맞다는 뜻이 아니다 —
 * 제약에 걸리는 변경을 목으로는 두 번 놓쳤다."
 * 여기서는 진짜 Postgres 에 물어본다.
 */

const 지출 = (db, { by = 가구.우리, category = "food", item = "커피", amount = 4500, on = "2026-08-01" } = {}) =>
  db.막히나(
    `insert into expenses (household_id, paid_by, spent_on, category, item, amount, created_by)
     values ($1, $2, $3, $4, $5, $6, $2)`,
    [가구.집, by, on, category, item, amount],
  );

/* ── 제약 ─────────────────────────────────────────────────── */

test("분류는 정해 둔 것만 받는다", async () => {
  const db = await 판세우기();
  await db.로서(가구.우리);
  assert.equal(await 지출(db, { category: "food" }), null);
  assert.match(await 지출(db, { category: "없는분류" }), /constraint|check/i);
  // 화면이 CATEGORIES 에 하나 더하고 DB 를 안 고치면 그 분류로는 한 건도 안 들어간다.
  assert.match(await 지출(db, { category: "" }), /constraint|check/i);
});

test("금액은 1원 이상 정수다", async () => {
  const db = await 판세우기();
  await db.로서(가구.우리);
  assert.equal(await 지출(db, { amount: 1 }), null);
  assert.match(await 지출(db, { amount: 0 }), /constraint|check/i);
  assert.match(await 지출(db, { amount: -1000 }), /constraint|check/i);
});

test("항목은 빈칸일 수 없다", async () => {
  // 공백만 적어도 안 된다. 목록에 이름 없는 줄이 생긴다.
  const db = await 판세우기();
  await db.로서(가구.우리);
  assert.match(await 지출(db, { item: "" }), /constraint|check/i);
  assert.match(await 지출(db, { item: "   " }), /constraint|check/i);
});

test("아바타 색은 소문자 여섯 자리 HEX 만 받는다", async () => {
  /*
   * 이 값은 화면에서 style 속성 안에 들어간다. 화면 쪽에도 잣대가 있지만
   * 마지막 문은 여기다 — 여기가 열리면 화면의 잣대를 우회하는 길이 생긴다.
   */
  const db = await 판세우기();
  await db.로서(가구.우리);
  const 색 = (값) => db.막히나("update profiles set avatar_color = $1 where id = $2", [값, 가구.우리]);
  assert.equal(await 색("#12abef"), null);
  for (const 못된값 of ["#12ABEF", "#fff", "red", '#000" onload="x', "#12abef;"]) {
    assert.match(await 색(못된값), /constraint|check/i, `${못된값} 이 통과했다`);
  }
});

test("위시의 상태와 딸린 값이 어긋날 수 없다", async () => {
  /*
   * 이룬 것에는 이룬 날이 있어야 하고, 아직인 것에는 없어야 한다.
   * 어긋나면 목록이 "이뤘는데 언제인지 모르는 것" 을 그린다.
   */
  const db = await 판세우기();
  const 넣기 = (값) => db.막히나(
    `insert into wish_items (household_id, name, created_by, state, pursuing_at, achieved_on, achieved_at)
     values ($1, '의자', $2, $3, $4, $5, $6)`,
    [가구.집, 가구.우리, ...값],
  );
  assert.equal(await 넣기(["proposed", null, null, null]), null);
  assert.equal(await 넣기(["achieved", null, "2026-08-01", "2026-08-01T00:00:00Z"]), null);
  // 이뤘다면서 날이 없다.
  assert.match(await 넣기(["achieved", null, null, null]), /constraint|check/i);
  // 아직인데 이룬 날이 있다.
  assert.match(await 넣기(["proposed", null, "2026-08-01", "2026-08-01T00:00:00Z"]), /constraint|check/i);
  // 셋 밖의 상태는 어느 가지에도 안 걸린다.
  assert.match(await 넣기(["없는상태", null, null, null]), /constraint|check/i);
});

test("지금 목표는 사람마다 하나뿐이다", async () => {
  // 화면이 두 번 눌려도 하나여야 한다. 둘이 되면 목록 맨 위가 둘이 된다.
  const db = await 판세우기();
  const 목표넣기 = (name) => db.막히나(
    `insert into wish_items (household_id, name, created_by, is_goal) values ($1, $2, $3, true)`,
    [가구.집, name, 가구.우리],
  );
  assert.equal(await 목표넣기("첫째"), null);
  assert.match(await 목표넣기("둘째"), /unique|duplicate/i);
  // 짝은 제 목표를 따로 가진다.
  assert.equal(await db.막히나(
    `insert into wish_items (household_id, name, created_by, is_goal) values ($1, '짝것', $2, true)`,
    [가구.집, 가구.너와]), null);
});

test("같은 고정비를 같은 달에 두 번 반영할 수 없다", async () => {
  /*
   * 폰이 두 대라 같은 순간에 같은 일을 시도한다. 중복 방지는 화면이 아니라 여기가 한다.
   */
  const db = await 판세우기();
  const { rows } = await db.query(
    `insert into fixed_costs (household_id, paid_by, category, item, amount, day_of_month, start_month)
     values ($1, $2, 'housing', '월세', 500000, 1, '2026-01-01') returning id`, [가구.집, 가구.우리]);
  const 반영 = () => db.막히나(`insert into fixed_cost_applications (fixed_cost_id, month) values ($1, '2026-08-01')`, [rows[0].id]);
  assert.equal(await 반영(), null);
  assert.match(await 반영(), /unique|duplicate/i);
});

test("잔소리 구간은 1~200 이다", async () => {
  /*
   * 100 을 넘겨 두는 것도 뜻이 있다 — 목표를 두 배로 넘겼을 때 할 말이 따로 있다.
   * 다만 0 이나 1000 은 뜻이 없다. 0 이면 첫 지출부터 울리고, 1000 이면 영영 안 울린다.
   */
  const db = await 판세우기();
  await db.로서(가구.우리);
  const 넣기 = (percent) => db.막히나(
    `insert into nags (household_id, author_id, target_id, percent, body) values ($1, $2, $3, $4, '말')`,
    [가구.집, 가구.우리, 가구.너와, percent]);
  assert.equal(await 넣기(1), null);
  assert.equal(await 넣기(200), null);
  assert.match(await 넣기(0), /constraint|check/i);
  assert.match(await 넣기(201), /constraint|check/i);
});

test("같은 구간에 잔소리를 둘 둘 수 없다", async () => {
  // 어느 것이 울릴지 알 수 없어진다.
  const db = await 판세우기();
  await db.로서(가구.우리);
  const 넣기 = (body) => db.막히나(
    `insert into nags (household_id, author_id, target_id, percent, body) values ($1, $2, $3, 80, $4)`,
    [가구.집, 가구.우리, 가구.너와, body]);
  assert.equal(await 넣기("첫마디"), null);
  assert.match(await 넣기("둘째마디"), /unique|duplicate/i);
});

/* ── 서버 함수 ────────────────────────────────────────────── */

test("고정비 반영은 두 번 불러도 한 번만 만든다", async () => {
  /*
   * 반영 표시와 지출 생성이 한 트랜잭션이다. 요청을 나누면 지출이 저장된 뒤 응답만
   * 유실됐을 때 표시를 되돌리고 재시도해 같은 지출이 두 번 생긴다.
   */
  const db = await 판세우기();
  const { rows } = await db.query(
    `insert into fixed_costs (household_id, paid_by, category, item, amount, day_of_month, start_month)
     values ($1, $2, 'housing', '월세', 500000, 1, '2026-01-01') returning id`, [가구.집, 가구.우리]);
  await db.로서(가구.우리);

  const 첫번째 = await db.query("select * from apply_fixed_cost($1, '2026-08-01', '2026-08-01')", [rows[0].id]);
  assert.equal(첫번째.rows.length, 1, "첫 반영이 지출을 안 만들었다");
  assert.equal(첫번째.rows[0].item, "월세");

  const 두번째 = await db.query("select * from apply_fixed_cost($1, '2026-08-01', '2026-08-01')", [rows[0].id]);
  assert.equal(두번째.rows.length, 0, "두 번째가 또 만들었다");
  assert.equal((await db.query("select count(*)::int c from expenses")).rows[0].c, 1);
});

test("남의 가구 고정비로는 반영을 부를 수 없다", async () => {
  /*
   * 이 함수는 security definer 라 RLS 를 우회한다. 그래서 함수 안에서 직접 막는다 —
   * 그 검사를 지우면 남의 집 월세를 내 이름으로 만들 수 있다.
   */
  const db = await 판세우기();
  const { rows } = await db.query(
    `insert into fixed_costs (household_id, paid_by, category, item, amount, day_of_month, start_month)
     values ($1, $2, 'housing', '남의월세', 500000, 1, '2026-01-01') returning id`, [가구.남의집, 가구.남]);
  await db.로서(가구.우리);
  assert.match(await db.막히나("select * from apply_fixed_cost($1, '2026-08-01', '2026-08-01')", [rows[0].id]),
    /찾을 수 없습니다/);
});

test("담기·나도·이룸이 서버 함수로만 돈다", async () => {
  const db = await 판세우기();
  await db.로서(가구.우리);
  const 담김 = await db.query("select * from create_wish('의자', null, 120000, '허리가 아파서')");
  assert.equal(담김.rows.length, 1);
  const wishId = 담김.rows[0].id;
  assert.equal(담김.rows[0].state, "proposed");
  // 담은 사람은 자동으로 합의에 든다 — 제가 담았으니 바라는 사람이다.
  assert.deepEqual(담김.rows[0].agreement_user_ids, [가구.우리]);

  // 짝이 "나도" 를 누르면 함께 바라는 것이 된다.
  await db.로서(가구.너와);
  const 합의 = await db.query("select * from agree_wish($1)", [wishId]);
  assert.equal(합의.rows[0].state, "pursuing");
  assert.equal(합의.rows[0].agreement_user_ids.length, 2);

  // 남의 집 사람은 손댈 수 없다.
  await db.로서(가구.남);
  assert.ok(await db.막히나("select * from agree_wish($1)", [wishId]), "남의 집 위시에 나도를 눌렀다");
});

test("이룬 것은 그날 지출과 이어 붙는다", async () => {
  const db = await 판세우기();
  await db.로서(가구.우리);
  const wishId = (await db.query("select * from create_wish('의자', null, 120000, null)")).rows[0].id;
  const { rows } = await db.query(
    `insert into expenses (household_id, paid_by, spent_on, category, item, amount, created_by)
     values ($1, $2, '2026-08-14', 'etc', '의자', 120000, $2) returning id`, [가구.집, 가구.우리]);

  const 이룸 = await db.query("select * from achieve_wish($1, $2)", [wishId, rows[0].id]);
  assert.equal(이룸.rows[0].state, "achieved");
  assert.equal(이룸.rows[0].expense_id, rows[0].id);
  // 이룬 날은 그 지출의 날이다. 오늘이 아니라.
  assert.equal(new Date(이룸.rows[0].achieved_on).toISOString().slice(0, 10), "2026-08-14");
});

test("초기화는 내 가구만 지운다", async () => {
  const db = await 판세우기();
  for (const [집, 사람] of [[가구.집, 가구.우리], [가구.남의집, 가구.남]]) {
    await db.query(
      `insert into expenses (household_id, paid_by, spent_on, category, item, amount, created_by)
       values ($1, $2, '2026-08-01', 'food', '커피', 4500, $2)`, [집, 사람]);
  }
  await db.로서(가구.우리);
  await db.query("select reset_household()");

  assert.equal((await db.query("select count(*)::int c from expenses")).rows[0].c, 0, "내 것이 남았다");
  await db.주인으로();
  assert.equal((await db.query("select count(*)::int c from expenses")).rows[0].c, 1, "남의 집 것까지 지웠다");
});

test("잔소리는 구간을 넘긴 달에 한 번만 울린다", async () => {
  /*
   * 두 폰이 같은 순간에 계산해도 한 번만 울려야 한다.
   * 이게 없으면 80%를 넘긴 뒤 지출할 때마다 매번 잔소리가 붙는다.
   */
  const db = await 판세우기();
  await db.query("update profiles set monthly_goal = 100000 where id = $1", [가구.너와]);
  await db.로서(가구.우리);
  await db.query(`insert into nags (household_id, author_id, target_id, percent, body)
    values ($1, $2, $3, 80, '좀 쓰네')`, [가구.집, 가구.우리, 가구.너와]);

  // 이번 달 지출에만 울린다 — 9월에 7월 기록을 넣었다고 울리면 이상하다. 그래서 오늘로 적는다.
  const 오늘 = new Date().toISOString().slice(0, 10);
  const 쓰기 = async (amount) => {
    const { rows } = await db.query(
      `insert into expenses (household_id, paid_by, spent_on, category, item, amount, created_by)
       values ($1, $2, $4, 'food', '커피', $3, $2) returning id`, [가구.집, 가구.너와, amount, 오늘]);
    await db.query("select fire_nags($1)", [rows[0].id]);
    return rows[0].id;
  };

  await 쓰기(50000);
  await db.주인으로();
  assert.equal((await db.query("select count(*)::int c from nag_fires")).rows[0].c, 0, "안 넘겼는데 울렸다");

  await db.로서(가구.우리);
  await 쓰기(40000);
  await db.주인으로();
  assert.equal((await db.query("select count(*)::int c from nag_fires")).rows[0].c, 1, "넘겼는데 안 울렸다");

  await db.로서(가구.우리);
  await 쓰기(10000);
  await db.주인으로();
  assert.equal((await db.query("select count(*)::int c from nag_fires")).rows[0].c, 1, "같은 구간을 두 번 울렸다");
});
