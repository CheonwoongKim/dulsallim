import assert from "node:assert/strict";
import test from "node:test";

import { formatCompactMoney } from "../src/domain/calendar.js";
import { drawLegend, drawTrend, monthIndexAt } from "../src/ui/trend-chart.js";

/*
 * 좌표 계산은 여태 소스 문자열로만 봤다 — 어떤 식이 적혀 있나만 보고,
 * 그 식이 내놓는 값이 맞는지는 아무도 안 봤다. 여기서는 실제로 돌려서 잰다.
 *
 * 마크업의 모양에는 기대지 않는다. 속성 차례나 눈금 크기를 못 박으면 그림을 손보는
 * 정당한 변경마다 검사가 헛되이 운다 — 처음 짰을 때 그렇게 해서 리뷰에 걸렸다.
 * 태그를 속성 표로 풀어 두고, 눈금은 그림이 스스로 말한 viewBox 에서 꺼내 쓴다.
 */

/** `<text class="a" x="1">` 를 `{class:"a", x:"1"}` 로. 속성 차례에 기대지 않는다. */
function 태그들(svg, name) {
  return [...svg.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "g"))].map(([, 속성]) =>
    Object.fromEntries([...속성.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, 이름, 값]) => [이름, 값])),
  );
}

/** 그림이 스스로 말한 눈금. 숫자를 검사에 박아 두면 눈금을 못 바꾼다. */
function 눈금(svg) {
  const [, , width, height] = 태그들(svg, "svg")[0].viewBox.split(/\s+/).map(Number);
  return { width, height };
}

const 계열 = (덮어쓰기 = {}) => ({
  id: "a",
  name: "우리",
  color: "#f2674b",
  goal: 500000,
  points: Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? null : (i + 1) * 10000)),
  ...덮어쓰기,
});
const 그리기 = (덮어쓰기 = {}, scrub = 0) =>
  drawTrend({ currentIndex: 11, max: 500000, series: [계열(덮어쓰기)] }, scrub);

test("짚은 자리를 몇 월인지로 바꾼다", () => {
  assert.equal(monthIndexAt(0), 0);
  assert.equal(monthIndexAt(1), 11);
  // 손가락이 그림 밖으로 나가도 열두 달 안에 머문다. 안 그러면 없는 달을 짚는다.
  assert.equal(monthIndexAt(-5), 0);
  assert.equal(monthIndexAt(9), 11);
});

test("짚은 자리와 글자가 놓인 자리가 맞물린다", () => {
  /*
   * 여기가 이 파일에서 제일 중요한 줄이다.
   *
   * 짚어서 나온 달과 그 달 글자가 그려진 자리를 따로 재면 둘이 어긋나도 모른다.
   * 실제로 처음에는 "열두 달이 다 나오나" 만 봤는데, 눈금 간격을 절반으로 줄여
   * 화면 오른쪽 절반이 통째로 12월이 되게 만들어도 그대로 통과했다.
   * 글자가 놓인 자리를 도로 짚어 같은 달이 나와야 둘이 맞물린 것이다.
   */
  const svg = 그리기();
  const { width } = 눈금(svg);
  const 글자들 = 태그들(svg, "text").filter((t) => t["data-month-index"] !== undefined);
  assert.equal(글자들.length, 12, "열두 달이 다 있어야 한다");

  for (const 글자 of 글자들) {
    const 달 = Number(글자["data-month-index"]);
    assert.equal(monthIndexAt(Number(글자.x) / width), 달, `${달 + 1}월 글자를 짚으니 다른 달이 나온다`);
  }
});

test("가장 가까운 달이 잡힌다", () => {
  /*
   * 글자 바로 왼쪽을 짚어도 그 달이 잡혀야 한다. 반올림 대신 내림을 쓰면 경계가 한 칸씩
   * 밀려, 글자를 겨눠 짚었는데 앞 달이 잡힌다 — 왕복 검사만으로는 그 잘못이 안 보인다.
   * 글자가 눈금에 딱 떨어져 앉아 있어서, 딱 그 자리만 재면 어느 쪽으로 굴려도 맞는다.
   */
  const svg = 그리기();
  const { width } = 눈금(svg);
  const 글자들 = 태그들(svg, "text").filter((t) => t["data-month-index"] !== undefined);
  const 한칸 = Number(글자들[1].x) - Number(글자들[0].x);

  for (const 글자 of 글자들.slice(1, -1)) {
    const 달 = Number(글자["data-month-index"]);
    const 자리 = Number(글자.x);
    assert.equal(monthIndexAt((자리 - 한칸 * 0.4) / width), 달, `${달 + 1}월 글자 왼쪽을 짚었는데 다른 달`);
    assert.equal(monthIndexAt((자리 + 한칸 * 0.4) / width), 달, `${달 + 1}월 글자 오른쪽을 짚었는데 다른 달`);
  }
});

test("좌우 여백이 같다", () => {
  /*
   * 왼쪽만 휑하면 그림이 가운데에 있지 않은 것처럼 보인다. 소스도 그렇게 적어 두었다.
   * 첫 달 글자에서 왼쪽 끝까지와, 마지막 달 글자에서 오른쪽 끝까지가 같아야 한다.
   */
  const svg = 그리기();
  const { width } = 눈금(svg);
  const 글자들 = 태그들(svg, "text").filter((t) => t["data-month-index"] !== undefined);
  const 왼쪽여백 = Number(글자들[0].x);
  const 오른쪽여백 = width - Number(글자들.at(-1).x);
  assert.equal(왼쪽여백, 오른쪽여백, `왼쪽 ${왼쪽여백}, 오른쪽 ${오른쪽여백}`);
  assert.ok(왼쪽여백 > 0, "글자가 눈금 끝에 붙었다");
});

test("짚은 자리가 오른쪽으로 갈수록 달도 앞으로만 간다", () => {
  // 되돌아가는 구간이 있으면 끄는 동안 달이 튄다.
  let 앞 = -1;
  for (let step = 0; step <= 100; step += 1) {
    const 지금 = monthIndexAt(step / 100);
    assert.ok(지금 >= 앞, `${step}% 에서 ${앞} → ${지금} 로 되돌아갔다`);
    앞 = 지금;
  }
});

test("열두 달을 다 적고, 짚은 달만 굵게 한다", () => {
  const 글자들 = 태그들(그리기({}, 7), "text").filter((t) => t["data-month-index"] !== undefined);
  assert.deepEqual(글자들.map((t) => t["data-month-index"]), ["0","1","2","3","4","5","6","7","8","9","10","11"]);
  // 적히는 숫자는 사람이 세는 1~12 다.
  assert.deepEqual(글자들.map((t) => t.x !== undefined), Array(12).fill(true));

  // 굵어지는 것은 짚은 달 하나뿐이다. 클래스 차례에는 기대지 않는다.
  const 굵은것 = 글자들.filter((t) => t.class.split(/\s+/).includes("is-active"));
  assert.equal(굵은것.length, 1);
  assert.equal(굵은것[0]["data-month-index"], "7");
});

test("그림이 제 눈금 안에 머문다", () => {
  /*
   * 가로와 세로를 따로 잰다. 둘 다 가로 폭으로 재면 세로가 두 배로 늘어나 그림 밖으로
   * 나가도 통과한다 — 처음에 그렇게 짰다.
   */
  const svg = 그리기();
  const { width, height } = 눈금(svg);
  const 가로 = /^(x|x1|x2|cx)$/;
  const 세로 = /^(y|y1|y2|cy)$/;

  for (const 태그 of ["line", "text", "circle", "polyline", "path"]) {
    for (const 속성 of 태그들(svg, 태그)) {
      for (const [이름, 값] of Object.entries(속성)) {
        if (가로.test(이름)) assert.ok(Number(값) >= 0 && Number(값) <= width, `${이름}=${값} 이 가로 눈금 밖`);
        if (세로.test(이름)) assert.ok(Number(값) >= 0 && Number(값) <= height, `${이름}=${값} 이 세로 눈금 밖`);
      }
    }
  }
  // 이어 그리는 점들도 눈금 안이어야 한다.
  for (const 선 of 태그들(svg, "polyline")) {
    for (const 쌍 of (선.points || "").trim().split(/\s+/).filter(Boolean)) {
      const [가로값, 세로값] = 쌍.split(",").map(Number);
      assert.ok(가로값 >= 0 && 가로값 <= width, `점 x=${가로값} 이 눈금 밖`);
      assert.ok(세로값 >= 0 && 세로값 <= height, `점 y=${세로값} 이 눈금 밖`);
    }
  }
});

test("눈금을 넘는 목표선은 아예 안 그린다", () => {
  /*
   * 목표가 그 해 최댓값보다 크면 선이 그림 위로 삐져나간다. 잘린 선을 보여 주느니
   * 안 그리는 편이 낫다 — 잘린 선은 "목표가 저기쯤" 이라고 거짓말을 한다.
   */
  const 넘는것 = drawTrend({ currentIndex: 11, max: 100000, series: [계열({ goal: 9000000 })] }, 0);
  assert.equal(태그들(넘는것, "line").filter((l) => l.class === "trend-goal").length, 0);
  // 눈금 안이면 그린다.
  const 안쪽것 = drawTrend({ currentIndex: 11, max: 500000, series: [계열({ goal: 300000 })] }, 0);
  assert.equal(태그들(안쪽것, "line").filter((l) => l.class === "trend-goal").length, 1);
});

test("값이 없는 달에서는 선을 끊는다", () => {
  /*
   * 비어 있는 달을 0 으로 이으면 "그 달엔 안 썼다" 로 읽힌다. 실제로는 "모른다" 다.
   */
  const 다빈것 = drawTrend({ currentIndex: -1, max: 1, series: [계열({ points: Array(12).fill(null) })] }, 0);
  assert.equal(태그들(다빈것, "polyline").length, 0, "빈 계열에 선을 그었다");

  // 1·4·7·10 월이 비었으니 이어지는 토막은 넷이다.
  assert.equal(태그들(그리기(), "polyline").length, 4);
});

test("범례가 이름을 그대로 넣지 않는다", () => {
  // 이름은 사람이 마이페이지에서 적는 값이다. 서버가 글자를 막지 않는다.
  const 범례 = drawLegend([계열({ name: `<img src=x onerror="alert(1)"><b>` })]);
  assert.doesNotMatch(범례, /<img|<b>/, "태그가 살아서 들어갔다");
  assert.match(범례, /&lt;img/);
});

test("목표를 안 정했으면 금액을 적지 않는다", () => {
  /*
   * 목표선이 없는데 범례에 금액을 적으면 그림에 없는 것을 설명하게 된다.
   * 문구 자체가 아니라 금액이 있느냐 없느냐로 본다 — 문구는 다듬을 수 있어야 한다.
   */
  const 금액 = formatCompactMoney(500000);
  assert.match(drawLegend([계열({ goal: 500000 })]), new RegExp(금액));
  assert.doesNotMatch(drawLegend([계열({ goal: null })]), new RegExp(금액));
  // 0 은 정한 것이 아니다. 안 정한 것과 똑같이 나와야 한다 (문구가 무엇이든).
  assert.equal(drawLegend([계열({ goal: 0 })]), drawLegend([계열({ goal: null })]));
});
