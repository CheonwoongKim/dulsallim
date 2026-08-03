import { toMonthKey } from "./expenses.js";

/**
 * 한 해의 월별 지출 추이를 계산한다. 그리는 일은 여기서 하지 않는다.
 *
 * 이 파일이 지키는 약속이 하나 있다 — **없는 달을 0으로 만들지 않는다.**
 * 0원과 "기록이 없음"은 그래프에서 완전히 다른 말이다. 앞엣것은 아꼈다는 뜻이고
 * 뒤엣것은 우리가 모른다는 뜻인데, 둘을 같게 그리면 그래프가 거짓말을 한다.
 */

const MONTHS_IN_YEAR = 12;
/** 축은 100만 단위로 끊는다. 270만보다 300만이 머릿속에 남는다. */
const AXIS_UNIT = 1000000;
/** 목표 위로 이만큼 여유를 둔다. 넘겼을 때 얼마나 넘겼는지 보이라고. */
const HEADROOM = 1.5;
/** 목표가 아주 작거나 없을 때의 바닥. 없으면 축이 0이 되어 무너진다. */
const MIN_TOP = AXIS_UNIT;

/** 그 해의 열두 달 키. 1월이 0번이다. */
export function yearMonthKeys(year) {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * 세로 축 꼭대기.
 *
 * 지출이 아니라 **목표**에 자를 건다. 지출에 맞추면 목표를 잘 지킨 달일수록
 * 목표선이 천장에 붙어, 잘하고 있을수록 그래프가 꽉 찬 것처럼 보이는 거꾸로가 된다.
 * 목표는 1년에 한두 번 바뀌므로 자도 거의 그대로다 — 해를 넘겨도 모양을 견줄 수 있다.
 *
 * 기준은 반올림하고 확장은 올림하는 게 중요하다. 지출까지 반올림하면
 * 305만이 300만 축에 걸려 선이 천장 밖으로 잘린다. 담아야 할 것은 무조건 담는다.
 */
export function axisTop(maxGoal, maxSpent) {
  const base = Math.max(MIN_TOP, Math.round(((maxGoal || 0) * HEADROOM) / AXIS_UNIT) * AXIS_UNIT);
  return Math.max(base, Math.ceil((maxSpent || 0) / AXIS_UNIT) * AXIS_UNIT);
}

/** 기록이 있는 첫 해부터 올해까지. 그 밖의 해로는 넘어갈 수 없다. */
export function availableYears(expenses, today = new Date()) {
  const thisYear = today.getFullYear();
  const years = expenses.map((expense) => Number(expense.date.slice(0, 4)));
  const first = Math.min(thisYear, ...years);
  return Array.from({ length: thisYear - first + 1 }, (_, i) => first + i);
}

/**
 * 한 해치 선 데이터를 만든다.
 *
 * @param {Array}  expenses 가구 전체 지출
 * @param {Array}  members  구성원(색과 목표를 여기서 가져온다)
 * @param {number} year     볼 해
 * @returns {{months: string[], recorded: boolean[], currentIndex: number, max: number, series: Array}}
 */
export function buildYearSeries(expenses, members, year, today = new Date()) {
  const months = yearMonthKeys(year);
  const thisMonth = toMonthKey(today);
  const currentIndex = months.indexOf(thisMonth);

  // 달마다 한 번씩만 훑는다. 사람이 늘어도 지출을 사람 수만큼 다시 읽지 않는다.
  const byMonth = months.map((monthKey) =>
    expenses.filter((expense) => expense.date.startsWith(monthKey)),
  );

  // 아직 오지 않은 달은 기록이 있을 수 없다. 가구에 한 건도 없는 달도 "모르는 달"이다.
  const recorded = byMonth.map((rows, index) => {
    const isFuture = monthKeyIsAfter(months[index], thisMonth);
    return !isFuture && rows.length > 0;
  });

  const series = members.map((member) => ({
    id: member.id,
    name: member.name,
    color: member.color,
    goal: member.goal || null,
    points: byMonth.map((rows, index) =>
      recorded[index] ? sumOf(rows, member.id) : null,
    ),
  }));

  const spent = series.flatMap((line) => line.points.filter((point) => point !== null));
  const goals = series.map((line) => line.goal).filter(Boolean);

  return {
    months,
    recorded,
    currentIndex,
    // 자는 목표가 잡고, 그 해 지출이 넘치면 그때만 늘린다.
    max: axisTop(Math.max(0, ...goals), Math.max(0, ...spent)),
    series,
  };
}

function sumOf(rows, memberId) {
  return rows
    .filter((expense) => expense.member === memberId)
    .reduce((sum, expense) => sum + expense.amount, 0);
}

/** `2026-09` > `2026-08`. 월 키는 자리수가 고정이라 글자 비교로 충분하다. */
function monthKeyIsAfter(monthKey, other) {
  return monthKey > other;
}
