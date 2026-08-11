import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BACKFILL_MONTHS,
  appliedKey,
  collectDueOccurrences,
  firstApplicableMonth,
  isValidDay,
  nextOccurrenceDate,
  describeApplied,
  resolveOccurrenceDate,
} from "../src/domain/fixed-costs.js";
import { shiftMonthKey } from "../src/domain/expenses.js";

const template = {
  id: "t1",
  member: "11111111-1111-1111-1111-111111111111",
  category: "housing",
  item: "아파트 관리비",
  amount: 187000,
  day: 25,
  startMonth: "2026-06",
};

const on = (y, m, d) => new Date(y, m - 1, d);

test("isValidDay는 1~31만 허용한다", () => {
  assert.equal(isValidDay(1), true);
  assert.equal(isValidDay(31), true);
  assert.equal(isValidDay(0), false);
  assert.equal(isValidDay(32), false);
  assert.equal(isValidDay(15.5), false);
  assert.equal(isValidDay("15"), false);
});

test("resolveOccurrenceDate는 그 달에 없는 날짜를 마지막 날로 당긴다", () => {
  assert.equal(resolveOccurrenceDate("2026-08", 25), "2026-08-25");
  assert.equal(resolveOccurrenceDate("2026-02", 31), "2026-02-28", "평년 2월");
  assert.equal(resolveOccurrenceDate("2024-02", 31), "2024-02-29", "윤년 2월");
  assert.equal(resolveOccurrenceDate("2026-04", 31), "2026-04-30", "30일까지인 달");
});

test("shiftMonthKey는 연도 경계를 넘어간다", () => {
  assert.equal(shiftMonthKey("2026-12", 1), "2027-01");
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
  assert.equal(shiftMonthKey("2026-08", 0), "2026-08");
});

test("firstApplicableMonth는 이번 달 반영일이 지났으면 다음 달부터 시작한다", () => {
  assert.equal(firstApplicableMonth(25, on(2026, 8, 10)), "2026-08", "아직 안 지났으면 이번 달");
  assert.equal(firstApplicableMonth(25, on(2026, 8, 25)), "2026-08", "당일은 포함");
  assert.equal(firstApplicableMonth(25, on(2026, 8, 26)), "2026-09", "지났으면 다음 달");
  assert.equal(firstApplicableMonth(1, on(2026, 12, 5)), "2027-01", "연말 경계");
});

test("반영일이 지난 달만 대상이 된다", () => {
  // 시작월 2026-06, 매월 25일. 오늘이 8월 10일이면 6월·7월만 지났다.
  const due = collectDueOccurrences([template], [], on(2026, 8, 10));
  assert.deepEqual(due.map((d) => d.date), ["2026-06-25", "2026-07-25"]);
});

test("반영일 당일이면 이번 달도 포함된다", () => {
  const due = collectDueOccurrences([template], [], on(2026, 8, 25));
  assert.deepEqual(due.map((d) => d.date), ["2026-06-25", "2026-07-25", "2026-08-25"]);
});

test("미래 달은 절대 만들지 않는다", () => {
  const due = collectDueOccurrences([template], [], on(2026, 8, 26));
  assert.ok(due.every((d) => d.date <= "2026-08-26"), "오늘 이후 날짜가 생기면 합계가 미리 부푼다");
});

test("이미 반영한 달은 다시 만들지 않는다", () => {
  const applied = [appliedKey("t1", "2026-06"), appliedKey("t1", "2026-07")];
  const due = collectDueOccurrences([template], applied, on(2026, 8, 25));
  assert.deepEqual(due.map((d) => d.date), ["2026-08-25"]);
});

test("반영된 지출을 지워도 되살아나지 않는다", () => {
  // 반영 기록이 남아 있는 한, 지출을 삭제해도 대상에서 빠진다.
  const applied = [appliedKey("t1", "2026-06"), appliedKey("t1", "2026-07"), appliedKey("t1", "2026-08")];
  assert.deepEqual(collectDueOccurrences([template], applied, on(2026, 8, 25)), []);
});

test("시작월 이전은 소급하지 않는다", () => {
  const due = collectDueOccurrences([{ ...template, startMonth: "2026-08" }], [], on(2026, 8, 25));
  assert.deepEqual(due.map((d) => d.date), ["2026-08-25"]);
});

test("오래 열지 않아도 소급 범위를 넘지 않는다", () => {
  const old = { ...template, startMonth: "2010-01" };
  const due = collectDueOccurrences([old], [], on(2026, 8, 25));
  assert.ok(due.length <= MAX_BACKFILL_MONTHS + 1, `${due.length}건이 한 번에 생기면 안 된다`);
});

test("여러 템플릿은 날짜 순으로 정렬된다", () => {
  const a = { ...template, id: "a", day: 25 };
  const b = { ...template, id: "b", day: 1 };
  const due = collectDueOccurrences([a, b], [], on(2026, 7, 30));
  assert.deepEqual(due.map((d) => `${d.date}:${d.template.id}`), [
    "2026-06-01:b", "2026-06-25:a", "2026-07-01:b", "2026-07-25:a",
  ]);
});

test("2월 말일 보정이 반영 대상 계산에도 적용된다", () => {
  const endOfMonth = { ...template, day: 31, startMonth: "2026-02" };
  const due = collectDueOccurrences([endOfMonth], [], on(2026, 3, 1));
  assert.deepEqual(due.map((d) => d.date), ["2026-02-28"]);
});

test("nextOccurrenceDate는 앞으로 들어올 날짜를 알려준다", () => {
  assert.equal(nextOccurrenceDate(template, [], on(2026, 8, 10)), "2026-08-25");
  assert.equal(nextOccurrenceDate(template, [], on(2026, 8, 26)), "2026-09-25");
  assert.equal(
    nextOccurrenceDate(template, [appliedKey("t1", "2026-09")], on(2026, 8, 26)),
    "2026-10-25",
    "이미 반영한 달은 건너뛴다",
  );
});
