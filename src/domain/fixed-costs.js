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

/**
 * 창보다 앞이라 채우지 않은 건수. 잘림이 이번에 실제로 문 실행에서만 센다.
 *
 * 채우지 않은 달은 반영 기록이 남지 않는데, 창은 늘 이번 달을 따라 앞으로 밀린다.
 * 그래서 한 번 창 밖으로 밀려난 달은 다음에 열어도 영영 돌아오지 않는다.
 * 조용히 비면 지난 달 합계가 왜 적은지 알 길이 없다 — 개수라도 알려 주려고 센다.
 *
 * "잘린 것이 있나" 로 물으면 안 된다. 그 값은 한 번 0 이 아니면 영영 0 이 안 되고,
 * 매달 여는 사람은 늘 무언가를 채우므로 같은 말을 죽을 때까지 매달 듣는다.
 * 사용자가 할 수 있는 일이 없는 사실을 되뇌는 것은 조용히 비는 것만큼 나쁘다.
 *
 * 그래서 "이번에 물었나" 로 묻는다. 창의 맨 앞 달을 이제야 채우고 있다면 그 앞은 방금
 * 영영 잘린 것이다. 다음 달에 열면 그때의 맨 앞 달은 이미 채워져 있어 조용해지고,
 * 또 오래 안 열어 새로 잘리면 그때 다시 말한다.
 */
export function countSkippedMonths(templates, applied, due, today = new Date()) {
  const oldestMonth = shiftMonthKey(toMonthKey(today), -MAX_BACKFILL_MONTHS);
  if (!due.some((occurrence) => occurrence.monthKey === oldestMonth)) return 0;

  const appliedSet = new Set(applied);
  let skipped = 0;
  for (const template of templates) {
    // 월 키는 자릿수가 고정이라 문자열 비교가 곧 시간 비교다. 창 앞에 닿으면 멈춘다.
    for (let monthKey = template.startMonth; monthKey < oldestMonth; monthKey = shiftMonthKey(monthKey, 1)) {
      if (!appliedSet.has(appliedKey(template.id, monthKey))) skipped += 1;
    }
  }
  return skipped;
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
export function describeApplied({ created, failed, skipped = 0 }) {
  /*
   * "이번 달" 이라고 하지 않는다. 오랜만에 열면 열세 달치를 한꺼번에 채우는데,
   * 그것을 이번 달 것이라 하면 거짓이다. 달을 말하지 않으면 어느 경우에도 틀리지 않는다.
   */
  const 본문 =
    created && failed ? `고정비 ${created}건을 넣었고 ${failed}건은 반영하지 못했어요`
    : created ? `고정비 ${created}건을 넣었어요`
    : failed ? `고정비 ${failed}건을 반영하지 못했어요. 잠시 뒤 다시 열어 주세요`
    : null;
  if (!본문) return null;
  if (!skipped) return 본문;

  /*
   * 잘린 것은 다시 채울 길이 없다. 그러니 개수만 말하고 끝내면 듣는 사람이 할 일이 없다.
   * 무엇을 해야 하는지까지 말해야 문장이 값을 한다.
   */
  return `${본문}. ${MAX_BACKFILL_MONTHS + 1}개월보다 오래된 ${skipped}건은 빠졌어요. 필요하면 직접 적어 주세요`;
}
