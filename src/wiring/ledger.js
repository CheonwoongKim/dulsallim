import { elements } from "../dom.js";
import {
  copyExpense,
  deleteExpense,
  toggleDateFilter,
  toggleMemberFilter,
  toggleView,
} from "../features/expense-actions.js";
import { openForm } from "../features/expense-form.js";
import {
  closeMonthSheet,
  getPickerMonthFromCell,
  openMonthSheet,
  selectMonth,
  shiftMonth,
  shiftPickerYear,
} from "../features/month-picker.js";
import { openNotes } from "../features/notes.js";
import { getExpenses } from "../store.js";
import { closeOnPress } from "../ui/sheet.js";
import {
  cancelSwipe,
  closeOpenRow,
  didJustSwipe,
  endSwipe,
  hasOpenRow,
  moveSwipe,
  setRowOpen,
  startSwipe,
} from "../ui/swipe.js";

/**
 * 본 화면 배선 — 달·사람 고르기, 목록과 캘린더.
 */

/* ── 상단: 사람 필터 · 월 이동 ─────────────────────────────── */

elements.memberSlots.forEach(({ row }) => {
  row.addEventListener("click", () => toggleMemberFilter(row.dataset.member));
});
elements.prevMonth.addEventListener("click", () => shiftMonth(-1));
elements.nextMonth.addEventListener("click", () => shiftMonth(1));

/* ── 목록 / 캘린더 ────────────────────────────────────────── */

elements.viewToggle.forEach((button) => {
  button.addEventListener("click", () => toggleView(button.dataset.view));
});
elements.calendar.addEventListener("click", (event) => {
  const cell = event.target.closest(".calendar-cell[data-date]");
  if (cell) toggleDateFilter(cell.dataset.date);
});

/* ── 월 선택 시트 ─────────────────────────────────────────── */

elements.monthTrigger.addEventListener("click", openMonthSheet);
closeOnPress(elements.closeMonthSheet, closeMonthSheet);
elements.prevYear.addEventListener("click", () => shiftPickerYear(-1));
elements.nextYear.addEventListener("click", () => shiftPickerYear(1));
elements.monthGrid.addEventListener("click", (event) => {
  const cell = event.target.closest(".month-cell");
  if (cell) selectMonth(getPickerMonthFromCell(cell));
});

/* ── 목록: 스와이프 · 수정 · 삭제 ─────────────────────────── */

elements.list.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-form]")) {
    openForm();
    return;
  }
  const copyButton = event.target.closest("[data-copy-id]");
  if (copyButton) {
    copyExpense(copyButton.dataset.copyId);
    return;
  }
  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    const expense = getExpenses().find((current) => current.id === editButton.dataset.editId);
    closeOpenRow();
    if (expense) openForm(expense);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) {
    deleteExpense(deleteButton.dataset.deleteId);
    return;
  }
  // 스와이프 끝에도 click이 따라온다. 이걸 먼저 걸러야 한다.
  // 아래 두 갈래보다 뒤에 두면 방금 스와이프로 연 행이 이 click에 곧바로 닫힌다.
  if (didJustSwipe()) return;
  // 열려 있는 행이 있으면 이번 탭은 그걸 닫는 데 쓴다.
  if (hasOpenRow()) {
    closeOpenRow();
    return;
  }
  const row = event.target.closest(".expense-item");
  if (row) openNotes(row.dataset.id);
});
elements.list.addEventListener("pointerdown", startSwipe);
elements.list.addEventListener("pointermove", moveSwipe);
elements.list.addEventListener("pointerup", endSwipe);
elements.list.addEventListener("pointercancel", cancelSwipe);
// 키보드로 수정·삭제 버튼에 도달하면 해당 행을 열어 보이게 한다.
elements.list.addEventListener("focusin", (event) => {
  const item = event.target.closest(".swipe-row");
  if (item && event.target.closest(".swipe-actions")) setRowOpen(item, true);
});
