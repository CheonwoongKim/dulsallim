import { closeFilterSheet } from "../features/filter-sheet.js";
import { elements } from "../dom.js";
import { undoDelete } from "../features/expense-actions.js";
import { closeForm } from "../features/expense-form.js";
import { closeFixedSheet } from "../features/fixed-sheet.js";
import { closeMonthSheet } from "../features/month-picker.js";
import { closeNagSheet } from "../features/nag.js";
import { closeNotes } from "../features/notes.js";
import { closeResetSheet } from "../features/settings.js";
import { closeTrendSheet } from "../features/trend.js";
import { closeAchieveSheet, closeDropSheet, closeWishDetail, closeWishMenu, closeWishSheet } from "../features/wish.js";
import { getOpenPage, hidePage } from "../ui/page.js";
import {
  SHEETS,
  endSheetDrag,
  moveSheetDrag,
  setDismissHandler,
  startSheetDrag,
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
  if (!elements.filterSheet.hidden) closeFilterSheet();
  if (!elements.fixedSheet.hidden) closeFixedSheet();
  if (!elements.notesSheet.hidden) closeNotes();
  if (!elements.nagSheet.hidden) closeNagSheet();
  if (!elements.trendSheet.hidden) closeTrendSheet();
  if (!elements.resetSheet.hidden) closeResetSheet();
  if (!elements.wishSheet.hidden) closeWishSheet();
  if (!elements.wishDetailSheet.hidden) closeWishDetail();
  if (!elements.wishMenuSheet.hidden) closeWishMenu();
  if (!elements.wishDropSheet.hidden) closeDropSheet();
  if (!elements.wishAchieveSheet.hidden) closeAchieveSheet();
}

/* ── 시트 공통: 아래로 끌어 닫기 · 포커스 가두기 ──────────── */

setDismissHandler(closeActiveSheet);
SHEETS.forEach((sheet) => {
  sheet.addEventListener("pointerdown", startSheetDrag);
  sheet.addEventListener("pointermove", moveSheetDrag);
  sheet.addEventListener("pointerup", endSheetDrag);
  sheet.addEventListener("pointercancel", endSheetDrag);
});
/*
 * 배경을 눌러 닫기, 그리고 Esc.
 *
 * 시트는 <dialog> 라 열릴 때 top layer 로 올라간다. 그 자리에서는 배경 쪽 누름도
 * 시트 자신에게 오므로(event.target === sheet) 따로 배경 요소를 둘 필요가 없다.
 * Esc 는 브라우저가 스스로 닫으려 하는데, 그러면 연출도 잠금 해제도 건너뛴다.
 * 막아 두고 우리 닫는 길로 되돌린다.
 */
SHEETS.forEach((sheet) => {
  sheet.addEventListener("click", (event) => {
    /*
     * 시트 자신이 잡혔다고 다 배경은 아니다. 시트의 자기 여백 — 맨 위 손잡이가 놓인
     * 13px 띠 — 을 눌러도 여기로 온다. 그대로 닫으면 적다 만 폼이 손잡이를 잡는 순간 날아간다.
     * 눌린 자리가 시트 상자 밖일 때만 배경이다.
     */
    if (event.target !== sheet || event.detail === 0) return;
    const 상자 = sheet.getBoundingClientRect();
    const 밖 =
      event.clientY < 상자.top ||
      event.clientY > 상자.bottom ||
      event.clientX < 상자.left ||
      event.clientX > 상자.right;
    if (밖) closeActiveSheet();
  });
  sheet.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeActiveSheet();
  });
});

/* ── 전역 ─────────────────────────────────────────────────── */

elements.undoDelete.addEventListener("click", undoDelete);
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".swipe-row")) closeOpenRow();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // 시트가 열려 있으면 브라우저가 cancel 로 알려 준다. 여기서 또 닫으면 두 번 닫힌다.
  if (SHEETS.some((sheet) => sheet.open)) return;
  closeOpenRow();
  if (getOpenPage()) hidePage();
});
