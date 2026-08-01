import assert from "node:assert/strict";
import test from "node:test";

import {
  CATEGORIES,
  MAX_YEAR,
  MIN_YEAR,
  clampYear,
  filterByMember,
  formatMonth,
  formatShortDate,
  getMonthlyExpenses,
  isFutureDateKey,
  isValidDateKey,
  isValidMonthKey,
  nextMemberFilter,
  summarize,
  summarizeGoal,
} from "../src/expenses.js";

const 천 = { id: "11111111-1111-1111-1111-111111111111", name: "천웅" };
const 주 = { id: "22222222-2222-2222-2222-222222222222", name: "주연" };
const MEMBERS = [천, 주];

const validExpense = {
  id: "abc",
  date: "2026-08-01",
  member: 천.id,
  category: "food",
  item: "점심 국밥",
  amount: 12000,
  createdAt: 1,
};

test("isValidDateKey는 빈 값과 형식 위반을 거부한다", () => {
  assert.equal(isValidDateKey("2026-08-01"), true);
  assert.equal(isValidDateKey(""), false);
  assert.equal(isValidDateKey(null), false);
  assert.equal(isValidDateKey(undefined), false);
  assert.equal(isValidDateKey("2026-8-1"), false);
  assert.equal(isValidDateKey("-4-03-30"), false);
});

test("isValidDateKey는 달력에 없는 날짜를 거부한다", () => {
  assert.equal(isValidDateKey("2026-02-30"), false);
  assert.equal(isValidDateKey("2026-13-01"), false);
  assert.equal(isValidDateKey("2026-00-10"), false);
  assert.equal(isValidDateKey("2024-02-29"), true, "윤년 2월 29일은 유효해야 한다");
  assert.equal(isValidDateKey("2026-02-29"), false, "평년 2월 29일은 무효");
});

test("isValidDateKey는 지원 연도 범위를 벗어나면 거부한다", () => {
  assert.equal(isValidDateKey(`${MIN_YEAR - 1}-01-01`), false);
  assert.equal(isValidDateKey(`${MAX_YEAR + 1}-01-01`), false);
  assert.equal(isValidDateKey(`${MIN_YEAR}-01-01`), true);
  assert.equal(isValidDateKey(`${MAX_YEAR}-12-31`), true);
});

test("isFutureDateKey는 오늘 이후만 참이다", () => {
  const today = new Date(2026, 7, 15); // 2026-08-15
  assert.equal(isFutureDateKey("2026-08-16", today), true);
  assert.equal(isFutureDateKey("2027-05-15", today), true);
  assert.equal(isFutureDateKey("2026-08-15", today), false, "오늘은 미래가 아니다");
  assert.equal(isFutureDateKey("2026-08-14", today), false);
  assert.equal(isFutureDateKey("2020-01-01", today), false);
});

test("isFutureDateKey는 형식이 깨진 값에 참을 주지 않는다", () => {
  const today = new Date(2026, 7, 15);
  assert.equal(isFutureDateKey("", today), false);
  assert.equal(isFutureDateKey(null, today), false);
  assert.equal(isFutureDateKey("9999-99-99", today), false, "달력에 없는 날짜는 판정 대상이 아니다");
});

test("isValidMonthKey는 빈 문자열을 거부한다", () => {
  assert.equal(isValidMonthKey("2026-08"), true);
  assert.equal(isValidMonthKey(""), false, "빈 월키는 전체 레코드와 매칭되므로 반드시 거부");
  assert.equal(isValidMonthKey("2026-13"), false);
  assert.equal(isValidMonthKey("-4-03"), false);
});

test("clampYear는 연도를 지원 범위로 가둔다", () => {
  assert.equal(clampYear(-4), MIN_YEAR);
  assert.equal(clampYear(9999), MAX_YEAR);
  assert.equal(clampYear(2026), 2026);
  assert.equal(clampYear(Number.NaN), MIN_YEAR);
});

test("getMonthlyExpenses는 빈 월키로 전체를 반환하지 않는다", () => {
  const expenses = [validExpense, { ...validExpense, id: "b", date: "2026-09-01" }];
  assert.equal(getMonthlyExpenses(expenses, "2026-08").length, 1);
  assert.equal(getMonthlyExpenses(expenses, "2026-09").length, 1);
});

test("getMonthlyExpenses는 날짜 내림차순, 같은 날은 최신 입력 순으로 정렬한다", () => {
  const expenses = [
    { ...validExpense, id: "a", date: "2026-08-01", createdAt: 1 },
    { ...validExpense, id: "b", date: "2026-08-03", createdAt: 2 },
    { ...validExpense, id: "c", date: "2026-08-01", createdAt: 5 },
  ];
  assert.deepEqual(getMonthlyExpenses(expenses, "2026-08").map((e) => e.id), ["b", "c", "a"]);
});

test("summarize는 합계와 비중을 정확히 계산하고 합이 100%가 된다", () => {
  const monthly = [
    { ...validExpense, id: "a", member: 천.id, amount: 60000 },
    { ...validExpense, id: "b", member: 주.id, amount: 40000 },
    { ...validExpense, id: "c", member: 천.id, amount: 20000 },
  ];
  const s = summarize(monthly, MEMBERS);
  assert.equal(s.total, 120000);
  assert.equal(s.count, 3);
  assert.equal(s.perMember[0].total, 80000);
  assert.equal(s.perMember[0].count, 2);
  assert.equal(s.perMember[1].total, 40000);
  assert.equal(s.perMember[1].count, 1);
  assert.equal(s.perMember[0].percent + s.perMember[1].percent, 100);
});

test("summarize는 빈 목록에서 0으로 나누지 않는다", () => {
  const s = summarize([], MEMBERS);
  assert.equal(s.total, 0);
  assert.equal(s.perMember[0].percent, 0);
  assert.equal(s.perMember[1].percent, 0);
});

test("summarize는 반올림 오차가 있어도 비중 합이 항상 100%다", () => {
  const monthly = [
    { ...validExpense, id: "a", member: 천.id, amount: 1 },
    { ...validExpense, id: "b", member: 주.id, amount: 2 },
  ];
  const s = summarize(monthly, MEMBERS);
  assert.equal(s.perMember[0].percent + s.perMember[1].percent, 100);
});

test("filterByMember는 해당 인원의 지출만 남기고, 해제하면 전체를 돌려준다", () => {
  const monthly = [
    { ...validExpense, id: "a", member: 천.id },
    { ...validExpense, id: "b", member: 주.id },
    { ...validExpense, id: "c", member: 천.id },
  ];
  assert.deepEqual(filterByMember(monthly, 천.id).map((e) => e.id), ["a", "c"]);
  assert.deepEqual(filterByMember(monthly, 주.id).map((e) => e.id), ["b"]);
  assert.equal(filterByMember(monthly, null), monthly, "해제 시 원본을 그대로 돌려준다");
});

test("nextMemberFilter는 같은 사람을 다시 누르면 해제된다", () => {
  assert.equal(nextMemberFilter(null, 천.id), 천.id);
  assert.equal(nextMemberFilter(천.id, 천.id), null, "재선택은 해제");
  assert.equal(nextMemberFilter(천.id, 주.id), 주.id, "다른 사람이면 그쪽으로 전환");
  assert.equal(nextMemberFilter(천.id, ""), null, "빈 값은 해제로 처리");
});

test("필터는 상단 요약 계산에 영향을 주지 않는다", () => {
  const monthly = [
    { ...validExpense, id: "a", member: 천.id, amount: 60000 },
    { ...validExpense, id: "b", member: 주.id, amount: 40000 },
  ];
  const full = summarize(monthly, MEMBERS);
  const filtered = filterByMember(monthly, 천.id);
  assert.equal(full.total, 100000);
  assert.equal(filtered.length, 1, "목록만 줄어든다");
  assert.equal(summarize(monthly, MEMBERS).total, 100000, "요약은 전체 기준을 유지");
});

test("summarize는 명부 순서대로 몫을 돌려준다", () => {
  const s = summarize([{ ...validExpense, amount: 1000 }], MEMBERS);
  assert.deepEqual(s.perMember.map((m) => m.name), ["천웅", "주연"]);
  assert.equal(s.perMember[0].percent, 100);
  assert.equal(s.perMember[1].percent, 0);
});

test("summarize는 명부가 비어도 합계는 낸다", () => {
  // 명부를 읽기 전에 그려도 죽지 않아야 한다.
  const s = summarize([validExpense], []);
  assert.equal(s.total, 12000);
  assert.deepEqual(s.perMember, []);
});

test("formatMonth는 유효한 월키를 사람이 읽는 형식으로 바꾼다", () => {
  assert.equal(formatMonth("2026-08"), "2026년 8월");
  assert.equal(formatMonth("2026-12"), "2026년 12월");
});

test("formatShortDate는 자릿수를 유지해 세로 정렬이 맞는 표기를 만든다", () => {
  assert.equal(formatShortDate("2026-08-01"), "08.01");
  assert.equal(formatShortDate("2026-12-25"), "12.25");
  assert.equal(formatShortDate("2026-01-09"), "01.09");
  const widths = new Set(["2026-08-01", "2026-12-25", "2026-01-09"].map((d) => formatShortDate(d).length));
  assert.equal(widths.size, 1, "모든 날짜의 글자 수가 같아야 열이 흔들리지 않는다");
});

test("summarizeGoal은 목표가 없으면 아무것도 돌려주지 않는다", () => {
  const monthly = [{ ...validExpense, amount: 10000 }];
  assert.equal(summarizeGoal({ monthly, memberId: 천.id, goal: null }), null);
  assert.equal(summarizeGoal({ monthly, memberId: 천.id, goal: 0 }), null);
  assert.equal(summarizeGoal({ monthly, memberId: "", goal: 100000 }), null);
});

test("summarizeGoal은 고른 결제자의 지출만 센다", () => {
  const monthly = [
    { ...validExpense, id: "a", member: 천.id, amount: 30000 },
    { ...validExpense, id: "b", member: 주.id, amount: 90000 },
  ];
  const mine = summarizeGoal({ monthly, memberId: 천.id, goal: 100000 });
  assert.equal(mine.spent, 30000, "상대 지출이 섞이면 안 된다");
  assert.equal(mine.remaining, 70000);
  assert.equal(mine.percent, 70);
  assert.equal(mine.over, false);
});

test("summarizeGoal은 아직 저장하지 않은 금액을 미리 반영한다", () => {
  // 쓰기 전에 "이거 하면 얼마 남지?"에 답해야 한다.
  const monthly = [{ ...validExpense, id: "a", member: 천.id, amount: 30000 }];
  const result = summarizeGoal({ monthly, memberId: 천.id, goal: 100000, draft: 50000 });
  assert.equal(result.spent, 80000);
  assert.equal(result.remaining, 20000);
});

test("summarizeGoal은 수정 중인 지출을 두 번 세지 않는다", () => {
  // 15,000원짜리를 20,000원으로 고치는 중이면 원래 금액은 빼야 한다.
  const monthly = [{ ...validExpense, id: "edit-me", member: 천.id, amount: 15000 }];
  const result = summarizeGoal({
    monthly, memberId: 천.id, goal: 100000, draft: 20000, excludeId: "edit-me",
  });
  assert.equal(result.spent, 20000, "35,000원이 되면 이중 계산이다");
  assert.equal(result.remaining, 80000);
});

test("summarizeGoal은 초과를 음수 비율 대신 표시로 알린다", () => {
  const monthly = [{ ...validExpense, id: "a", member: 천.id, amount: 120000 }];
  const result = summarizeGoal({ monthly, memberId: 천.id, goal: 100000 });
  assert.equal(result.over, true);
  assert.equal(result.remaining, -20000, "초과 금액을 알 수 있어야 한다");
  assert.equal(result.percent, 0, "음수 %는 읽는 순간 계산이 필요해진다");
});

test("summarizeGoal은 목표를 정확히 다 썼을 때 초과가 아니다", () => {
  const monthly = [{ ...validExpense, id: "a", member: 천.id, amount: 100000 }];
  const result = summarizeGoal({ monthly, memberId: 천.id, goal: 100000 });
  assert.equal(result.over, false);
  assert.equal(result.remaining, 0);
  assert.equal(result.percent, 0);
});
