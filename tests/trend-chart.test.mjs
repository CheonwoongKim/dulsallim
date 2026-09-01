import assert from "node:assert/strict";
import test from "node:test";

import { drawLegend, drawTrend, monthIndexAt } from "../src/ui/trend-chart.js";

/*
 * 좌표 계산은 여태 소스 문자열로만 봤다 — 어떤 식이 적혀 있나만 보고,
 * 그 식이 내놓는 값이 맞는지는 아무도 안 봤다. 여기서는 실제로 돌려서 잰다.
 */

const 계열 = (덮어쓰기 = {}) => ({
  id: "a",
  name: "우리",
  color: "#f2674b",
  goal: 500000,
  points: Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? null : (i + 1) * 10000)),
  ...덮어쓰기,
});

test("짚은 자리를 몇 월인지로 바꾼다", () => {
  // 왼쪽 끝은 1월, 오른쪽 끝은 12월.
  assert.equal(monthIndexAt(0), 0);
  assert.equal(monthIndexAt(1), 11);
  // 손가락이 그림 밖으로 나가도 열두 달 안에 머문다. 안 그러면 없는 달을 짚는다.
  assert.equal(monthIndexAt(-5), 0);
  assert.equal(monthIndexAt(9), 11);
});

test("짚은 자리가 오른쪽으로 갈수록 달도 앞으로만 간다", () => {
  // 되돌아가는 구간이 있으면 끄는 동안 달이 튄다.
  let 앞 = -1;
  for (let step = 0; step <= 100; step += 1) {
    const 지금 = monthIndexAt(step / 100);
    assert.ok(지금 >= 앞, `${step}% 에서 ${앞} → ${지금} 로 되돌아갔다`);
    앞 = 지금;
  }
  // 열두 달이 모두 한 번씩은 잡혀야 짚어서 못 고르는 달이 없다.
  const 닿은달 = new Set(Array.from({ length: 1001 }, (_, i) => monthIndexAt(i / 1000)));
  assert.equal(닿은달.size, 12, `${[...닿은달].length} 개 달만 고를 수 있다`);
});

test("열두 달을 다 적고, 짚은 달만 굵게 한다", () => {
  const svg = drawTrend({ currentIndex: 5, max: 500000, series: [계열()] }, 7);
  const 달들 = [...svg.matchAll(/data-month-index="(\d+)"[^>]*>(\d+)</g)];
  assert.equal(달들.length, 12, "열두 달이 다 있어야 한다");
  assert.deepEqual(달들.map((m) => m[2]), ["1","2","3","4","5","6","7","8","9","10","11","12"]);
  // 굵어지는 것은 짚은 달 하나뿐이다.
  const 굵은것 = [...svg.matchAll(/trend-axis is-active"[^>]*data-month-index="(\d+)"/g)];
  assert.equal(굵은것.length, 1);
  assert.equal(굵은것[0][1], "7");
});

test("그림이 좌표계 안에 머문다", () => {
  const svg = drawTrend({ currentIndex: 11, max: 500000, series: [계열()] }, 0);
  assert.match(svg, /viewBox="0 0 320 180"/);
  // 좌표가 눈금 밖으로 나가면 선이 잘리거나 그림이 통째로 어긋난다.
  for (const [, 값] of svg.matchAll(/(?:x|y|x1|y1|x2|y2|cx|cy)="(-?[\d.]+)"/g)) {
    const n = Number(값);
    assert.ok(n >= -1 && n <= 320, `좌표 ${n} 이 눈금 밖이다`);
  }
});

test("값이 없는 달에서는 선을 끊는다", () => {
  /*
   * 비어 있는 달을 0 으로 이으면 "그 달엔 안 썼다" 로 읽힌다. 실제로는 "모른다" 다.
   * 점이 하나도 없는 계열은 선 자체가 없어야 한다.
   */
  const 다빈것 = drawTrend({ currentIndex: -1, max: 1, series: [계열({ points: Array(12).fill(null) })] }, 0);
  assert.doesNotMatch(다빈것, /class="trend-line/, "빈 계열에 선을 그었다");

  // 중간이 비면 조각으로 나뉜다. 1·4·7·10 월이 비었으니 이어지는 토막은 넷이다.
  const 띄엄띄엄 = drawTrend({ currentIndex: 11, max: 500000, series: [계열()] }, 0);
  assert.equal([...띄엄띄엄.matchAll(/class="trend-line/g)].length, 4);
});

test("범례가 이름을 그대로 넣지 않는다", () => {
  // 이름은 사람이 마이페이지에서 적는 값이다. 서버가 글자를 막지 않는다.
  const 범례 = drawLegend([계열({ name: `<img src=x onerror="alert(1)">` })]);
  assert.doesNotMatch(범례, /<img/, "태그가 살아서 들어갔다");
  assert.match(범례, /&lt;img/);
});

test("목표를 안 정했으면 그렇다고 적는다", () => {
  // 목표선이 없는데 범례에 금액을 적으면 그림에 없는 것을 설명하게 된다.
  assert.match(drawLegend([계열({ goal: null })]), /목표 없음/);
  assert.match(drawLegend([계열({ goal: 0 })]), /목표 없음/, "0 은 정한 것이 아니다");
  const 있음 = drawLegend([계열({ goal: 500000 })]);
  assert.match(있음, /목표 /);
  assert.doesNotMatch(있음, /목표 없음/);
});
