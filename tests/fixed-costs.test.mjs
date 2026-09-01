import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BACKFILL_MONTHS,
  appliedKey,
  collectDueOccurrences,
  countSkippedMonths,
  describeSchedule,
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

test("소급은 이번 달을 포함해 열세 달까지다", () => {
  /*
   * 상수 이름은 12 인데 실제 창은 13 이다 — 이번 달도 함께 세기 때문이다.
   * 이름만 보고 12 로 읽으면 경계에서 한 달이 어긋난다. 실제로 리뷰에서 그렇게 읽혔다.
   */
  const 오래된것 = { id: "old", day: 1, startMonth: "2020-01" };
  const due = collectDueOccurrences([오래된것], [], on(2026, 8, 15));

  assert.equal(due.length, MAX_BACKFILL_MONTHS + 1, "이번 달까지 세어 열세 달");
  assert.equal(due[0].date, "2025-08-01", "열두 달 앞에서 시작");
  assert.equal(due.at(-1).date, "2026-08-01", "이번 달까지");
});

test("그보다 오래 안 열었으면 그 앞은 채우지 않는다", () => {
  /*
   * 일부러 그렇게 둔다. 두 해 만에 열었다고 스물넉 달치 월세가 한꺼번에 쌓이면
   * 그게 더 나쁘다. 채우지 않은 달은 반영 기록이 없으니 나중에도 저절로 생기지 않는다.
   */
  const due = collectDueOccurrences([{ id: "old", day: 1, startMonth: "2020-01" }], [], on(2026, 8, 15));
  assert.ok(due.every((occurrence) => occurrence.date >= "2025-08-01"), "창보다 앞선 달이 섞였다");
});

/* ── 등록하기 전 안내 ──────────────────────────────────────── */

test("없는 날짜를 안내하지 않는다", () => {
  /*
   * 적은 날을 그대로 되뇌던 때는 "2026년 2월 31일부터" 였다. 그런 날은 없다.
   * 실제로는 말일로 당겨져 2월 28일에 들어온다.
   */
  assert.equal(
    describeSchedule(31, on(2026, 2, 14)),
    "2026년 2월 28일부터 매월 자동으로 기록됩니다. 31일이 없는 달은 말일에 기록됩니다.",
  );
  // 30일도 2월에는 없다.
  assert.equal(
    describeSchedule(30, on(2026, 2, 14)),
    "2026년 2월 28일부터 매월 자동으로 기록됩니다. 30일이 없는 달은 말일에 기록됩니다.",
  );
  // 31일이 없는 달은 2월만이 아니다.
  assert.equal(
    describeSchedule(31, on(2026, 4, 9)),
    "2026년 4월 30일부터 매월 자동으로 기록됩니다. 31일이 없는 달은 말일에 기록됩니다.",
  );
});

test("당겨질 일이 없으면 군말을 붙이지 않는다", () => {
  // 28일까지는 어느 달에도 그대로 있다. 말일 이야기를 꺼낼 까닭이 없다.
  assert.equal(describeSchedule(5, on(2026, 2, 14)), "2026년 3월 5일부터 매월 자동으로 기록됩니다.");
  assert.equal(describeSchedule(28, on(2026, 2, 14)), "2026년 2월 28일부터 매월 자동으로 기록됩니다.");
});

test("윤년 2월에는 29일까지 있다", () => {
  // 2028년은 윤년이다. 28일로 당기면 하루를 잃는다.
  assert.equal(
    describeSchedule(31, on(2028, 2, 10)),
    "2028년 2월 29일부터 매월 자동으로 기록됩니다. 31일이 없는 달은 말일에 기록됩니다.",
  );
});

test("반영일이 지났으면 다음 달부터라고 안내한다", () => {
  // 등록하자마자 과거 지출이 생기지 않는다. 안내도 그 달을 가리켜야 한다.
  assert.equal(describeSchedule(5, on(2026, 8, 20)), "2026년 9월 5일부터 매월 자동으로 기록됩니다.");
});

test("날이 아니면 아무 말도 하지 않는다", () => {
  // 아직 안 적었거나 범위 밖이면 빈칸이다. 입력하는 사이에 붉은 글씨가 깜빡이지 않는다.
  for (const 값 of [0, 32, Number.NaN, -1, 1.5]) assert.equal(describeSchedule(값, on(2026, 2, 14)), "");
});

/* ── 창 밖으로 밀려난 달 ───────────────────────────────────── */

test("창보다 앞이라 못 채운 건수를 센다", () => {
  /*
   * 채우지 않은 달은 반영 기록이 안 남는데 창은 늘 이번 달을 따라 앞으로 밀린다.
   * 그래서 한 번 밀려난 달은 다음에 열어도 영영 돌아오지 않는다. 조용히 비면
   * 지난 달 합계가 왜 적은지 알 길이 없다.
   */
  const 오래된것 = { id: "old", day: 1, startMonth: "2025-01" };
  // 2026-08 기준 창은 2025-08 부터다. 2025-01 ~ 2025-07 일곱 달이 밀려났다.
  assert.equal(countSkippedMonths([오래된것], [], on(2026, 8, 15)), 7);
});

test("창 안에서 시작한 고정비는 밀려난 것이 없다", () => {
  const 최근것 = { id: "new", day: 1, startMonth: "2026-03" };
  assert.equal(countSkippedMonths([최근것], [], on(2026, 8, 15)), 0);
});

test("이미 반영한 달은 밀려난 것으로 세지 않는다", () => {
  // 예전에 앱을 열어 채워 둔 달이다. 비어 있지 않으니 알릴 것도 아니다.
  const 오래된것 = { id: "old", day: 1, startMonth: "2025-01" };
  const applied = ["old:2025-01", "old:2025-02", "old:2025-03"];
  assert.equal(countSkippedMonths([오래된것], applied, on(2026, 8, 15)), 4);
});

test("잘린 것이 있으면 채운 소식과 함께 알린다", () => {
  assert.equal(
    describeApplied({ created: 13, failed: 0, skipped: 7 }),
    "이번 달 고정비 13건을 넣었어요. 최근 13달보다 오래된 7건은 넣지 않았어요",
  );
  // 채운 것이 없으면 말하지 않는다. 열 때마다 같은 말을 들으면 잔소리가 된다.
  assert.equal(describeApplied({ created: 0, failed: 0, skipped: 7 }), null);
  // 실패만 있을 때도 마찬가지다. 지금 못 넣은 것과 예전에 잘린 것은 다른 이야기다.
  assert.equal(
    describeApplied({ created: 0, failed: 2, skipped: 7 }),
    "고정비 2건을 반영하지 못했어요. 잠시 뒤 다시 열어 주세요",
  );
  // skipped 를 안 넘겨도 예전처럼 돈다.
  assert.equal(describeApplied({ created: 3, failed: 0 }), "이번 달 고정비 3건을 넣었어요");
});
