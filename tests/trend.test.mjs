import assert from "node:assert/strict";
import test from "node:test";

import { availableYears, buildYearSeries, niceCeiling } from "../src/trend.js";

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

test("세로 축은 목표와 지출 중 큰 쪽을 덮는다", () => {
  // 목표선이 그래프 밖으로 나가면 넘겼는지 지켰는지 볼 수가 없다.
  const 적게 = buildYearSeries([지출("2026-08-01", "a", 10000)], 둘, 2026, 오늘);
  assert.ok(적게.max >= 1800000, "지출이 적어도 목표선은 보여야 한다");

  const 많이 = buildYearSeries([지출("2026-08-01", "a", 5000000)], 둘, 2026, 오늘);
  assert.ok(많이.max >= 5000000, "목표를 넘긴 달도 잘리면 안 된다");
});

test("세로 축 꼭대기는 눈금이 떨어지는 값이고 절반도 떨어진다", () => {
  for (const value of [1, 12345, 187000, 1234567, 9800000]) {
    const top = niceCeiling(value);
    assert.ok(top >= value, `${value} 보다 커야 한다`);
    assert.ok(Number.isInteger(top / 2), "가운데 눈금을 그리려면 절반이 떨어져야 한다");
  }
  assert.ok(niceCeiling(0) > 0, "기록이 없어도 축은 있어야 한다");
});

test("세로 축이 지나치게 헐렁하지 않다", () => {
  // 2 다음이 바로 4면 210만 쓴 해의 축이 400만이 되어 위쪽 절반이 빈다.
  for (const value of [2100000, 1300000, 620000, 4400000]) {
    const top = niceCeiling(value);
    assert.ok(value / top >= 0.7, `${value} → ${top} 은 너무 헐렁하다 (${Math.round((value / top) * 100)}%)`);
  }
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
