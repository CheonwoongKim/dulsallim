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
 * 좁은 칸(50px 남짓)에 들어가도록 접은 금액. 언제나 만 단위로 적는다.
 *
 * `1,234,567`은 어떻게 해도 칸에 안 들어간다. 단위를 하나로 맞추면 칸끼리
 * 크기 비교가 눈으로 바로 되는 이점도 있다 — `1,400`과 `46.3만`은 나란히 두면
 * 어느 쪽이 큰지 한 번 더 생각하게 된다.
 *
 * 자릿수는 크기에 따라 줄인다. 작을수록 소수가 필요하고, 커질수록 자리가 없다.
 */
export function formatCompactMoney(amount) {
  const man = amount / 10000;
  const decimals = man < 1 ? 2 : man < 100 ? 1 : 0;
  // toFixed 뒤 Number로 되돌리면 뒤에 남는 0이 정리된다. 0.50만 → 0.5만
  return `${Number(man.toFixed(decimals))}만`;
}
