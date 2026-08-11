import { elements } from "../dom.js";
import { closeForm, handleSubmit, syncDateDisplay, syncGoalNotice } from "../features/expense-form.js";
import {
  closeFixedSheet,
  editFixedTemplate,
  handleFixedSubmit,
  openFixedSheet,
  removeFixedTemplate,
  showFormView,
  updateFixedHint,
} from "../features/fixed-sheet.js";
import { formatAmountInput } from "../domain/money.js";
import { closeOnPress } from "../ui/sheet.js";
import { cancelSwipe, endSwipe, moveSwipe, startSwipe } from "../ui/swipe.js";

/**
 * 무언가를 적는 자리의 배선 — 지출 입력 폼과 고정비 시트.
 */

/* ── 지출 입력 폼 ─────────────────────────────────────────── */

elements.form.addEventListener("submit", handleSubmit);
closeOnPress(elements.closeForm, closeForm);

// 금액·날짜·결제자 중 무엇이 바뀌어도 남은 목표의 기준이 달라진다.
const syncDate = () => {
  syncDateDisplay();
  syncGoalNotice();
};
elements.date.addEventListener("change", syncDate);
elements.date.addEventListener("input", syncDate);
elements.form.querySelectorAll('input[name="member"]').forEach((radio) => {
  radio.addEventListener("change", syncGoalNotice);
});
elements.amount.addEventListener("input", (event) => {
  event.target.value = formatAmountInput(event.target.value);
  elements.amountError.textContent = "";
  syncGoalNotice();
});
elements.item.addEventListener("input", () => {
  elements.itemError.textContent = "";
});

/* ── 고정비 ───────────────────────────────────────────────── */

elements.openFixedSheet.addEventListener("click", openFixedSheet);
closeOnPress(elements.closeFixedSheet, closeFixedSheet);
elements.addFixed.addEventListener("click", () => showFormView());
elements.cancelFixed.addEventListener("click", openFixedSheet);
elements.fixedForm.addEventListener("submit", handleFixedSubmit);
elements.fixedDay.addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 2);
  elements.fixedDayError.textContent = "";
  updateFixedHint();
});
elements.fixedAmount.addEventListener("input", (event) => {
  event.target.value = formatAmountInput(event.target.value);
  elements.fixedAmountError.textContent = "";
});
elements.fixedItem.addEventListener("input", () => {
  elements.fixedItemError.textContent = "";
});
elements.fixedList.addEventListener("pointerdown", startSwipe);
elements.fixedList.addEventListener("pointermove", moveSwipe);
elements.fixedList.addEventListener("pointerup", endSwipe);
elements.fixedList.addEventListener("pointercancel", cancelSwipe);
elements.fixedList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-fixed]");
  if (editButton) {
    editFixedTemplate(editButton.dataset.editFixed);
    return;
  }
  const removeButton = event.target.closest("[data-remove-fixed]");
  if (removeButton) removeFixedTemplate(removeButton.dataset.removeFixed);
});
