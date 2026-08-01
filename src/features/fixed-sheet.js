import { elements } from "../dom.js";
import { CATEGORIES, formatMoney, formatShortDate } from "../expenses.js";
import { getMemberName } from "../members.js";
import {
  MAX_DAY,
  MIN_DAY,
  collectDueOccurrences,
  firstApplicableMonth,
  isValidDay,
  nextOccurrenceDate,
} from "../fixed-costs.js";
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

let editingFixedId = null;

/**
 * 반영일이 지난 고정비를 실제 지출로 만든다.
 * 만든 뒤에는 평범한 지출이라 수정·삭제가 자유롭고, 반영 기록 덕분에 지워도 되살아나지 않는다.
 * @returns {number} 새로 넣은 건수
 */
export async function applyDueFixedCosts() {
  const due = collectDueOccurrences(getFixedTemplates(), getFixedApplied());
  if (!due.length) return 0;
  return applyOccurrences(due);
}

function renderFixedList() {
  const templates = getFixedTemplates();
  const applied = getFixedApplied();
  const rows = [...templates]
    .sort((a, b) => a.day - b.day || a.item.localeCompare(b.item))
    .map((template) => {
      const next = nextOccurrenceDate(template, applied);
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
              ${escapeHtml(getMemberName(template.member))}<i></i>${category.label}<i></i>${next ? `다음 ${formatShortDate(next)}` : "대기"}
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
  if (template) {
    const radio = elements.fixedForm.querySelector(`input[name="fixed-member"][value="${template.member}"]`);
    if (radio) radio.checked = true;
  }

  elements.fixedDayError.textContent = "";
  elements.fixedItemError.textContent = "";
  elements.fixedAmountError.textContent = "";
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

/** 입력한 날짜로 언제부터 반영되는지 미리 알려준다. */
export function updateFixedHint() {
  const day = Number(elements.fixedDay.value);
  if (!isValidDay(day)) {
    elements.fixedHint.textContent = "";
    return;
  }
  const startMonth = firstApplicableMonth(day);
  const [year, month] = startMonth.split("-").map(Number);
  elements.fixedHint.textContent = `${year}년 ${month}월 ${day}일부터 매월 자동으로 기록됩니다.`;
}

function validateFixedInput({ day, item, amount }) {
  let firstInvalidField = null;

  elements.fixedDayError.textContent = "";
  elements.fixedItemError.textContent = "";
  elements.fixedAmountError.textContent = "";

  if (!isValidDay(day)) {
    elements.fixedDayError.textContent = `${MIN_DAY}~${MAX_DAY} 사이의 날짜를 입력해 주세요.`;
    firstInvalidField = elements.fixedDay;
  }
  if (!item) {
    elements.fixedItemError.textContent = "지출 항목을 입력해 주세요.";
    firstInvalidField = firstInvalidField || elements.fixedItem;
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    elements.fixedAmountError.textContent = "1원 이상의 금액을 입력해 주세요.";
    firstInvalidField = firstInvalidField || elements.fixedAmount;
  }
  return firstInvalidField;
}

export async function handleFixedSubmit(event) {
  event.preventDefault();
  const data = new FormData(elements.fixedForm);
  const input = {
    day: Number(String(data.get("day") || "").replace(/\D/g, "")),
    item: String(data.get("item") || "").trim(),
    amount: Number(String(data.get("amount") || "").replace(/\D/g, "")),
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
    // 시작월은 유지한다. 금액만 고쳤는데 반영 일정이 바뀌면 혼란스럽다.
    startMonth: existing?.startMonth || firstApplicableMonth(input.day),
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
  if ((await applyDueFixedCosts()) > 0) render();
  showToast(existing ? "고정비를 수정했어요. 이미 기록된 지출은 그대로예요" : "고정비를 등록했어요");
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
