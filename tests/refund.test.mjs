import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { sumByCategory, sumMonth } from "../src/domain/analysis.js";
import { sumByDate } from "../src/domain/calendar.js";
import { netAmount, summarize, summarizeGoal } from "../src/domain/expenses.js";
import { buildYearSeries } from "../src/domain/trend.js";
import { fromExpense, toExpense } from "../src/data/rows.js";
import { 문서세우기, 태그들 } from "./helpers/dom.mjs";

/*
 * 실비 환급 — 결제한 금액과 실제로 부담한 금액을 갈라 두는 자리.
 *
 * 병원에서 10만 원을 내고 나중에 실손보험에서 7만 원을 돌려받으면 나간 돈은 3만 원이다.
 * 여태는 금액을 3만 원으로 고쳐 적었는데, 그러면 10만 원이 나간 사실이 사라진다.
 * (이미 울린 잔소리는 여기서도 안 꺼진다. 그건 그대로 두기로 한 자리다.)
 *
 * 그래서 결제 금액은 그대로 두고 돌려받은 만큼만 따로 적는다. 대신 **더하는 자리가
 * 하나라도 남으면 화면마다 숫자가 달라진다.** 여기서 자리마다 값으로 확인한다 —
 * 어느 한 곳이 다시 결제 금액을 더하면 그 줄이 빨개진다.
 */

const 나 = "11111111-1111-1111-1111-111111111111";
const 너 = "22222222-2222-2222-2222-222222222222";

/** 10만 원 결제, 7만 원 환급. 실부담은 3만 원이다. */
const 병원 = (덮어쓰기 = {}) => ({
  id: "e1",
  date: "2026-08-10",
  member: 나,
  category: "medical",
  item: "병원",
  amount: 100000,
  refunded: 70000,
  createdAt: 1,
  ...덮어쓰기,
});

/** 환급이 없는 지출은 지금까지와 똑같이 다뤄져야 한다. */
const 커피 = (덮어쓰기 = {}) => 병원({ id: "e2", category: "cafe", item: "커피", amount: 4500, refunded: null, ...덮어쓰기 });

test("실부담은 결제 금액에서 돌려받은 만큼을 뺀 값이다", () => {
  assert.equal(netAmount(병원()), 30000);
  // 안 받았으면 결제 금액 그대로다. null 도 없는 열도 같게 본다.
  assert.equal(netAmount(커피()), 4500);
  assert.equal(netAmount({ amount: 4500 }), 4500);
});

test("달 합계와 사람별 몫이 실부담으로 선다", () => {
  const 요약 = summarize([병원(), 커피({ member: 너 })], [
    { id: 나, name: "나" },
    { id: 너, name: "너" },
  ]);
  assert.equal(요약.total, 34500, "총액이 결제 금액으로 섰다");
  assert.equal(요약.perMember[0].total, 30000);
  assert.equal(요약.perMember[1].total, 4500);
  // 건수는 그대로다 — 돌려받았다고 안 쓴 것이 되지는 않는다.
  assert.equal(요약.count, 2);
});

test("남은 목표도 실부담으로 센다", () => {
  const 목표 = summarizeGoal({ monthly: [병원()], memberId: 나, goal: 100000 });
  assert.equal(목표.spent, 30000);
  assert.equal(목표.remaining, 70000);
  assert.equal(목표.over, false, "환급받고도 목표를 넘겼다고 한다");
});

test("분석의 달 합계·분류별 합계도 실부담이다", () => {
  assert.equal(sumMonth([병원(), 커피()], "2026-08"), 34500);

  const 분류 = sumByCategory([병원(), 커피({ amount: 50000 })]);
  assert.equal(분류.find((줄) => 줄.key === "medical").total, 30000);
  // 많이 쓴 순이 뒤바뀐다 — 실부담으로는 카페(5만)가 병원(3만)보다 크고,
  // 결제 금액으로 세면 병원(10만)이 맨 위로 올라간다.
  assert.deepEqual(분류.map((줄) => 줄.key), ["cafe", "medical"]);
});

test("캘린더 칸의 날짜별 합계도 실부담이다", () => {
  const 날별 = sumByDate([병원(), 커피({ date: "2026-08-10" })]);
  assert.equal(날별["2026-08-10"], 34500);
});

test("한 해 추이의 선도 실부담으로 그린다", () => {
  const 추이 = buildYearSeries([병원()], [{ id: 나, name: "나", color: "#20211e", goal: null }], 2026, new Date(2026, 11, 31));
  // 8월은 0번부터 세어 일곱 번째다.
  assert.equal(추이.series[0].points[7], 30000);
});

test("DB 행과 화면 값 사이에서 환급이 살아 남는다", () => {
  const 화면 = toExpense({
    id: "e1", spent_on: "2026-08-10", paid_by: 나, category: "medical",
    item: "병원", amount: 100000, refunded: 70000, created_at: "2026-08-10T00:00:00Z",
  });
  assert.equal(화면.refunded, 70000);
  assert.equal(netAmount(화면), 30000);

  // 열이 아직 없는(=마이그레이션 전) 행이 와도 터지지 않고 "안 받았다" 로 읽힌다.
  assert.equal(toExpense({ id: "e2", amount: 4500, created_at: "" }).refunded, null);

  const 행 = fromExpense(화면, { householdId: "h", userId: 나 });
  assert.equal(행.amount, 100000, "결제 금액은 덮어쓰지 않는다");
  assert.equal(행.refunded, 70000);
  // 0 은 "안 받았다" 다. 그대로 보내면 DB 의 check(refunded > 0) 에 걸린다.
  assert.equal(fromExpense({ ...화면, refunded: 0 }, { householdId: "h", userId: 나 }).refunded, null);
});

test("서버에서 지출을 더하는 자리는 전부 실부담으로 센다", async () => {
  /*
   * 화면만 고치고 서버를 놓치면 알림과 잔소리가 화면과 다른 숫자를 말한다. 실제로
   * 월말 요약이 그랬다 — 알림은 854,800 을, 화면은 784,800 을 보여 주고 있었다.
   *
   * 그래서 자리를 손으로 세지 않고 supabase/ 를 통째로 훑는다. 새 합산 자리가 생겨도
   * 결제 금액을 그대로 더하면 여기서 걸린다.
   */
  const 뿌리 = new URL("../supabase/", import.meta.url);
  const 파일들 = [
    "schema.sql",
    ...(await readdir(new URL("migrations/", 뿌리))).filter((이름) => 이름.endsWith(".sql")).sort()
      .map((이름) => `migrations/${이름}`),
  ];

  /*
   * 옛 마이그레이션은 그때의 몸통을 들고 있는 것이 맞다. 고치면 그 판까지만 돌린 집에서
   * 없는 열을 골라 터진다. 대신 마지막 판이 둘 다 다시 적는지를 아래에서 확인한다.
   * (이 두 파일에 새 합산 자리를 더하는 일은 없다 — 지나간 판이다.)
   */
  const 옛판 = {
    "migrations/20260101000004_nag.sql": "그때의 fire_nags",
    "migrations/20260101000009_push_triggers.sql": "그때의 send_month_summary",
  };

  const 날것 = [];
  for (const 이름 of 파일들) {
    if (이름 in 옛판) continue;
    const 글 = await readFile(new URL(이름, 뿌리), "utf8");
    for (const 맞은것 of 글.matchAll(/sum\(\s*amount\s*\)/g)) 날것.push(`${이름}: ${맞은것[0]}`);
  }
  assert.deepEqual(날것, [],
    "결제 금액을 그대로 더한다 — sum(amount - coalesce(refunded, 0)) 로 셀 것");

  // 옛판이라 적은 것은 정말 뒤에서 다시 적혔어야 한다. 적당히 넣고 넘어가지 못하게.
  const 마지막 = await readFile(new URL("migrations/20260922010000_expense_refund.sql", 뿌리), "utf8");
  for (const 함수 of ["fire_nags", "send_month_summary"]) {
    assert.match(마지막, new RegExp(`create or replace function ${함수}`),
      `${함수} 를 다시 적지 않았다 — 이미 옛 판을 돌린 집에는 고침이 안 닿는다`);
  }
  assert.equal((마지막.match(/sum\(amount - coalesce\(refunded, 0\)\)/g) ?? []).length, 2,
    "다시 적은 두 함수가 둘 다 실부담으로 세야 한다");
});

/* ── 목록의 한 줄 ─────────────────────────────────────────── */

문서세우기();
const { createExpenseRow } = await import("../src/ui/expense-row.js");
const { setMembers } = await import("../src/members.js");

setMembers([{ id: 나, name: "나", color: "#20211e", goal: null }]);

test("환급이 있는 줄은 실부담과 결제 금액을 함께 보인다", () => {
  const 줄 = createExpenseRow(병원()).innerHTML;
  for (const 숫자 of ["30,000원", "100,000원", "70,000원"]) {
    assert.ok(줄.includes(숫자), `줄에 ${숫자} 이 없다`);
  }
  // 읽어 주는 사람에게는 이 한 줄이 전부다. 눈으로 보이는 것이 거기에도 있어야 한다.
  const 면 = 태그들(줄, "button").at(-1);
  for (const 숫자 of ["30,000원", "100,000원", "70,000원"]) {
    assert.ok(면["aria-label"].includes(숫자), `읽어 주는 이름에 ${숫자} 이 없다`);
  }
});

test("합계에 들어가는 숫자가 줄에서 제일 크게 앉는다", () => {
  /*
   * 결제 금액을 앞세우면 보이는 숫자를 다 더해도 위의 총액이 안 나온다.
   * 여기서는 짜임만 본다 — 실부담이 큰 자리(strong)에, 나머지가 작은 자리(small)에.
   * 정말 몇 px 인지는 브라우저가 잰다(tests-browser/run.mjs).
   */
  const 줄 = createExpenseRow(병원()).innerHTML;
  const 금액칸 = 줄.slice(줄.indexOf('class="expense-amount"'));
  const 큰것 = 금액칸.slice(금액칸.indexOf("<strong>"), 금액칸.indexOf("</strong>"));
  const 작은것 = 금액칸.slice(금액칸.indexOf("<small>"), 금액칸.indexOf("</small>"));
  assert.ok(큰것.includes("30,000원"), `큰 자리에 실부담이 없다: ${큰것}`);
  assert.ok(!큰것.includes("100,000"), "큰 자리에 결제 금액이 앉았다");
  assert.ok(작은것.includes("100,000원") && 작은것.includes("70,000원"));
});

test("위시를 이룬 지출 고르기도 실제로 낸 돈을 보인다", async () => {
  // 목록이 3만 원이라 한 지출을 여기서 10만 원이라 하면 어느 것을 고르는지 헷갈린다.
  const { createExpenseChoice } = await import("../src/ui/wish-list.js");
  const 글 = createExpenseChoice(병원()).innerHTML;
  assert.ok(글.includes("30,000원"), `실부담이 없다: ${글}`);
  assert.ok(!글.includes("100,000원"), "결제 금액을 그대로 보인다");
});

test("환급이 없는 줄은 곁들이는 칸을 안 만든다", () => {
  const 줄 = createExpenseRow(커피()).innerHTML;
  assert.ok(줄.includes("4,500원"));
  assert.ok(!줄.includes("<small>"), "환급이 없는데 곁들이는 칸이 생겼다");
  assert.ok(!줄.includes("환급"), "환급이 없는데 환급 이야기를 한다");
});
