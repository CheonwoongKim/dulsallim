import assert from "node:assert/strict";
import test from "node:test";

import { availableYears, axisTop, buildYearSeries } from "../src/domain/trend.js";

const 천웅 = { id: "a", name: "천웅", color: "#20211e", goal: 1800000 };
const 주연 = { id: "b", name: "주연", color: "#f2674b", goal: 1600000 };
const 둘 = [천웅, 주연];
const 지출 = (date, member, amount) => ({ id: date + member, date, member, amount, category: "food", item: "x" });
const 오늘 = new Date(2026, 7, 3); // 2026-08-03

test("한 해는 언제나 열두 달이다", () => {
  const { months } = buildYearSeries([], 둘, 2026, 오늘);
  assert.equal(months.length, 12);
  assert.equal(months[0], "2026-01");
  assert.equal(months[11], "2026-12");
});

test("아직 오지 않은 달은 0이 아니라 비워 둔다", () => {
  // 0으로 찍으면 "연말에 한 푼도 안 썼다"는 거짓말이 된다.
  const { series } = buildYearSeries([지출("2026-08-01", "a", 10000)], 둘, 2026, 오늘);
  const 천웅선 = series.find((s) => s.id === "a").points;
  assert.equal(천웅선[7], 10000, "8월은 값이 있어야 한다");
  for (const i of [8, 9, 10, 11]) assert.equal(천웅선[i], null, `${i + 1}월은 비어야 한다`);
});

test("기록을 시작하기 전의 달도 비워 둔다", () => {
  const { series, recorded } = buildYearSeries([지출("2026-08-01", "a", 10000)], 둘, 2026, 오늘);
  assert.deepEqual(recorded.slice(0, 7), Array(7).fill(false));
  assert.equal(series[0].points[0], null);
});

test("가구에 기록이 있는 달이면 안 쓴 사람은 0으로 그린다", () => {
  // 이건 "기록이 없다"가 아니라 "그 달에 안 썼다"라는 사실이다.
  const { series } = buildYearSeries([지출("2026-03-02", "a", 50000)], 둘, 2026, 오늘);
  assert.equal(series.find((s) => s.id === "a").points[2], 50000);
  assert.equal(series.find((s) => s.id === "b").points[2], 0);
});

test("진행 중인 달이 몇 번째인지 알려 준다", () => {
  assert.equal(buildYearSeries([], 둘, 2026, 오늘).currentIndex, 7);
  assert.equal(buildYearSeries([], 둘, 2025, 오늘).currentIndex, -1, "지난 해에는 없다");
});

test("다른 해 지출은 섞이지 않는다", () => {
  const rows = [지출("2025-08-01", "a", 999999), 지출("2026-08-01", "a", 10000)];
  assert.equal(buildYearSeries(rows, 둘, 2026, 오늘).series[0].points[7], 10000);
});

test("세로 축은 목표에 자리를 잡는다 — 목표의 1.5배를 100만 단위로 반올림", () => {
  // 지출에 자를 맞추면, 목표를 잘 지킨 달일수록 목표선이 천장에 붙는다. 거꾸로다.
  // 목표에 자를 걸면 자가 거의 안 바뀌어 해를 넘겨도 모양을 견줄 수 있다.
  assert.equal(axisTop(1800000, 0), 3000000, "180만 × 1.5 = 270만 → 300만");
  assert.equal(axisTop(1000000, 0), 2000000);
  assert.equal(axisTop(2500000, 0), 4000000);
});

test("넘칠 때는 반올림이 아니라 올림으로 늘린다", () => {
  // 305만을 100만 단위로 반올림하면 300만이 되어 선이 천장 밖으로 잘린다.
  assert.equal(axisTop(1800000, 3050000), 4000000, "잘리면 안 된다");
  assert.equal(axisTop(1800000, 2900000), 3000000, "기준 안에 들면 그대로 둔다");
});

test("목표가 아주 작거나 없어도 축은 무너지지 않는다", () => {
  // 30만 × 1.5 = 45만을 100만 단위로 반올림하면 0이 된다.
  assert.equal(axisTop(300000, 0), 1000000, "최소 100만은 깔아 둔다");
  assert.equal(axisTop(0, 0), 1000000, "목표를 안 정했어도 그린다");
  assert.equal(axisTop(0, 2400000), 3000000, "목표가 없으면 지출만 보고 늘린다");
});

test("축은 그 해 지출로만 늘어난다", () => {
  // 옛날 폭탄 한 달 때문에 이후 몇 해가 계속 납작해 보이면 안 된다.
  const rows = [지출("2025-03-01", "a", 9000000), 지출("2026-08-01", "a", 100000)];
  assert.equal(buildYearSeries(rows, [천웅], 2026, 오늘).max, 3000000, "2025년 폭탄은 2026년 자에 영향 없다");
  assert.equal(buildYearSeries(rows, [천웅], 2025, 오늘).max, 9000000, "그 해에는 담아야 한다");
});

test("목표선이 축 밖으로 나가지 않는다", () => {
  const data = buildYearSeries([지출("2026-08-01", "a", 10000)], 둘, 2026, 오늘);
  for (const line of data.series) assert.ok(line.goal <= data.max, `${line.name} 목표가 잘린다`);
});

test("고를 수 있는 해는 첫 기록부터 올해까지다", () => {
  const rows = [지출("2024-05-01", "a", 1000), 지출("2026-08-01", "a", 1000)];
  assert.deepEqual(availableYears(rows, 오늘), [2024, 2025, 2026]);
  assert.deepEqual(availableYears([], 오늘), [2026], "기록이 없으면 올해만");
});

test("진행 중인 달로 들어가는 구간은 점선이다", async () => {
  // 3일까지 쓴 금액을 한 달치 옆에 실선으로 이으면 "이번 달 안 썼다"로 읽힌다.
  const { drawTrend } = await import("../src/ui/trend-chart.js");
  const data = buildYearSeries(
    [지출("2026-07-05", "a", 1600000), 지출("2026-08-01", "a", 180000)],
    [천웅],
    2026,
    오늘,
  );
  const svg = drawTrend(data);
  assert.match(svg, /class="trend-line is-provisional"/, "마지막 구간이 점선이어야 한다");
  assert.match(svg, /class="trend-dot is-provisional"/, "그 달 점도 구분되어야 한다");
});

test("지난 해에는 점선 구간이 없다", () => {
  const data = buildYearSeries([지출("2025-07-05", "a", 100)], [천웅], 2025, 오늘);
  assert.equal(data.currentIndex, -1);
});
