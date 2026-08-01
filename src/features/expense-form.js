import { elements } from "../dom.js";
import {
  MAX_YEAR,
  MIN_YEAR,
  formatMonth,
  formatMoney,
  isFutureDateKey,
  isValidDateKey,
  toDateKey,
  toMonthKey,
} from "../expenses.js";
import { render } from "../render.js";
import {
  addExpense,
  editExpense,
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
  const [year, month] = selectedMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
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

export function openForm(expense = null) {
  editingExpenseId = expense?.id || null;
  elements.form.reset();
  elements.formEyebrow.textContent = expense ? "기록 수정" : "새로운 기록";
  elements.formTitle.textContent = expense ? "내용을 수정할까요?" : "어디에 썼나요?";
  elements.submitLabel.textContent = expense ? "변경사항 저장" : "지출 추가하기";
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
    amount: Number(String(data.get("amount") || "").replace(/\D/g, "")),
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
  if (!Number.isSafeInteger(amount) || amount <= 0) {
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
