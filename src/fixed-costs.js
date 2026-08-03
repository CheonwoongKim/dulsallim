import { shiftMonthKey, toDateKey, toMonthKey } from "./expenses.js";


export const MIN_DAY = 1;
export const MAX_DAY = 31;

/** 오래 앱을 열지 않았을 때 한꺼번에 수십 건이 생기지 않도록 소급 범위를 제한한다. */
export const MAX_BACKFILL_MONTHS = 12;

export function isValidDay(day) {
  return Number.isInteger(day) && day >= MIN_DAY && day <= MAX_DAY;
}

function lastDayOf(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

/**
 * 그 달에 실제로 존재하는 날짜로 맞춘다.
 * 31일로 등록해도 2월에는 28일(윤년 29일)로 당겨진다.
 */
export function resolveOccurrenceDate(monthKey, day) {
  const clamped = Math.min(day, lastDayOf(monthKey));
  return `${monthKey}-${String(clamped).padStart(2, "0")}`;
}

/**
 * 등록 시점 기준으로 첫 반영이 될 달.
 * 이번 달 반영일이 이미 지났다면 다음 달부터 시작해, 등록하자마자 과거 지출이 생기지 않게 한다.
 */
export function firstApplicableMonth(day, today = new Date()) {
  const thisMonth = toMonthKey(today);
  return today.getDate() <= day ? thisMonth : shiftMonthKey(thisMonth, 1);
}

export function appliedKey(templateId, monthKey) {
  return `${templateId}:${monthKey}`;
}

/**
 * 지금 지출로 만들어야 할 고정비를 모은다.
 *
 * 조건: 시작월 이후이고, 반영일이 오늘까지 지났고, 아직 반영하지 않은 달.
 * 미래 달은 만들지 않으므로 다음 달 합계가 미리 부풀지 않는다.
 */
export function collectDueOccurrences(templates, applied, today = new Date()) {
  const appliedSet = new Set(applied);
  const todayKey = toDateKey(today);
  const thisMonth = toMonthKey(today);
  const oldestMonth = shiftMonthKey(thisMonth, -MAX_BACKFILL_MONTHS);
  const due = [];

  for (const template of templates) {
    const from = template.startMonth < oldestMonth ? oldestMonth : template.startMonth;
    for (let monthKey = from; monthKey <= thisMonth; monthKey = shiftMonthKey(monthKey, 1)) {
      const key = appliedKey(template.id, monthKey);
      if (appliedSet.has(key)) continue;
      const date = resolveOccurrenceDate(monthKey, template.day);
      if (date > todayKey) continue;
      due.push({ template, monthKey, date, key });
    }
  }

  // 오래된 달부터 넣어야 목록 정렬이 자연스럽다.
  return due.sort((a, b) => a.date.localeCompare(b.date));
}

/** 다음에 반영될 날짜. 관리 화면에서 "언제 들어오는지"를 보여주기 위한 값. */
export function nextOccurrenceDate(template, applied, today = new Date()) {
  const appliedSet = new Set(applied);
  let monthKey = toMonthKey(today);
  for (let i = 0; i <= MAX_BACKFILL_MONTHS; i += 1) {
    const key = appliedKey(template.id, monthKey);
    const date = resolveOccurrenceDate(monthKey, template.day);
    if (!appliedSet.has(key) && monthKey >= template.startMonth && date > toDateKey(today)) return date;
    monthKey = shiftMonthKey(monthKey, 1);
  }
  return null;
}

/**
 * 고정비 반영 결과를 알릴 한 줄. 알릴 것이 없으면 null.
 *
 * 성공과 실패는 함께 일어날 수 있다. 성공만 알리면 빠진 고정비를 모른 채 지나가고,
 * 사용자는 이번 달 합계가 왜 적은지 알 방법이 없다.
 */
export function describeApplied({ created, failed }) {
  if (created && failed) return `고정비 ${created}건을 넣었고 ${failed}건은 반영하지 못했어요`;
  if (created) return `이번 달 고정비 ${created}건을 넣었어요`;
  if (failed) return `고정비 ${failed}건을 반영하지 못했어요. 잠시 뒤 다시 열어 주세요`;
  return null;
}
