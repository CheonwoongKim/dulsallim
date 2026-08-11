import {
  getMonthlyExpenses,
  isValidMonthKey,
  lastDayOfMonth,
  shiftMonthKey,
  toMonthKey,
} from "./expenses.js";

/**
 * 위시에 얼마나 다가갔나.
 *
 * 이 앱은 저축을 따로 적지 않는다. 대신 이미 가진 두 가지로 센다 —
 * 사람마다 정한 **월 지출 목표**와, 그 달에 **실제로 쓴 돈**.
 * 그 차이가 그 달에 아낀 돈이고, 위시를 담은 달부터 이번 달까지 쌓은 것이 진척이다.
 * 새로 적을 것이 하나도 없고, "아끼면 목표에 가까워진다" 가 그대로 숫자가 된다.
 *
 * 정해 둔 것 셋:
 *
 * 1. **넘긴 달은 0으로 본다.** 목표를 넘겼다고 지난달에 아낀 것을 도로 깎지 않는다.
 *    깎으면 한 달 크게 쓴 것만으로 여러 달치가 사라져 볼 마음이 안 든다.
 * 2. **찬성한 사람 몫만 센다.** 혼자 담아 둔 것은 담은 사람 몫만, 상대가 "나도" 를
 *    누르면 그때부터 둘 몫이 함께 쌓인다 — 담은 달까지 거슬러 올라가서.
 *    같이 하기로 하면 진척이 눈에 띄게 뛴다.
 * 3. **이번 달은 지나간 날만큼만 센다.** 목표 전체를 이미 아낀 것으로 치면 1일에
 *    한 달치를 통째로 모은 셈이 된다 — 실제로 8월 6일에 292만원을 모았다고 나왔다.
 *    지난 날수만큼만 목표를 떼어 그날까지 쓴 돈과 견준다. 오늘 덜 쓰면 오늘 늘어난다.
 *
 * 목표는 사람마다 하나뿐이라 지난달 목표가 얼마였는지는 모른다. 지금 목표로 지난달도 센다.
 */

/** 담은 달부터 이번 달까지, 오래된 것부터. */
export function monthsSince(startDateKey, today = new Date()) {
  // 서버가 주는 것은 `2026-08-06T03:03:34Z` 같은 글자다. 앞 일곱 자가 곧 달이다.
  const 시작 = String(startDateKey ?? "").slice(0, 7);
  const 이번 = toMonthKey(today);
  if (!isValidMonthKey(시작) || 시작 > 이번) return [];

  const 달들 = [];
  for (let 달 = 시작; 달 <= 이번; 달 = shiftMonthKey(달, 1)) {
    달들.push(달);
    // 잘못된 값이 들어와도 여기서 멈춘다. 화면 하나 때문에 브라우저가 굳으면 안 된다.
    if (달들.length > 600) break;
  }
  return 달들;
}

/**
 * 그 달에 목표 가운데 얼마만큼이 지나갔나. 0~1.
 *
 * 끝난 달은 1이다. 이번 달은 오늘까지의 날수만큼만 — 그래야 1일에 한 달치를 모은 것이
 * 되지 않는다. 앞으로 올 달은 0.
 */
export function monthElapsed(monthKey, today = new Date()) {
  const 이번 = toMonthKey(today);
  if (monthKey < 이번) return 1;
  if (monthKey > 이번) return 0;

  return Math.min(1, today.getDate() / lastDayOfMonth(monthKey));
}

/** 그 사람이 그 달에 아낀 돈. 목표를 안 정했거나 넘겼으면 0. */
export function savedInMonth(expenses, monthKey, memberId, goal, today = new Date()) {
  if (!goal || goal <= 0) return 0;

  const 지나간몫 = goal * monthElapsed(monthKey, today);
  const 쓴돈 = getMonthlyExpenses(expenses, monthKey)
    .filter((expense) => expense.member === memberId)
    .reduce((합, expense) => 합 + expense.amount, 0);
  return Math.max(0, Math.round(지나간몫 - 쓴돈));
}

/**
 * 위시 하나의 진척.
 *
 * @returns {{saved: number, target: number, ratio: number, contributors: string[], missingGoal: boolean}}
 *   ratio 는 0~1 로 자른다. 넘겨 모았어도 막대는 가득까지만 찬다.
 */
export function wishProgress(wish, { expenses = [], members = [], today = new Date() } = {}) {
  const target = Number(wish?.estimatedPrice) || 0;
  const 찬성한사람 = wish?.agreementUserIds?.length ? wish.agreementUserIds : [wish?.createdBy];
  const contributors = members.filter((member) => 찬성한사람.includes(member.id));

  const 달들 = monthsSince(wish?.createdAt, today);
  const saved = contributors.reduce(
    (합, member) =>
      합 + 달들.reduce((사람합, 달) => 사람합 + savedInMonth(expenses, 달, member.id, member.goal, today), 0),
    0,
  );

  return {
    saved,
    target,
    ratio: target > 0 ? Math.min(1, saved / target) : 0,
    contributors: contributors.map((member) => member.id),
    // 한 사람이라도 목표를 안 정했으면 그 몫이 통째로 빠진다. 화면이 그 까닭을 말해야 한다.
    missingGoal: contributors.some((member) => !member.goal || member.goal <= 0),
  };
}
