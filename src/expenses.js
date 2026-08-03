export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

export const CATEGORIES = {
  food: { label: "식비" },
  cafe: { label: "카페" },
  grocery: { label: "장보기" },
  living: { label: "생활" },
  transport: { label: "교통" },
  housing: { label: "주거" },
  leisure: { label: "여가" },
  medical: { label: "의료" },
  pet: { label: "반려견" },
  etc: { label: "기타" },
};

export function toMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` 형식이면서 실제로 존재하는 날짜인지 확인한다. */
export function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** 오늘 이후 날짜인지. 막지는 않고 안내에만 쓴다(예약 결제 기록 같은 정당한 용도가 있다). */
export function isFutureDateKey(value, today = new Date()) {
  return isValidDateKey(value) && value > toDateKey(today);
}

export function isValidMonthKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return false;
  const [year, month] = value.split("-").map(Number);
  return year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12;
}

export function clampYear(year) {
  if (!Number.isFinite(year)) return MIN_YEAR;
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.trunc(year)));
}

export function formatMoney(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

/** 필터 표시줄에 쓰는 날짜. 예: `8월 3일` */
export function formatDayLabel(dateKey) {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${month}월 ${day}일`;
}

/** 목록 왼쪽 열에 들어갈 짧은 날짜 표기. 자릿수를 맞춰 세로로 정렬된다. 예: `08.01` */
export function formatShortDate(dateKey) {
  return dateKey.slice(5).replace("-", ".");
}

export function getMonthlyExpenses(expenses, monthKey) {
  return expenses
    .filter((expense) => expense.date.startsWith(monthKey))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** member가 null이면 전체를 그대로 돌려준다(필터 해제). */
export function filterByMember(monthly, member) {
  if (!member) return monthly;
  return monthly.filter((expense) => expense.member === member);
}

/** 다시 누르면 해제되는 토글. 빈 값은 해제로 취급한다. */
export function nextMemberFilter(current, member) {
  if (!member) return null;
  return current === member ? null : member;
}

/** date가 null이면 전체를 그대로 돌려준다(필터 해제). */
export function filterByDate(monthly, date) {
  if (!date) return monthly;
  return monthly.filter((expense) => expense.date === date);
}

/** 캘린더에서 같은 날을 다시 누르면 해제된다. */
export function nextDateFilter(current, date) {
  if (!date) return null;
  return current === date ? null : date;
}

/**
 * 목표까지 얼마 남았는지 낸다.
 *
 * @param {object} input
 * @param {Array} input.monthly 그 달 지출 전체
 * @param {string} input.memberId 결제자. 폼에서 고른 사람을 따라간다
 * @param {number|null} input.goal 그 사람의 월 목표. 없으면 계산하지 않는다
 * @param {number} [input.draft] 아직 저장하지 않은 금액. 입력하는 동안 미리 반영한다
 * @param {string|null} [input.excludeId] 수정 중인 지출. 이미 합계에 들어 있으므로 빼야 두 번 세지 않는다
 * @returns {{spent: number, remaining: number, percent: number, over: boolean}|null}
 */
export function summarizeGoal({ monthly, memberId, goal, draft = 0, excludeId = null }) {
  if (!goal || !memberId) return null;

  const spent =
    monthly
      .filter((expense) => expense.member === memberId && expense.id !== excludeId)
      .reduce((sum, expense) => sum + expense.amount, 0) + draft;
  const remaining = goal - spent;

  return {
    spent,
    remaining,
    // 초과했을 때의 음수 비율은 읽는 순간 계산이 필요해진다. 0으로 눕히고 문구로 알린다.
    percent: remaining > 0 ? Math.round((remaining / goal) * 100) : 0,
    over: remaining < 0,
  };
}

/**
 * 그 달의 합계와 사람별 몫을 낸다.
 * @param {Array} monthly 그 달 지출
 * @param {Array<{id: string, name: string}>} members 화면에 놓일 순서대로
 */
export function summarize(monthly, members = []) {
  const total = monthly.reduce((sum, expense) => sum + expense.amount, 0);
  let assigned = 0;

  const perMember = members.map((member, index) => {
    const own = monthly.filter((expense) => expense.member === member.id);
    const memberTotal = own.reduce((sum, expense) => sum + expense.amount, 0);
    // 마지막 사람은 남은 몫을 그대로 가져간다. 반올림해도 비중 합이 항상 100%가 된다.
    const isLast = index === members.length - 1;
    const percent = !total
      ? 0
      : isLast
        ? 100 - assigned
        : Math.round((memberTotal / total) * 100);
    assigned += percent;

    return { id: member.id, name: member.name, total: memberTotal, count: own.length, percent };
  });

  return { total, count: monthly.length, perMember };
}
