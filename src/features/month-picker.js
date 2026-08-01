import { elements } from "../dom.js";
import { MAX_YEAR, MIN_YEAR, clampYear, isValidMonthKey, toMonthKey } from "../expenses.js";
import { render, resetTotalAnimation } from "../render.js";
import { getSelectedMonth, setSelectedMonth } from "../store.js";
import { hideSheet, showSheet } from "../ui/sheet.js";

let pickerYear = new Date().getFullYear();

export function buildMonthGrid() {
  const cells = Array.from({ length: 12 }, (unused, index) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "month-cell";
    cell.dataset.month = String(index + 1).padStart(2, "0");
    cell.textContent = `${index + 1}월`;
    return cell;
  });
  elements.monthGrid.replaceChildren(...cells);
}

function renderMonthGrid() {
  const todayMonth = toMonthKey(new Date());
  const selectedMonth = getSelectedMonth();

  elements.yearLabel.textContent = `${pickerYear}년`;
  elements.prevYear.disabled = pickerYear <= MIN_YEAR;
  elements.nextYear.disabled = pickerYear >= MAX_YEAR;

  elements.monthGrid.querySelectorAll(".month-cell").forEach((cell) => {
    const monthKey = `${pickerYear}-${cell.dataset.month}`;
    const isSelected = monthKey === selectedMonth;
    cell.classList.toggle("is-selected", isSelected);
    cell.classList.toggle("is-today", !isSelected && monthKey === todayMonth);
    if (isSelected) cell.setAttribute("aria-current", "true");
    else cell.removeAttribute("aria-current");
  });
}

export function openMonthSheet() {
  pickerYear = clampYear(Number(getSelectedMonth().slice(0, 4)));
  renderMonthGrid();
  showSheet(elements.monthSheet);
}

export function closeMonthSheet() {
  hideSheet(elements.monthSheet);
}

export function shiftPickerYear(offset) {
  pickerYear = clampYear(pickerYear + offset);
  renderMonthGrid();
}

export function selectMonth(monthKey) {
  if (!isValidMonthKey(monthKey)) return;
  setSelectedMonth(monthKey);
  resetTotalAnimation();
  closeMonthSheet();
  render();
}

/** 좌우 화살표로 한 달씩 이동. 지원 범위를 벗어나면 무시한다. */
export function shiftMonth(offset) {
  const [year, month] = getSelectedMonth().split("-").map(Number);
  const nextMonth = toMonthKey(new Date(year, month - 1 + offset, 1));
  if (!isValidMonthKey(nextMonth)) return;
  setSelectedMonth(nextMonth);
  resetTotalAnimation();
  render();
}

export function getPickerMonthFromCell(cell) {
  return `${pickerYear}-${cell.dataset.month}`;
}
