import { elements } from "../dom.js";
import {
  CATEGORIES,
  formatMoney,
  formatMonth,
  formatShortDate,
  isValidMonthKey,
  shiftMonthKey,
  toMonthKey,
} from "../domain/expenses.js";
import { getMemberName } from "../members.js";
import { isValidAmount, readAmount } from "../domain/money.js";
import {
  MAX_BACKFILL_MONTHS,
  MAX_DAY,
  MIN_DAY,
  collectDueOccurrences,
  countSkippedMonths,
  describeApplied,
  describeInstallment,
  describeSchedule,
  firstApplicableMonth,
  isValidDay,
  nextOccurrenceDate,
} from "../domain/fixed-costs.js";
import { render } from "../render.js";
import {
  applyOccurrences,
  createFixedCost,
  deleteFixedCost,
  getFixedApplied,
  getFixedTemplates,
  updateFixedCost,
} from "../store.js";
import { escapeHtml } from "../ui/escape.js";
import { closeOpenRow, resetSwipeState } from "../ui/swipe.js";
import { hideSheet, showSheet } from "../ui/sheet.js";
import { showToast } from "../ui/toast.js";
import { getProfile } from "./auth.js";

let editingFixedId = null;

/**
 * 시작월을 아직 손대지 않았나. 그동안은 결제일을 따라 계산값으로 움직이고,
 * 한 번 고르면 그 뒤로는 결제일을 고쳐도 고른 달을 지킨다.
 */
let startMonthAuto = true;

/**
 * 할부 회수의 상한. 열 해치다.
 * 그보다 길면 할부라기보다 그냥 고정비고, 오타 하나로 다음 세기까지 안내하는 것을 막는다.
 */
const MAX_MONTHS = 120;

/**
 * 반영일이 지난 고정비를 실제 지출로 만든다.
 * 만든 뒤에는 평범한 지출이라 수정·삭제가 자유롭고, 반영 기록 덕분에 지워도 되살아나지 않는다.
 * @returns {Promise<{created: number, failed: number, skipped: number}>}
 *   skipped 는 창 밖으로 밀려나 영영 채우지 못한 건수. 이번에 잘림이 문 실행에서만 0 이 아니다.
 */
export async function applyDueFixedCosts() {
  const templates = getFixedTemplates();
  const applied = getFixedApplied();
  const due = collectDueOccurrences(templates, applied);
  if (!due.length) return { created: 0, failed: 0, skipped: 0 };
  const skipped = countSkippedMonths(templates, applied, due);
  return { ...(await applyOccurrences(due)), skipped };
}

function renderFixedList() {
  const templates = getFixedTemplates();
  const applied = getFixedApplied();
  const rows = [...templates]
    .sort((a, b) => a.day - b.day || a.item.localeCompare(b.item))
    .map((template) => {
      const next = nextOccurrenceDate(template, applied);
      /*
       * 할부는 몇 회째인지와 언제 끝나는지를 말한다. 그 자리에 다음 반영일까지 함께 넣으면
       * 줄이 넘치는데, 결제일은 왼쪽 칸이 이미 말하고 있어 잃는 것이 없다.
       */
      const 진행 = describeInstallment(template, applied)
        ?? (next ? `다음 ${formatShortDate(next)}` : "대기");
      const category = CATEGORIES[template.category] || CATEGORIES.etc;
      const row = document.createElement("article");
      row.className = "fixed-item swipe-row";
      row.innerHTML = `
        <span class="swipe-actions">
          <button class="swipe-action is-edit" type="button" data-edit-fixed="${escapeHtml(template.id)}" aria-label="${escapeHtml(template.item)} 수정">수정</button>
          <button class="swipe-action is-delete" type="button" data-remove-fixed="${escapeHtml(template.id)}" aria-label="${escapeHtml(template.item)} 삭제">삭제</button>
        </span>
        <div class="fixed-surface swipe-surface">
          <span class="fixed-day">${template.day}일</span>
          <div class="fixed-copy">
            <strong>${escapeHtml(template.item)}</strong>
            <span>
              ${escapeHtml(getMemberName(template.member))}<i></i>${category.label}<i></i>${진행}
            </span>
          </div>
          <strong class="fixed-amount">${formatMoney(template.amount)}원</strong>
        </div>
      `;
      return row;
    });

  resetSwipeState();
  elements.fixedList.replaceChildren(...rows);
}

function showListView() {
  editingFixedId = null;
  elements.fixedListView.hidden = false;
  elements.fixedForm.hidden = true;
  renderFixedList();
}

/**
 * 시작월 후보를 채운다. 이번 달을 가운데 두고 앞뒤로 편다.
 *
 * 뒤로는 소급 창까지만 편다 — 그보다 앞은 고를 수는 있어도 채워지지 않아,
 * 고른 사람만 모르는 빈 달이 생긴다. 앞으로는 한 해면 카드 첫 청구가 밀리는 경우를 덮는다.
 *
 * @param {string} [keep] 고치는 중인 고정비의 시작월. 창 밖이어도 목록에 남겨 둔다 —
 *   빠져 있으면 금액만 고치고 저장해도 시작월이 조용히 다른 달로 바뀐다.
 */
function fillStartMonthOptions(keep) {
  const thisMonth = toMonthKey(new Date());
  const 후보 = [];
  for (let i = -MAX_BACKFILL_MONTHS; i <= 12; i += 1) 후보.push(shiftMonthKey(thisMonth, i));
  if (keep && !후보.includes(keep)) 후보.unshift(keep);

  elements.fixedStartMonth.replaceChildren(...후보.map((monthKey) => {
    const option = document.createElement("option");
    option.value = monthKey;
    option.textContent = formatMonth(monthKey);
    return option;
  }));
}

/** 적은 개월 수. 비워 두면 null — 그 비움이 곧 "끝이 없다"(구독)는 뜻이다. */
function readMonths(text) {
  const 숫자만 = String(text ?? "").replace(/\D/g, "");
  return 숫자만 ? Number(숫자만) : null;
}

/** @param {object|null} template 넘기면 수정 모드로 연다. */
export function showFormView(template = null) {
  editingFixedId = template?.id || null;
  elements.fixedForm.reset();

  elements.fixedFormMode.textContent = template ? "고정비 수정" : "새 고정비";
  elements.fixedSubmitLabel.textContent = template ? "변경사항 저장" : "고정비 저장";
  elements.fixedDay.value = template ? String(template.day) : "";
  elements.fixedItem.value = template?.item || "";
  elements.fixedAmount.value = template ? formatMoney(template.amount) : "";
  elements.fixedCategory.value = template?.category || "housing";
  elements.fixedMonths.value = template?.months ? String(template.months) : "";
  /*
   * 고칠 때는 원래 시작월을 그대로 보여 준다. 새로 등록할 때는 결제일을 적는 대로
   * 계산값이 따라오게 두고(updateFixedHint), 사람이 고르면 거기서 멈춘다.
   */
  startMonthAuto = !template;
  fillStartMonthOptions(template?.startMonth);
  elements.fixedStartMonth.value = template?.startMonth || toMonthKey(new Date());
  // 지출 폼과 같은 규칙: 새로 등록하면 로그인한 사람, 고칠 때는 원래 결제자를 유지한다.
  const defaultMember = template?.member || getProfile()?.id;
  const radio = elements.fixedForm.querySelector(`input[name="fixed-member"][value="${defaultMember}"]`);
  if (radio) radio.checked = true;

  elements.fixedDayError.textContent = "";
  elements.fixedItemError.textContent = "";
  elements.fixedAmountError.textContent = "";
  elements.fixedMonthsError.textContent = "";
  updateFixedHint();

  elements.fixedListView.hidden = true;
  elements.fixedForm.hidden = false;
  elements.fixedForm.scrollTop = 0;
  setTimeout(() => elements.fixedDay.focus(), 60);
}

export function editFixedTemplate(id) {
  const template = getFixedTemplates().find((current) => current.id === id);
  closeOpenRow();
  if (template) showFormView(template);
}

export function openFixedSheet() {
  showListView();
  showSheet(elements.fixedSheet);
}

export function closeFixedSheet() {
  hideSheet(elements.fixedSheet, showListView);
}

/** 적은 것으로 언제부터 언제까지 반영되는지 미리 알려준다. 문구는 describeSchedule 이 짓는다. */
export function updateFixedHint() {
  const day = Number(elements.fixedDay.value);
  // 아직 안 고른 시작월은 결제일을 따라 움직인다. 25일을 적으면 25일 기준으로 다시 잡힌다.
  if (startMonthAuto && isValidDay(day)) elements.fixedStartMonth.value = firstApplicableMonth(day);
  elements.fixedHint.textContent = describeSchedule({
    day,
    startMonth: elements.fixedStartMonth.value,
    months: readMonths(elements.fixedMonths.value),
  });
}

/** 시작월을 직접 골랐다. 그 뒤로는 결제일을 고쳐도 고른 달을 지킨다. */
export function pickFixedStartMonth() {
  startMonthAuto = false;
  updateFixedHint();
}

function validateFixedInput({ day, item, amount, months }) {
  let firstInvalidField = null;

  elements.fixedDayError.textContent = "";
  elements.fixedItemError.textContent = "";
  elements.fixedAmountError.textContent = "";
  elements.fixedMonthsError.textContent = "";

  if (!isValidDay(day)) {
    elements.fixedDayError.textContent = `${MIN_DAY}~${MAX_DAY} 사이의 날짜를 입력해 주세요.`;
    firstInvalidField = elements.fixedDay;
  }
  if (!item) {
    elements.fixedItemError.textContent = "지출 항목을 입력해 주세요.";
    firstInvalidField = firstInvalidField || elements.fixedItem;
  }
  if (!isValidAmount(amount)) {
    elements.fixedAmountError.textContent = "1원 이상의 금액을 입력해 주세요.";
    firstInvalidField = firstInvalidField || elements.fixedAmount;
  }
  // 비워 두는 것은 무기한이라는 뜻이라 통과시킨다. 적었다면 실제 할부 회수여야 한다.
  if (months !== null && (months < 1 || months > MAX_MONTHS)) {
    elements.fixedMonthsError.textContent = `1~${MAX_MONTHS} 사이로 적거나, 끝이 없으면 비워 주세요.`;
    firstInvalidField = firstInvalidField || elements.fixedMonths;
  }
  return firstInvalidField;
}

export async function handleFixedSubmit(event) {
  event.preventDefault();
  const data = new FormData(elements.fixedForm);
  const input = {
    day: Number(String(data.get("day") || "").replace(/\D/g, "")),
    item: String(data.get("item") || "").trim(),
    amount: readAmount(data.get("amount")),
    months: readMonths(data.get("months")),
    startMonth: String(data.get("startMonth") || ""),
  };

  const firstInvalidField = validateFixedInput(input);
  if (firstInvalidField) {
    firstInvalidField.focus();
    return;
  }

  const existing = editingFixedId
    ? getFixedTemplates().find((current) => current.id === editingFixedId)
    : null;
  const template = {
    member: String(data.get("fixed-member")),
    category: String(data.get("category")),
    item: input.item,
    amount: input.amount,
    day: input.day,
    /*
     * 시작월은 폼이 정한다. 계산값이 늘 맞지는 않기 때문이다 — 9월 22일에 결제일 25일로
     * 등록하면 9월을 잡는데, 카드 첫 청구가 10월이면 한 달이 통째로 어긋난다.
     * 고칠 때도 폼이 원래 달을 그대로 담고 있어, 금액만 고치면 일정은 움직이지 않는다.
     */
    startMonth: isValidMonthKey(input.startMonth) ? input.startMonth : firstApplicableMonth(input.day),
    months: input.months,
  };

  elements.fixedSubmit.disabled = true;
  try {
    if (existing) await updateFixedCost(existing.id, template);
    else await createFixedCost(template);
  } catch (error) {
    showToast(error.message);
    return;
  } finally {
    elements.fixedSubmit.disabled = false;
  }

  showListView();
  // 등록·수정 직후 반영일이 이미 지난 달이 있을 수 있다.
  const applied = await applyDueFixedCosts();
  if (applied.created > 0) render();
  // 반영에 실패한 게 있으면 등록 성공만 알리고 넘어가지 않는다.
  const notice = describeApplied(applied);
  showToast(
    notice ?? (existing ? "고정비를 수정했어요. 이미 기록된 지출은 그대로예요" : "고정비를 등록했어요"),
  );
}

export async function removeFixedTemplate(id) {
  if (!getFixedTemplates().some((template) => template.id === id)) return;

  try {
    await deleteFixedCost(id);
  } catch (error) {
    showToast(error.message);
    return;
  }
  renderFixedList();
  // 이미 만들어진 지출은 그대로 둔다. 지난 달 기록을 지우면 가계부가 어긋난다.
  showToast("고정비를 삭제했어요. 이미 기록된 지출은 그대로예요");
}

/**
 * 상대가 고정비를 바꿨을 때. 열어 둔 목록만 지금 것으로 맞춘다.
 *
 * 폼을 쓰는 중이면 건드리지 않는다 — 적던 내용이 사라진다.
 * 그 사이 상대가 지운 고정비를 저장하려 하면 서버가 막고 까닭을 알려 준다.
 */
export function refreshFixedSheet() {
  if (elements.fixedSheet.hidden || !elements.fixedForm.hidden) return;
  renderFixedList();
}
