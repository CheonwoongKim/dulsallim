import { elements } from "../dom.js";
import {
  MAX_YEAR,
  MIN_YEAR,
  formatMonth,
  formatMoney,
  isFutureDateKey,
  getMonthlyExpenses,
  isValidDateKey,
  lastDayOfMonth,
  summarizeGoal,
  toDateKey,
  toMonthKey,
} from "../domain/expenses.js";
import { getMemberGoal } from "../members.js";
import { isValidAmount, readAmount } from "../domain/money.js";
import { render } from "../render.js";
import {
  addExpense,
  editExpense,
  getExpenses,
  getSelectedMonth,
  setHighlightId,
  setMemberFilter,
  setSelectedMonth,
} from "../store.js";
import { hideSheet, showSheet } from "../ui/sheet.js";
import { getProfile } from "./auth.js";
import { showToast } from "../ui/toast.js";

const FOCUS_DELAY_MS = 260;

let editingExpenseId = null;

/** 이번 달을 보고 있으면 오늘, 지난 달을 보고 있으면 그 달 마지막 날을 기본값으로 준다. */
function getDefaultDate() {
  const selectedMonth = getSelectedMonth();
  if (selectedMonth === toMonthKey(new Date())) return toDateKey(new Date());
  const lastDay = lastDayOfMonth(selectedMonth);
  return `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;
}

export function syncDateDisplay() {
  const value = elements.date.value;
  // 미래 날짜는 막지 않는다(예약 결제 등). 대신 연도 오타를 알아채도록 알려준다.
  elements.dateNotice.textContent = isFutureDateKey(value) ? "오늘 이후 날짜예요. 맞는지 확인해 주세요." : "";

  if (!value) {
    elements.dateDisplay.textContent = "날짜 선택";
    return;
  }
  const [year, month, day] = value.split("-").map(Number);
  elements.dateDisplay.textContent = `${year}년 ${month}월 ${day}일`;
}

/**
 * 금액칸 아래에 "이거 저장하면 얼마 남는지"를 보여 준다.
 *
 * 다 쓰고 나서 아는 것보다 쓰기 직전에 아는 편이 쓸모 있다.
 * 기준은 폼에서 고른 결제자다. 로그인한 사람으로 고정하면 결제자를 바꿨을 때 숫자가 어긋난다.
 */
export function syncGoalNotice() {
  const data = new FormData(elements.form);
  const memberId = String(data.get("member") || "");
  const date = String(data.get("date") || "");

  // 목표는 값이 하나뿐이라 지난 달을 "지금의 목표"로 판정하게 된다. 틀린 말을 하느니 아무 말도 안 한다.
  const isThisMonth = isValidDateKey(date) && date.slice(0, 7) === toMonthKey(new Date());
  const status = isThisMonth
    ? summarizeGoal({
        monthly: getMonthlyExpenses(getExpenses(), date.slice(0, 7)),
        memberId,
        goal: getMemberGoal(memberId),
        draft: readAmount(data.get("amount")),
        excludeId: editingExpenseId,
      })
    : null;

  if (!status) {
    elements.goalNotice.textContent = "";
    elements.goalNotice.hidden = true;
    return;
  }

  elements.goalNotice.hidden = false;
  elements.goalNotice.classList.toggle("is-over", status.over);
  elements.goalNotice.textContent = status.over
    ? `목표 초과 ${formatMoney(-status.remaining)}원`
    : `남은 목표 ${formatMoney(status.remaining)}원 · ${status.percent}%`;
}

/**
 * @param {object|null} draft 채워 넣을 값
 * @param {{editing?: boolean}} [options]
 *   editing이 false면 값만 가져오고 새 기록으로 남는다(복제).
 *   비워 둔 항목은 아래 기본값이 채운다 — 날짜는 오늘, 결제자는 로그인한 사람.
 */
export function openForm(draft = null, { editing = Boolean(draft) } = {}) {
  const expense = draft;
  editingExpenseId = editing ? expense.id : null;
  elements.form.reset();
  elements.formEyebrow.textContent = editing ? "기록 수정" : "새로운 기록";
  elements.formTitle.textContent = editing ? "내용을 수정할까요?" : "어디에 썼나요?";
  elements.submitLabel.textContent = editing ? "변경사항 저장" : "지출 추가하기";
  elements.date.value = expense?.date || getDefaultDate();
  syncDateDisplay();
  elements.category.value = expense?.category || "food";
  elements.item.value = expense?.item || "";
  elements.amount.value = expense ? formatMoney(expense.amount) : "";
  // 새로 적을 때는 로그인한 사람이 결제자다. 대부분 자기가 쓴 걸 적으므로 매번 고르지 않아도 된다.
  const defaultMember = expense?.member || getProfile()?.id;
  const memberRadio = elements.form.querySelector(`input[name="member"][value="${defaultMember}"]`);
  if (memberRadio) memberRadio.checked = true;
  elements.dateError.textContent = "";
  elements.itemError.textContent = "";
  elements.amountError.textContent = "";
  syncGoalNotice();
  elements.form.scrollTop = 0;
  showSheet(elements.sheet);
  setTimeout(() => elements.item.focus(), FOCUS_DELAY_MS);
}

export function closeForm() {
  hideSheet(elements.sheet, () => {
    editingExpenseId = null;
  });
}

function readForm() {
  const data = new FormData(elements.form);
  return {
    date: String(data.get("date") || ""),
    member: String(data.get("member")),
    category: String(data.get("category")),
    item: String(data.get("item") || "").trim(),
    amount: readAmount(data.get("amount")),
  };
}

/** 잘못된 필드가 있으면 첫 번째 필드를 돌려주고, 없으면 null. */
function validateExpenseInput({ date, item, amount }) {
  let firstInvalidField = null;

  elements.dateError.textContent = "";
  elements.itemError.textContent = "";
  elements.amountError.textContent = "";

  if (!isValidDateKey(date)) {
    elements.dateError.textContent = `${MIN_YEAR}~${MAX_YEAR}년 사이의 날짜를 선택해 주세요.`;
    firstInvalidField = elements.date;
  }
  if (!item) {
    elements.itemError.textContent = "지출 항목을 입력해 주세요.";
    firstInvalidField = firstInvalidField || elements.item;
  }
  if (!isValidAmount(amount)) {
    elements.amountError.textContent = "1원 이상의 금액을 입력해 주세요.";
    firstInvalidField = firstInvalidField || elements.amount;
  }
  return firstInvalidField;
}

export async function handleSubmit(event) {
  event.preventDefault();
  const input = readForm();
  const firstInvalidField = validateExpenseInput(input);

  if (firstInvalidField) {
    firstInvalidField.focus();
    return;
  }

  const isEditing = Boolean(editingExpenseId);
  // 서버 응답을 기다리는 동안 같은 버튼을 또 누르면 같은 지출이 두 번 기록된다.
  elements.submit.disabled = true;

  let saved;
  try {
    saved = isEditing ? await editExpense(editingExpenseId, input) : await addExpense(input);
  } catch (error) {
    showToast(error.message);
    return;
  } finally {
    elements.submit.disabled = false;
  }

  setSelectedMonth(saved.date.slice(0, 7));
  // 필터가 걸린 채로 다른 사람 지출을 저장하면 방금 넣은 기록이 안 보인다.
  setMemberFilter(null);
  setHighlightId(saved.id);
  closeForm();
  render();

  // 이번 달이 아닌 곳에 들어갔으면 어느 달인지 밝혀 오타를 한 번 더 걸러낸다.
  const targetMonth = saved.date.slice(0, 7);
  const monthLabel = targetMonth === toMonthKey(new Date()) ? "" : `${formatMonth(targetMonth)} `;
  showToast(isEditing ? `${monthLabel}지출 내역을 수정했어요` : `${monthLabel}지출을 기록했어요`);
}
