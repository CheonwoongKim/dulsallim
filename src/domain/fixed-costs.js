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
 * 마지막으로 반영될 달. months 가 없으면 끝이 없다(구독).
 *
 * 할부는 고정비에 끝을 붙인 것뿐이다. 시작월이 이미 1회차이므로 마지막은 months - 1 만큼
 * 뒤다 — months 를 그대로 더하면 한 달을 더 받는다.
 */
export function lastOccurrenceMonth({ startMonth, months }) {
  return months ? shiftMonthKey(startMonth, months - 1) : null;
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
export function describeSchedule({ id = "미리보기", day, startMonth = null, months = null, applied = [] }, today = new Date()) {
  if (!isValidDay(day)) return "";
  // 시작월은 사람이 고를 수 있다. 안 고른 채로 물으면 계산값을 쓴다.
  const 시작 = startMonth || firstApplicableMonth(day, today);
  const firstDay = Math.min(day, lastDayOfMonth(시작));
  const 말일보정 = day > 28 ? ` ${day}일이 없는 달은 말일에 기록됩니다.` : "";
  const 끝 = lastOccurrenceMonth({ startMonth: 시작, months });

  /*
   * 지난 달을 고르면 저장하는 순간 그만큼이 한꺼번에 기록된다. -12 를 고르면 열세 건이다.
   * 그것을 안 밝히고 "앞으로 기록됩니다" 라고만 하면, 저장하고 나서야 목록에 쏟아진 것을
   * 본다. 몇 건인지는 짐작하지 않고 실제로 채울 때 쓰는 함수에게 물어본다 —
   * 말일 보정도 소급 창도 그쪽이 이미 알고 있어, 따로 세면 두 셈이 어긋난다.
   */
  const 곧 = collectDueOccurrences([{ id, day, startMonth: 시작, months }], applied, today).length;
  const 소급 = 곧 ? ` 저장하면 지난 ${곧}건이 곧바로 기록됩니다.` : "";

  // 할부는 끝을 함께 말해야 한다. 끝이 안 보이면 구독과 구분되지 않는다.
  if (끝) return `${formatMonth(시작)} ${firstDay}일부터 ${months}개월, ${formatMonth(끝)}까지 자동으로 기록됩니다.${소급}${말일보정}`;
  return `${formatMonth(시작)} ${firstDay}일부터 매월 자동으로 기록됩니다.${소급}${말일보정}`;
}

export function appliedKey(templateId, monthKey) {
  return `${templateId}:${monthKey}`;
}

/** 이 고정비로 반영된 기록 전부. 달을 안 가린다 — 실제로 나간 횟수를 세는 자리다. */
function 지금까지낸것(templateId, applied) {
  const 앞 = `${templateId}:`;
  let 센것 = 0;
  for (const key of applied) if (key.startsWith(앞)) 센것 += 1;
  return 센것;
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
    // 할부는 끝이 있다. 끝난 달까지만 본다 — 안 막으면 다 갚은 할부가 매달 다시 찍힌다.
    const 끝 = lastOccurrenceMonth(template);
    const to = 끝 && 끝 < thisMonth ? 끝 : thisMonth;

    /*
     * 달 경계와 별개로 **횟수**로도 막는다. 달만 보면 일정이 움직이는 순간 새는 자리가 생긴다 —
     * 5개월 할부를 한 번 기록한 뒤 시작월을 한 달 뒤로 미니, 옛 기록이 새 범위 밖으로 밀려나
     * 중복을 못 막고 여섯 번 청구됐다.
     *
     * 그래서 범위 밖 기록까지 세어 회수에서 뺀다. 그 달에 돈이 나간 것은 매한가지라,
     * 세는 것이 맞다. 화면이 시작월을 잠가 두긴 했지만 그것은 화면의 약속일 뿐이고,
     * 여기서 막으면 어느 길로 들어와도 회수를 넘을 수 없다.
     */
    let 남은횟수 = template.months ? template.months - 지금까지낸것(template.id, applied) : Infinity;

    for (let monthKey = from; monthKey <= to && 남은횟수 > 0; monthKey = shiftMonthKey(monthKey, 1)) {
      const key = appliedKey(template.id, monthKey);
      if (appliedSet.has(key)) continue;
      const date = resolveOccurrenceDate(monthKey, template.day);
      if (date > todayKey) continue;
      due.push({ template, monthKey, date, key });
      남은횟수 -= 1;
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
    /*
     * 월 키는 자릿수가 고정이라 문자열 비교가 곧 시간 비교다. 창 앞에 닿으면 멈춘다.
     * 할부는 거기에 더해 끝에서도 멈춘다 — 두 해 전에 시작한 다섯 달 할부를
     * 스물넉 달이 빠졌다고 세면, 없던 일곱 달까지 "빠졌다" 고 말하게 된다. 상한은 다섯이다.
     */
    const 끝 = lastOccurrenceMonth(template);
    for (
      let monthKey = template.startMonth;
      monthKey < oldestMonth && (!끝 || monthKey <= 끝);
      monthKey = shiftMonthKey(monthKey, 1)
    ) {
      if (!appliedSet.has(appliedKey(template.id, monthKey))) skipped += 1;
    }
  }
  return skipped;
}

/** 다음에 반영될 날짜. 관리 화면에서 "언제 들어오는지"를 보여주기 위한 값. */
export function nextOccurrenceDate(template, applied, today = new Date()) {
  const appliedSet = new Set(applied);
  const 끝 = lastOccurrenceMonth(template);
  let monthKey = toMonthKey(today);
  for (let i = 0; i <= MAX_BACKFILL_MONTHS; i += 1) {
    // 다 갚은 할부에 다음은 없다. 없는 날짜를 목록이 영영 가리키게 두지 않는다.
    if (끝 && monthKey > 끝) return null;
    const key = appliedKey(template.id, monthKey);
    const date = resolveOccurrenceDate(monthKey, template.day);
    if (!appliedSet.has(key) && monthKey >= template.startMonth && date > toDateKey(today)) return date;
    monthKey = shiftMonthKey(monthKey, 1);
  }
  return null;
}

/**
 * 이 할부로 실제 청구된 회차. 회수를 넘겨 세지 않는다.
 *
 * 달을 안 가리고 센 다음 months 에서 자른다. 세는 것과 만드는 것이 같은 기준이라야
 * "몇 번 냈나" 와 "몇 번 더 나가나" 가 서로 맞는다 — collectDueOccurrences 도 같은 셈으로
 * 상한을 지킨다. 자르기 때문에 표시 회차가 months 를 넘는 일은 구조적으로 없다.
 */
export function countApplied(template, applied) {
  const 센것 = 지금까지낸것(template.id, applied);
  return template.months ? Math.min(센것, template.months) : 센것;
}

/**
 * 한 번이라도 반영된 적이 있나. 여기서는 범위 밖 기록도 센다 —
 * 일정에서 벗어나 있어도 그 달에 실제로 돈이 나간 것은 같기 때문이다.
 */
export function hasApplied(template, applied) {
  return 지금까지낸것(template.id, applied) > 0;
}

/**
 * 목록 한 줄에 붙일 할부 진행. 구독이면 null 이라 부르는 쪽이 여느 때처럼 그린다.
 *
 * 몇 번 냈고 몇 번 남았는지, 그리고 언제 끝나는지를 함께 말한다. 같은 금액이 매달
 * 찍히는데 끝이 안 보이면 구독과 구분이 안 된다.
 *
 * 낸 횟수는 반영 기록에서 센다. 만들어진 지출을 지워도 기록은 남으므로, 지웠다고
 * 회차가 되돌아가 같은 달이 다시 찍히는 일이 없다 — 반영 기록이 곧 진실이다.
 */
export function describeInstallment(template, applied) {
  const 끝 = lastOccurrenceMonth(template);
  if (!끝) return null;
  const 낸것 = countApplied(template, applied);
  if (낸것 >= template.months) return `${template.months}회 끝남`;
  // 줄이 좁아 끝나는 달은 짧게 적는다. `2027-02` → `27.02`
  return `${낸것}/${template.months}회 · ${끝.slice(2).replace("-", ".")}까지`;
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
