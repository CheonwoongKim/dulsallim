import assert from "node:assert/strict";
import test from "node:test";

import {
  fromExpense,
  fromOccurrence,
  fromTemplate,
  toAppliedKey,
  toExpense,
  toTemplate,
  toWish,
} from "../src/data/rows.js";

const 천 = "11111111-1111-1111-1111-111111111111";
const 집 = "99999999-9999-9999-9999-999999999999";
const context = { householdId: 집, userId: 천 };

const expenseRow = {
  id: "e1",
  household_id: 집,
  paid_by: 천,
  spent_on: "2026-08-01",
  category: "food",
  item: "점심 국밥",
  amount: 12000,
  fixed_cost_id: null,
  created_at: "2026-08-01T09:30:00+00:00",
  created_by: 천,
};

const templateRow = {
  id: "f1",
  household_id: 집,
  paid_by: 천,
  category: "housing",
  item: "아파트 관리비",
  amount: 187000,
  day_of_month: 25,
  start_month: "2026-06-01",
};

test("toExpense는 DB 열 이름을 화면 이름으로 옮긴다", () => {
  const expense = toExpense(expenseRow);
  assert.equal(expense.date, "2026-08-01");
  assert.equal(expense.member, 천);
  assert.equal(expense.item, "점심 국밥");
  assert.equal(expense.amount, 12000);
  assert.ok(expense.createdAt > 0, "정렬에 쓰이므로 숫자여야 한다");
});

test("toExpense는 알 수 없는 분류를 기타로 받아 화면이 깨지지 않게 한다", () => {
  assert.equal(toExpense({ ...expenseRow, category: "없는분류" }).category, "etc");
  assert.equal(toExpense({ ...expenseRow, created_at: null }).createdAt, 0);
});

test("fromExpense는 가구와 작성자를 서버가 요구하는 형태로 채운다", () => {
  const row = fromExpense(toExpense(expenseRow), context);
  assert.equal(row.household_id, 집);
  assert.equal(row.created_by, 천);
  assert.equal(row.spent_on, "2026-08-01");
  assert.equal(row.fixed_cost_id, null, "직접 적은 지출은 고정비와 무관하다");
});

test("지출은 DB를 한 바퀴 돌아도 내용이 그대로다", () => {
  const round = toExpense({ ...expenseRow, ...fromExpense(toExpense(expenseRow), context) });
  const first = toExpense(expenseRow);
  for (const key of ["date", "member", "category", "item", "amount"]) {
    assert.equal(round[key], first[key], `${key}가 왕복에서 바뀐다`);
  }
});

test("고정비의 시작월은 DB에서는 날짜, 화면에서는 월이다", () => {
  const template = toTemplate(templateRow);
  assert.equal(template.startMonth, "2026-06", "화면은 월 단위로만 다룬다");
  assert.equal(template.day, 25);
  assert.equal(fromTemplate(template, context).start_month, "2026-06-01", "DB는 그 달 1일로 저장한다");
});

test("반영 기록은 며칠에 넣었든 그 달 1일로 모인다", () => {
  // 이 값이 중복 방지 기본키다. 25일과 26일이 다른 값이 되면 같은 달이 두 번 기록된다.
  const claim = fromOccurrence({ template: { id: "f1" }, date: "2026-08-25" });
  assert.deepEqual(claim, { fixed_cost_id: "f1", month: "2026-08-01" });
  assert.equal(fromOccurrence({ template: { id: "f1" }, date: "2026-08-26" }).month, claim.month);
});

test("toAppliedKey는 화면이 쓰는 한 줄짜리 키를 만든다", () => {
  assert.equal(toAppliedKey({ fixed_cost_id: "f1", month: "2026-08-01" }), "f1:2026-08");
});

test("toWish는 위시 행과 합의자 목록을 화면 이름으로 옮긴다", () => {
  const wish = toWish({
    id: "w1",
    household_id: 집,
    name: "큰 식탁",
    url: null,
    estimated_price: 800000,
    created_by: 천,
    created_at: "2026-08-06T09:30:00+00:00",
    state: "pursuing",
    pursuing_at: "2026-08-06T10:00:00+00:00",
    expense_id: null,
    achieved_on: null,
    achieved_at: null,
    agreement_user_ids: [천],
  });

  assert.equal(wish.householdId, 집);
  assert.equal(wish.estimatedPrice, 800000);
  assert.equal(wish.createdBy, 천);
  assert.equal(wish.pursuingAt, "2026-08-06T10:00:00+00:00");
  assert.deepEqual(wish.agreementUserIds, [천]);
});
