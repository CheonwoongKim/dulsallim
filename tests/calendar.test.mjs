import assert from "node:assert/strict";
import test from "node:test";

import { WEEKDAYS, buildCalendar, formatCompactMoney, sumByDate } from "../src/domain/calendar.js";

test("격자는 언제나 42칸(6주)이다", () => {
  // 달마다 길이가 달라지면 월을 넘길 때 아래 내용이 위아래로 튄다.
  for (const month of ["2026-02", "2026-08", "2024-02", "2000-02", "2100-02"]) {
    assert.equal(buildCalendar(month).length, 42, `${month}`);
  }
});

test("1일이 그 달 첫 요일 자리에 놓인다", () => {
  // 2026-08-01은 토요일 → 첫 줄의 마지막 칸(index 6)
  const 팔월 = buildCalendar("2026-08");
  assert.equal(new Date(2026, 7, 1).getDay(), 6, "전제 확인");
  assert.equal(팔월[6].day, 1);
  assert.equal(팔월[6].date, "2026-08-01");
  assert.deepEqual(팔월.slice(0, 6).map((c) => c.day), [null, null, null, null, null, null]);
});

test("달의 마지막 날 다음은 모두 빈 칸이다", () => {
  const 이월 = buildCalendar("2026-02");
  const 날짜들 = 이월.filter((c) => c.date).map((c) => c.day);
  assert.equal(날짜들.length, 28, "2026년 2월은 28일");
  assert.equal(날짜들[27], 28);
  assert.equal(날짜들.at(-1), 28);
});

test("윤년을 정확히 센다 — 세기 예외까지", () => {
  const 일수 = (m) => buildCalendar(m).filter((c) => c.date).length;
  assert.equal(일수("2024-02"), 29, "4로 나뉨");
  assert.equal(일수("2026-02"), 28, "평년");
  assert.equal(일수("2000-02"), 29, "400으로 나뉘면 윤년");
  assert.equal(일수("2100-02"), 28, "100으로 나뉘면 평년");
});

test("2000~2100년 모든 달이 실제 일수와 맞는다", () => {
  // 캘린더는 매년 맞아야 한다. 한 해라도 어긋나면 그 달 기록이 엉뚱한 칸에 붙는다.
  for (let year = 2000; year <= 2100; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const 칸 = buildCalendar(key).filter((c) => c.date);
      assert.equal(칸.length, new Date(year, month, 0).getDate(), key);
      // 날짜가 1부터 빠짐없이 이어져야 한다
      assert.deepEqual(칸.map((c) => c.day), 칸.map((_, i) => i + 1), key);
    }
  }
});

test("날짜 문자열은 그 달 안에서만 만들어진다", () => {
  // 시간대에 따라 하루 밀리면 기록이 옆 칸에 붙는다.
  for (const cell of buildCalendar("2026-01").filter((c) => c.date)) {
    assert.ok(cell.date.startsWith("2026-01-"), cell.date);
    assert.match(cell.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("요일 이름은 일요일부터 일곱 개다", () => {
  assert.deepEqual(WEEKDAYS, ["일", "월", "화", "수", "목", "금", "토"]);
});

test("sumByDate는 같은 날 지출을 더한다", () => {
  const totals = sumByDate([
    { date: "2026-08-01", amount: 1000 },
    { date: "2026-08-01", amount: 2500 },
    { date: "2026-08-03", amount: 400 },
  ]);
  assert.deepEqual(totals, { "2026-08-01": 3500, "2026-08-03": 400 });
  assert.deepEqual(sumByDate([]), {});
});

test("formatCompactMoney는 언제나 만 단위로 적는다", () => {
  // 단위가 섞이면 칸끼리 크기 비교가 한 번에 안 된다.
  assert.equal(formatCompactMoney(500), "0.05만");
  assert.equal(formatCompactMoney(1400), "0.14만");
  assert.equal(formatCompactMoney(4500), "0.45만");
  assert.equal(formatCompactMoney(5000), "0.5만", "뒤에 남는 0은 정리한다");
  assert.equal(formatCompactMoney(10000), "1만");
  assert.equal(formatCompactMoney(15000), "1.5만");
  assert.equal(formatCompactMoney(21000), "2.1만");
  assert.equal(formatCompactMoney(120000), "12만");
  assert.equal(formatCompactMoney(463000), "46.3만");
  assert.equal(formatCompactMoney(1234567), "123만");
});

test("어떤 금액이든 만 단위 표기로 끝난다", () => {
  for (const amount of [1, 500, 9999, 10000, 99999, 999999, 1234567]) {
    assert.match(formatCompactMoney(amount), /만$/, `${amount}`);
  }
});

test("접은 금액은 어떤 값이든 6글자를 넘지 않는다", () => {
  // 칸 너비가 50px 남짓이라 길어지면 줄이 바뀌거나 잘린다.
  for (const amount of [1, 999, 9999, 10000, 99999, 999999, 1234567, 99999999]) {
    assert.ok(formatCompactMoney(amount).length <= 6, `${amount} → ${formatCompactMoney(amount)}`);
  }
});
