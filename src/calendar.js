import { formatMoney } from "./expenses.js";

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 달마다 4~6주로 길이가 달라진다. 그대로 두면 월을 넘길 때 아래 내용이 위아래로 튄다.
 * 6주로 고정해 화면이 흔들리지 않게 한다.
 */
const WEEKS = 6;

/**
 * 그 달의 격자 42칸.
 *
 * 말일과 요일을 직접 세지 않는다. 그레고리력 규칙(4년·100년·400년 예외)은 Date가 안다.
 * 날짜 문자열을 Date로 파싱하지도 않는다 — `new Date("2026-08-01")`은 UTC 자정으로 읽혀
 * 시간대에 따라 하루 전날이 된다. 만들 때는 숫자로 넣고, 비교는 문자열로만 한다.
 *
 * @param {string} monthKey `2026-08`
 * @returns {Array<{date: string|null, day: number|null}>} 그 달이 아닌 칸은 date가 null
 */
export function buildCalendar(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();

  return Array.from({ length: WEEKS * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > lastDay) return { date: null, day: null };
    return { date: `${monthKey}-${String(day).padStart(2, "0")}`, day };
  });
}

/** 날짜별 합계. 칸에 넣을 숫자를 미리 모아 둔다. */
export function sumByDate(expenses) {
  return expenses.reduce((totals, expense) => {
    totals[expense.date] = (totals[expense.date] || 0) + expense.amount;
    return totals;
  }, {});
}

/**
 * 좁은 칸(50px 남짓)에 들어가도록 접은 금액.
 * `1,234,567`은 어떻게 해도 안 들어간다. 만 단위로 접되 만 미만은 그대로 둔다 —
 * `0.5만`보다 `4,500`이 읽기 쉽다.
 */
export function formatCompactMoney(amount) {
  if (amount < 10000) return formatMoney(amount);

  const man = amount / 10000;
  // 10만 미만은 소수 한 자리까지. 그 위는 자릿수가 늘어 소수를 붙일 자리가 없다.
  if (man < 100) {
    const rounded = Math.round(man * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}만`;
  }
  return `${Math.round(man)}만`;
}
