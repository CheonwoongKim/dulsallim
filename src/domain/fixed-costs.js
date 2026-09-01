import { formatMonth, lastDayOfMonth, shiftMonthKey, toDateKey, toMonthKey } from "./expenses.js";


export const MIN_DAY = 1;
export const MAX_DAY = 31;

/**
 * 얼마나 거슬러 올라가 채울지. 이번 달에서 이만큼 앞까지 본다.
 *
 * 이번 달도 함께 세므로 실제로 채우는 창은 **열세 달**이다. 이름만 보고 열두 달로 읽으면
 * 경계에서 한 달이 어긋난다 — 실제로 리뷰에서 그렇게 읽혔다. 검사가 이 창을 못 박아 둔다.
 *
 * 그보다 오래 앱을 안 열었으면 그 앞은 채우지 않는다. 일부러 그렇게 둔다 — 두 해 만에
 * 열었다고 스물넉 달치 월세가 한꺼번에 목록에 쌓이면 그게 더 나쁘다.
 */
export const MAX_BACKFILL_MONTHS = 12;

export function isValidDay(day) {
  return Number.isInteger(day) && day >= MIN_DAY && day <= MAX_DAY;
}

/**
 * 그 달에 실제로 존재하는 날짜로 맞춘다.
 * 31일로 등록해도 2월에는 28일(윤년 29일)로 당겨진다.
 */
export function resolveOccurrenceDate(monthKey, day) {
  const clamped = Math.min(day, lastDayOfMonth(monthKey));
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

/**
 * 등록하기 전에 보여 줄 한 줄. describeApplied 와 같은 자리에 둔다 — 글자는 재 봐야 안다.
 *
 * 적은 날을 그대로 되뇌면 없는 날짜를 안내한다. 2월에 31일을 적으면 "2월 31일부터" 였는데,
 * 실제로는 말일로 당겨져 2월 28일에 들어온다. 첫 반영일을 그대로 보여 준다.
 *
 * 29·30·31 은 2월이 늘 짧아 언젠가 반드시 당겨진다. 그 사실도 함께 밝힌다 —
 * 28 이하는 어느 달에도 그대로 있으므로 굳이 말하지 않는다.
 */
export function describeSchedule(day, today = new Date()) {
  if (!isValidDay(day)) return "";
  const startMonth = firstApplicableMonth(day, today);
  const firstDay = Math.min(day, lastDayOfMonth(startMonth));
  const 말일보정 = day > 28 ? ` ${day}일이 없는 달은 말일에 기록됩니다.` : "";
  return `${formatMonth(startMonth)} ${firstDay}일부터 매월 자동으로 기록됩니다.${말일보정}`;
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
