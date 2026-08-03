import { CATEGORIES, shiftMonthKey, toMonthKey } from "./expenses.js";

/**
 * 진행 중인 달은 같은 날짜까지만 견준다.
 *
 * 8월 3일에 8월 전체(3일치)를 7월 전체(31일치)와 비교하면 "90% 줄었어요"가 나온다.
 * 아무 의미가 없고, 나쁘게는 안심시킨다.
 *
 * @returns {number|null} 잘라 볼 날짜. null이면 달 전체를 본다
 */
export function comparableDay(monthKey, today = new Date()) {
  return monthKey === toMonthKey(today) ? today.getDate() : null;
}

/** maxDay가 있으면 그 날짜까지만 남긴다. null이면 그대로 돌려준다. */
export function untilDay(expenses, maxDay) {
  if (maxDay === null) return expenses;
  return expenses.filter((expense) => Number(expense.date.slice(8)) <= maxDay);
}

/** 그 달 합계. maxDay를 주면 그 날짜까지만 센다. */
export function sumMonth(expenses, monthKey, maxDay = null) {
  const monthly = expenses.filter((expense) => expense.date.startsWith(monthKey));
  return untilDay(monthly, maxDay).reduce((sum, expense) => sum + expense.amount, 0);
}

/**
 * 이전 달·전년 동월과 견준 결과.
 *
 * 견줄 기록이 아예 없으면 숫자를 만들지 않고 null을 준다. 0원 대비 증감은 뜻이 없고,
 * `-100%`처럼 그럴듯한 거짓말이 되기 쉽다. 화면이 "비교할 기록이 없다"고 말하게 한다.
 */
export function compareMonth(expenses, monthKey, today = new Date()) {
  const maxDay = comparableDay(monthKey, today);
  const total = sumMonth(expenses, monthKey, maxDay);

  const against = (otherMonth) => {
    if (!expenses.some((expense) => expense.date.startsWith(otherMonth))) return null;
    const other = sumMonth(expenses, otherMonth, maxDay);
    return {
      month: otherMonth,
      total: other,
      diff: total - other,
      // 상대가 0원이면 몇 %인지 말할 수 없다. 금액 차이만 전한다.
      percent: other ? Math.round(((total - other) / other) * 100) : null,
    };
  };

  return {
    total,
    maxDay,
    previous: against(shiftMonthKey(monthKey, -1)),
    lastYear: against(shiftMonthKey(monthKey, -12)),
  };
}

/**
 * 분류별 합계. 많이 쓴 순으로 준다.
 * 안 쓴 분류는 빼고 준다 — `0원` 줄이 늘어서면 어디에 많이 썼는지 눈이 찾아다녀야 한다.
 */
export function sumByCategory(monthly) {
  const total = monthly.reduce((sum, expense) => sum + expense.amount, 0);
  const totals = monthly.reduce((acc, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
    return acc;
  }, {});

  return Object.entries(totals)
    .map(([key, amount]) => ({
      key,
      label: (CATEGORIES[key] || CATEGORIES.etc).label,
      color: (CATEGORIES[key] || CATEGORIES.etc).color,
      total: amount,
      percent: total ? Math.round((amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}
