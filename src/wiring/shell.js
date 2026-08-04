import { elements } from "../dom.js";
import { undoDelete } from "../features/expense-actions.js";
import { closeForm } from "../features/expense-form.js";
import { closeFixedSheet } from "../features/fixed-sheet.js";
import { closeMonthSheet } from "../features/month-picker.js";
import { closeNagSheet } from "../features/nag.js";
import { closeNotes } from "../features/notes.js";
import { closeResetSheet } from "../features/settings.js";
import { closeTrendSheet } from "../features/trend.js";
import { getOpenPage, hidePage } from "../ui/page.js";
import {
  SHEETS,
  endSheetDrag,
  keepFocusInSheet,
  moveSheetDrag,
  setDismissHandler,
  startSheetDrag,
  trapTab,
} from "../ui/sheet.js";
import { closeOpenRow } from "../ui/swipe.js";

/**
 * 화면 전체에 걸리는 배선.
 *
 * 어느 시트가 열려 있든 같은 방식으로 닫히고, Esc·Tab 은 늘 같게 동작한다.
 * 한 화면에만 걸리는 것은 여기 두지 않는다.
 */

function closeActiveSheet() {
  if (!elements.sheet.hidden) closeForm();
  if (!elements.monthSheet.hidden) closeMonthSheet();
  if (!elements.fixedSheet.hidden) closeFixedSheet();
  if (!elements.notesSheet.hidden) closeNotes();
  if (!elements.nagSheet.hidden) closeNagSheet();
  if (!elements.trendSheet.hidden) closeTrendSheet();
  if (!elements.resetSheet.hidden) closeResetSheet();
}

/* ── 시트 공통: 아래로 끌어 닫기 · 포커스 가두기 ──────────── */

setDismissHandler(closeActiveSheet);
SHEETS.forEach((sheet) => {
  sheet.addEventListener("pointerdown", startSheetDrag);
  sheet.addEventListener("pointermove", moveSheetDrag);
  sheet.addEventListener("pointerup", endSheetDrag);
  sheet.addEventListener("pointercancel", endSheetDrag);
});
elements.backdrop.addEventListener("click", closeActiveSheet);

/* ── 전역 ─────────────────────────────────────────────────── */

elements.undoDelete.addEventListener("click", undoDelete);
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".swipe-row")) closeOpenRow();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    trapTab(event);
    return;
  }
  if (event.key !== "Escape") return;
  // 시트가 전체 화면 위에 뜨므로 위에 있는 것부터 닫는다.
  const sheetOpen = SHEETS.some((sheet) => !sheet.hidden);
  closeActiveSheet();
  closeOpenRow();
  if (!sheetOpen && getOpenPage()) hidePage();
});
document.addEventListener("focusin", keepFocusInSheet);
