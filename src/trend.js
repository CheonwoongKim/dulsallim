import { toMonthKey } from "./expenses.js";

/**
 * 한 해의 월별 지출 추이를 계산한다. 그리는 일은 여기서 하지 않는다.
 *
 * 이 파일이 지키는 약속이 하나 있다 — **없는 달을 0으로 만들지 않는다.**
 * 0원과 "기록이 없음"은 그래프에서 완전히 다른 말이다. 앞엣것은 아꼈다는 뜻이고
 * 뒤엣것은 우리가 모른다는 뜻인데, 둘을 같게 그리면 그래프가 거짓말을 한다.
 */

const MONTHS_IN_YEAR = 12;
/** 기록이 하나도 없을 때 쓰는 세로 축 꼭대기. 0으로 두면 축이 무너진다. */
const EMPTY_TOP = 100000;
/**
 * 꼭대기로 쓸 만한 숫자들. 모두 절반이 딱 떨어져 가운데 눈금을 그릴 수 있다.
 *
 * 촘촘해야 한다. 2 다음이 바로 4면 210만을 쓴 해의 축이 400만이 되어
 * 그래프 위쪽 절반이 통째로 빈다. 선이 아래에 눌리면 오르내림이 안 보인다.
 */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
/** 축 눈금의 최소 단위. 1.5 같은 배수를 써도 절반이 정수로 떨어지게 100으로 둔다. */
const MIN_AXIS_UNIT = 100;

/** 그 해의 열두 달 키. 1월이 0번이다. */
export function yearMonthKeys(year) {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * 눈금이 떨어지는 꼭대기 값으로 올린다.
 * 187만을 그대로 쓰면 축 라벨이 "1,870,000"처럼 읽기 힘든 숫자가 된다.
 */
export function niceCeiling(value) {
  if (!(value > 0)) return EMPTY_TOP;
  // 1의 자리로 축을 끊을 일은 없다. 최소 단위를 두면 절반도 언제나 정수로 떨어진다.
  const unit = Math.max(MIN_AXIS_UNIT, 10 ** Math.floor(Math.log10(value)));
  const step = NICE_STEPS.find((candidate) => candidate * unit >= value);
  return step ? step * unit : 10 * unit;
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
    // 목표선이 축 밖으로 나가면 넘겼는지 지켰는지 볼 수가 없다. 둘 다 덮는다.
    max: niceCeiling(Math.max(0, ...spent, ...goals)),
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
