import assert from "node:assert/strict";
import test from "node:test";

import {
  comparableDay,
  compareCategories,
  compareMonth,
  sumByCategory,
  sumMonth,
  untilDay,
} from "../src/domain/analysis.js";

const 천 = "11111111-1111-1111-1111-111111111111";
const mk = (date, amount, category = "food") => ({ id: date + amount, date, amount, category, member: 천 });

test("진행 중인 달은 같은 날짜까지만 견준다", () => {
  // 3일치를 31일치와 비교하면 90% 줄었다고 나온다.
  const 오늘 = new Date(2026, 7, 3);
  assert.equal(comparableDay("2026-08", 오늘), 3, "이번 달은 오늘까지만");
  assert.equal(comparableDay("2026-07", 오늘), null, "끝난 달은 통째로");
  assert.equal(comparableDay("2026-09", 오늘), null, "다음 달도 통째로");
});

test("sumMonth는 자른 날짜 뒤를 세지 않는다", () => {
  const 지출 = [mk("2026-07-01", 1000), mk("2026-07-03", 2000), mk("2026-07-25", 90000)];
  assert.equal(sumMonth(지출, "2026-07"), 93000, "통째로");
  assert.equal(sumMonth(지출, "2026-07", 3), 3000, "3일까지만");
  assert.equal(sumMonth(지출, "2026-08"), 0, "다른 달은 안 센다");
});

test("이번 달 비교는 지난달도 같은 날짜까지만 본다", () => {
  const 오늘 = new Date(2026, 7, 3);
  const 지출 = [
    mk("2026-08-01", 127000),
    mk("2026-07-02", 214000),
    mk("2026-07-25", 900000), // 3일 이후 — 비교에 들어오면 안 된다
  ];
  const 결과 = compareMonth(지출, "2026-08", 오늘);
  assert.equal(결과.total, 127000);
  assert.equal(결과.maxDay, 3, "몇 일까지 봤는지 화면이 밝힐 수 있어야 한다");
  assert.equal(결과.previous.total, 214000, "7월 25일 건이 섞이면 안 된다");
  assert.equal(결과.previous.diff, -87000);
  assert.equal(결과.previous.percent, -41);
});

test("끝난 달끼리는 통째로 견준다", () => {
  const 오늘 = new Date(2026, 7, 3);
  const 지출 = [mk("2026-07-25", 300000), mk("2026-06-10", 200000)];
  const 결과 = compareMonth(지출, "2026-07", 오늘);
  assert.equal(결과.maxDay, null);
  assert.equal(결과.total, 300000);
  assert.equal(결과.previous.diff, 100000);
  assert.equal(결과.previous.percent, 50);
});

test("견줄 기록이 없으면 숫자를 만들지 않는다", () => {
  // 0원 대비 증감은 -100%처럼 그럴듯한 거짓말이 된다.
  const 결과 = compareMonth([mk("2026-08-01", 5000)], "2026-08", new Date(2026, 7, 3));
  assert.equal(결과.previous, null, "7월 기록이 없다");
  assert.equal(결과.lastYear, null, "작년 8월 기록이 없다");
});

test("전년 동월은 12개월 전을 본다", () => {
  const 지출 = [mk("2026-08-01", 100000), mk("2025-08-15", 80000)];
  const 결과 = compareMonth(지출, "2026-08", new Date(2026, 7, 31));
  assert.equal(결과.lastYear.month, "2025-08");
  assert.equal(결과.lastYear.diff, 20000);
  assert.equal(결과.lastYear.percent, 25);
});

test("연초에도 이전 달을 정확히 찾는다", () => {
  const 지출 = [mk("2026-01-10", 50000), mk("2025-12-10", 40000)];
  const 결과 = compareMonth(지출, "2026-01", new Date(2026, 5, 1));
  assert.equal(결과.previous.month, "2025-12");
  assert.equal(결과.previous.diff, 10000);
});

test("상대가 0원이면 몇 %인지 말하지 않는다", () => {
  // 기록은 있는데 그 날짜까지의 합이 0인 경우
  const 지출 = [mk("2026-08-01", 5000), mk("2026-07-25", 90000)];
  const 결과 = compareMonth(지출, "2026-08", new Date(2026, 7, 3));
  assert.equal(결과.previous.total, 0);
  assert.equal(결과.previous.percent, null, "0으로 나눌 수 없다");
  assert.equal(결과.previous.diff, 5000, "금액 차이는 말할 수 있다");
});

test("분류별은 많이 쓴 순으로, 안 쓴 분류는 빼고 준다", () => {
  const 결과 = sumByCategory([
    mk("2026-08-01", 45000, "cafe"),
    mk("2026-08-02", 210000, "food"),
    mk("2026-08-03", 78000, "pet"),
    mk("2026-08-04", 10000, "food"),
  ]);
  assert.deepEqual(결과.map((c) => c.key), ["food", "pet", "cafe"]);
  assert.deepEqual(결과.map((c) => c.label), ["식비", "반려견", "카페"]);
  assert.equal(결과[0].total, 220000);
  assert.equal(결과.length, 3, "쓰지 않은 분류는 줄이 없어야 한다");
});

test("분류 비중은 합이 100%에 가깝다", () => {
  const 결과 = sumByCategory([
    mk("2026-08-01", 60000, "food"),
    mk("2026-08-02", 40000, "cafe"),
  ]);
  assert.equal(결과.reduce((sum, c) => sum + c.percent, 0), 100);
});

test("빈 달은 빈 목록을 준다", () => {
  assert.deepEqual(sumByCategory([]), []);
});

test("분류마다 서로 다른 색이 있다", async () => {
  // 같은 색이 둘이면 막대를 나눠 놓은 뜻이 없다.
  const { CATEGORIES } = await import("../src/domain/expenses.js");
  const colors = Object.values(CATEGORIES).map((c) => c.color);
  assert.equal(colors.filter(Boolean).length, colors.length, "색이 빠진 분류가 있다");
  assert.equal(new Set(colors).size, colors.length, `겹치는 색: ${colors.join(", ")}`);
  for (const color of colors) assert.match(color, /^#[0-9a-f]{6}$/);
});

test("분류별 결과에 색이 함께 온다", () => {
  const [first] = sumByCategory([mk("2026-08-01", 1000, "pet")]);
  assert.equal(first.color, "#c2883f");
  // 모르는 분류는 기타 색으로 받는다. 화면이 색 없이 그려지면 안 된다.
  const [unknown] = sumByCategory([mk("2026-08-01", 1000, "없는분류")]);
  assert.equal(unknown.color, "#9a958c");
});

test("untilDay는 그 날짜까지만 남긴다", () => {
  const 지출 = [mk("2026-08-01", 1000), mk("2026-08-03", 2000), mk("2026-08-25", 9000)];
  assert.equal(untilDay(지출, 3).length, 2);
  assert.equal(untilDay(지출, null).length, 3, "null이면 자르지 않는다");
});

test("분류를 다 더하면 머리의 큰 숫자와 같다", () => {
  // 범위가 어긋나면 사용자가 더해 보고 다른 숫자를 얻는다.
  const 오늘 = new Date(2026, 7, 3);
  const 지출 = [
    mk("2026-08-01", 100000, "food"),
    mk("2026-08-03", 27000, "cafe"),
    mk("2026-08-25", 500000, "housing"), // 오늘 이후 — 양쪽 모두에서 빠져야 한다
  ];
  const 머리 = compareMonth(지출, "2026-08", 오늘);
  const 분류 = sumByCategory(untilDay(지출, 머리.maxDay));
  assert.equal(분류.reduce((sum, c) => sum + c.total, 0), 머리.total);
  assert.equal(분류.length, 2, "오늘 이후 분류는 줄도 생기면 안 된다");
});

test("compareCategories는 두 달을 나란히 놓는다", () => {
  const 이번 = sumByCategory([mk("2026-08-01", 300000, "food"), mk("2026-08-02", 45000, "cafe")]);
  const 지난 = sumByCategory([mk("2026-07-01", 220000, "food"), mk("2026-07-02", 120000, "transport")]);
  const 결과 = compareCategories(이번, 지난);

  assert.deepEqual(결과.map((r) => r.key), ["food", "transport", "cafe"], "두 달 중 큰 금액 순");
  assert.deepEqual(결과.find((r) => r.key === "food"), {
    key: "food", label: "식비", color: "#e0704f", total: 300000, otherTotal: 220000, diff: 80000,
  });
});

test("이번 달에 없어진 분류도 줄을 만든다", () => {
  // 쓰던 걸 안 쓰게 된 것도 변화다. 빠지면 그 사실이 화면에서 사라진다.
  const 결과 = compareCategories(
    sumByCategory([mk("2026-08-01", 10000, "food")]),
    sumByCategory([mk("2026-07-01", 500000, "housing")]),
  );
  const 사라진 = 결과.find((r) => r.key === "housing");
  assert.ok(사라진, "지난달에만 있던 분류가 빠졌다");
  assert.equal(사라진.total, 0);
  assert.equal(사라진.diff, -500000);
  assert.equal(결과[0].key, "housing", "가장 큰 변화가 맨 위로 와야 한다");
});

test("비교 달이 비어 있으면 이번 달만 남는다", () => {
  const 결과 = compareCategories(sumByCategory([mk("2026-08-01", 10000, "pet")]), []);
  assert.equal(결과.length, 1);
  assert.equal(결과[0].diff, 10000);
});
