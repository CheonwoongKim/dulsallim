import assert from "node:assert/strict";
import test from "node:test";

import { monthElapsed, monthsSince, savedInMonth, wishProgress } from "../src/wish-progress.js";

/**
 * 진척은 아낀 돈으로 센다 — 월 지출 목표에서 그 달 실제 지출을 뺀 것.
 *
 * 이 계산이 틀리면 화면의 숫자가 조용히 거짓말을 한다. 여기가 가장 촘촘해야 한다.
 */

const 천웅 = "11111111-1111-1111-1111-111111111111";
const 주연 = "22222222-2222-2222-2222-222222222222";
const 사람들 = [
  { id: 천웅, name: "천웅", color: "#20211e", goal: 1000000 },
  { id: 주연, name: "주연", color: "#f2674b", goal: 800000 },
];
const 지출 = (member, date, amount) => ({ id: `${member}-${date}-${amount}`, member, date, amount });
const 오늘 = new Date("2026-08-06T00:00:00Z");
/* 8월은 31일, 오늘은 6일. 이번 달은 목표의 6/31 만 지나갔다. */
const 팔월몫 = (goal) => Math.round(goal * (6 / 31));

test("담은 달부터 이번 달까지 센다", () => {
  assert.deepEqual(monthsSince("2026-08-06T03:03:34Z", 오늘), ["2026-08"]);
  assert.deepEqual(monthsSince("2026-06-01T00:00:00Z", 오늘), ["2026-06", "2026-07", "2026-08"]);
  // 해를 넘어도 이어진다.
  assert.deepEqual(monthsSince("2025-11-20T00:00:00Z", 오늘).slice(0, 4), [
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  // 앞으로 담긴 것(시계가 어긋난 기기)은 셀 달이 없다.
  assert.deepEqual(monthsSince("2026-09-01T00:00:00Z", 오늘), []);
  assert.deepEqual(monthsSince(null, 오늘), []);
});

test("이번 달은 지나간 날만큼만 목표를 뗀다", () => {
  /*
   * 목표 전체를 이미 아낀 것으로 치면 1일에 한 달치를 통째로 모은 셈이 된다 —
   * 실제로 8월 6일에 292만원을 모았다고 나왔다.
   */
  assert.equal(monthElapsed("2026-07", 오늘), 1, "끝난 달은 통째로");
  assert.equal(monthElapsed("2026-09", 오늘), 0, "아직 안 온 달은 없다");
  // 8월은 31일. 6일까지 지났으니 6/31.
  assert.equal(monthElapsed("2026-08", 오늘), 6 / 31);

  // 300만 목표, 6일까지 7만 8781원 씀 → 300만 × 6/31 − 78,781
  assert.equal(
    savedInMonth([지출(천웅, "2026-08-04", 78781)], "2026-08", 천웅, 3000000, 오늘),
    Math.round(3000000 * (6 / 31) - 78781),
  );
});

test("아낀 돈은 목표에서 그 달 지출을 뺀 것이고, 넘긴 달은 0이다", () => {
  const 지출들 = [
    지출(천웅, "2026-08-01", 300000),
    지출(천웅, "2026-08-02", 200000),
    지출(주연, "2026-08-02", 900000),
    // 다른 달 것은 섞이지 않아야 한다.
    지출(천웅, "2026-07-31", 999999),
  ];
  // 8월은 이번 달이라 6/31 만큼만 센다: 100만 × 6/31 = 193,548 → 50만을 이미 썼으니 0.
  assert.equal(savedInMonth(지출들, "2026-08", 천웅, 1000000, 오늘), 0);
  // 주연은 80만 목표에 90만을 썼다 — 마이너스가 아니라 0이다.
  assert.equal(savedInMonth(지출들, "2026-08", 주연, 800000, 오늘), 0);
  // 목표를 안 정했으면 셀 수가 없다.
  assert.equal(savedInMonth(지출들, "2026-08", 천웅, null, 오늘), 0);
  assert.equal(savedInMonth(지출들, "2026-08", 천웅, 0, 오늘), 0);
  // 끝난 달에 안 썼으면 목표가 통째로 남는다.
  assert.equal(savedInMonth(지출들, "2026-06", 천웅, 1000000, 오늘), 1000000);
});

test("혼자 담은 것은 담은 사람 몫만 쌓인다", () => {
  const wish = {
    createdBy: 천웅,
    createdAt: "2026-07-01T00:00:00Z",
    estimatedPrice: 1800000,
    agreementUserIds: [천웅],
  };
  /*
   * 7월(끝난 달): 100만 − 40만 = 60만 아낌.
   * 8월(이번 달): 지나간 몫 19만여 원인데 30만을 썼다 — 넘겼으니 0.
   */
  const 지출들 = [지출(천웅, "2026-07-10", 400000), 지출(천웅, "2026-08-03", 300000), 지출(주연, "2026-08-03", 100000)];
  const 진척 = wishProgress(wish, { expenses: 지출들, members: 사람들, today: 오늘 });

  assert.equal(진척.saved, 600000, "주연 몫이 섞였거나 이번 달을 통째로 셌다");
  assert.deepEqual(진척.contributors, [천웅]);
  assert.equal(진척.target, 1800000);
  assert.equal(Math.round(진척.ratio * 100), 33);
  assert.equal(진척.missingGoal, false);
});

test("상대가 나도 하면 담은 달까지 거슬러 둘 몫이 함께 쌓인다", () => {
  const 지출들 = [지출(천웅, "2026-07-10", 400000), 지출(주연, "2026-07-10", 300000)];
  const 혼자 = {
    createdBy: 천웅,
    createdAt: "2026-07-01T00:00:00Z",
    estimatedPrice: 4000000,
    agreementUserIds: [천웅],
  };
  const 같이 = { ...혼자, agreementUserIds: [천웅, 주연] };

  const a = wishProgress(혼자, { expenses: 지출들, members: 사람들, today: 오늘 });
  const b = wishProgress(같이, { expenses: 지출들, members: 사람들, today: 오늘 });

  // 천웅: 7월 60만 + 8월 지나간 몫
  assert.equal(a.saved, 600000 + 팔월몫(1000000));
  // 주연 몫이 통째로 더해진다 — 7월 50만 + 8월 지나간 몫.
  assert.equal(
    b.saved,
    600000 + 팔월몫(1000000) + 500000 + 팔월몫(800000),
    "같이 하기로 하면 진척이 뛰어야 한다",
  );
  assert.ok(b.saved > a.saved);
  assert.deepEqual(b.contributors, [천웅, 주연]);
});

test("목표를 안 정한 사람이 끼면 그 까닭을 알린다", () => {
  const 목표없음 = [사람들[0], { ...사람들[1], goal: null }];
  const wish = {
    createdBy: 천웅,
    createdAt: "2026-08-01T00:00:00Z",
    estimatedPrice: 1000000,
    agreementUserIds: [천웅, 주연],
  };
  const 진척 = wishProgress(wish, { expenses: [], members: 목표없음, today: 오늘 });

  assert.equal(진척.missingGoal, true);
  // 그래도 아는 만큼은 센다 — 천웅의 이번 달 지나간 몫.
  assert.equal(진척.saved, 팔월몫(1000000));
});

test("값을 안 적은 위시는 막대가 없다", () => {
  const wish = {
    createdBy: 천웅,
    createdAt: "2026-08-01T00:00:00Z",
    estimatedPrice: null,
    agreementUserIds: [천웅],
  };
  const 진척 = wishProgress(wish, { expenses: [], members: 사람들, today: 오늘 });
  assert.equal(진척.target, 0);
  assert.equal(진척.ratio, 0, "나눌 것이 없으면 0 이다");
});

test("넘겨 모았어도 막대는 가득까지만 찬다", () => {
  const wish = {
    createdBy: 천웅,
    createdAt: "2026-08-01T00:00:00Z",
    estimatedPrice: 100000,
    agreementUserIds: [천웅],
  };
  const 진척 = wishProgress(wish, { expenses: [], members: 사람들, today: 오늘 });
  assert.equal(진척.saved, 팔월몫(1000000), "실제로 모은 돈은 그대로 알려 준다");
  assert.equal(진척.ratio, 1, "막대는 넘치지 않는다");
});

test("명부에 없는 사람은 세지 않는다", () => {
  // 가구를 떠난 사람이 담아 둔 것. 그 사람 목표를 알 길이 없다.
  const wish = {
    createdBy: "33333333-3333-3333-3333-333333333333",
    createdAt: "2026-08-01T00:00:00Z",
    estimatedPrice: 500000,
    agreementUserIds: ["33333333-3333-3333-3333-333333333333"],
  };
  const 진척 = wishProgress(wish, { expenses: [], members: 사람들, today: 오늘 });
  assert.equal(진척.saved, 0);
  assert.deepEqual(진척.contributors, []);
  assert.equal(진척.missingGoal, false, "셀 사람이 없는 것과 목표를 안 정한 것은 다르다");
});
