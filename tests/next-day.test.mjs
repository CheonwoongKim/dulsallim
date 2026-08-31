/*
 * 서머타임이 있는 곳에서 잰다.
 *
 * 한국에는 서머타임이 없어서, 다음 자정까지를 86400000 에서 빼는 식으로 계산해도 여기서는
 * 맞다. 그래서 그 계산으로 바꿔도 다른 검사가 전부 통과했다 — 실제로 되돌려 재 봤다.
 * 하지만 시간을 앞당기거나 되돌리는 날에는 하루가 23시간이거나 25시간이라 한 시간씩
 * 어긋난다. 그 어긋남을 잡으려면 그런 곳에서 재는 수밖에 없다.
 *
 * node --test 는 파일마다 프로세스를 따로 띄우므로 여기서 바꾼 TZ 가 다른 검사에 새지 않는다.
 */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test from "node:test";

import { msUntilNextDay } from "../src/domain/expenses.js";

const 시간 = (h) => h * 60 * 60 * 1000;

test("시간대가 바뀌는 날에도 벽시계로 재야 할 만큼만 잰다", () => {
  assert.equal(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    "America/New_York",
    "이 검사는 서머타임이 있는 시간대에서만 뜻이 있다",
  );

  /*
   * 어느 날 아침 10시든 다음 자정까지는 벽시계로 열네 시간이다.
   * 86400000 에서 빼는 계산은 앞당긴 날 15시간, 되돌린 날 13시간을 내놓는다.
   */
  const 아침10시 = (year, month, day) => new Date(year, month - 1, day, 10, 0, 0);
  assert.equal(msUntilNextDay(아침10시(2026, 3, 8)), 시간(14) + 1000, "봄에 앞당기는 날");
  assert.equal(msUntilNextDay(아침10시(2026, 11, 1)), 시간(14) + 1000, "가을에 되돌리는 날");
  assert.equal(msUntilNextDay(아침10시(2026, 6, 10)), 시간(14) + 1000, "평범한 날");
});

test("되돌리는 날의 하루는 스물다섯 시간이다", () => {
  // 상한이 24시간이라고 믿으면 이런 날 타이머를 한 시간 일찍 건다.
  assert.equal(msUntilNextDay(new Date(2026, 10, 1, 0, 0, 0)), 시간(25) + 1000);
  // 앞당기는 날은 스물세 시간이다.
  assert.equal(msUntilNextDay(new Date(2026, 2, 8, 0, 0, 0)), 시간(23) + 1000);
});
