import "./style.css";

import { elements } from "./dom.js";
import { formatMoney } from "./expenses.js";
import { paintMembers, render, resetTotalAnimation } from "./render.js";
import { clearData, getExpenses, loadAll, reloadExpenses } from "./store.js";
import { subscribeExpenses, subscribeNotes, unsubscribe } from "./data/remote.js";
import {
  copyExpense,
  deleteExpense,
  toggleDateFilter,
  toggleMemberFilter,
  toggleView,
  undoDelete,
} from "./features/expense-actions.js";
import {
  closeForm,
  handleSubmit,
  openForm,
  syncDateDisplay,
  syncGoalNotice,
} from "./features/expense-form.js";
import {
  buildMonthGrid,
  closeMonthSheet,
  getPickerMonthFromCell,
  openMonthSheet,
  selectMonth,
  shiftMonth,
  shiftPickerYear,
} from "./features/month-picker.js";
import {
  SHEETS,
  beginSettle,
  closeOnPress,
  endSheetDrag,
  keepFocusInSheet,
  moveSheetDrag,
  setDismissHandler,
  startSheetDrag,
  trapTab,
} from "./ui/sheet.js";
import {
  cancelSwipe,
  closeOpenRow,
  didJustSwipe,
  endSwipe,
  hasOpenRow,
  moveSwipe,
  setRowOpen,
  startSwipe,
} from "./ui/swipe.js";
import { closePageNow, getOpenPage, hidePage } from "./ui/page.js";
import {
  handleGoalInput,
  handleNameInput,
  handleProfileSubmit,
  openProfilePage,
  pickColor,
} from "./features/profile.js";
import { handleReset, openSettingsPage, syncResetButton } from "./features/settings.js";
import {
  cancelEdit,
  editNag,
  handleNagSubmit,
  openNagPage,
  removeNag,
  toggleNagEnabled,
} from "./features/nag.js";
import { openAnalysisPage, shiftAnalysisMonth, toggleCompare } from "./features/analysis.js";
import { closeNotes, handleNoteSubmit, openNotes, receiveNote } from "./features/notes.js";
import { showToast } from "./ui/toast.js";
import {
  getProfile,
  isReady,
  rememberEmail,
  restoreSession,
  showApp,
  showConfigError,
  showLoginScreen,
  signIn,
  signOut,
} from "./features/auth.js";
import {
  applyDueFixedCosts,
  closeFixedSheet,
  editFixedTemplate,
  handleFixedSubmit,
  openFixedSheet,
  removeFixedTemplate,
  showFormView,
  updateFixedHint,
} from "./features/fixed-sheet.js";

const AMOUNT_MAX_DIGITS = 12;

function closeActiveSheet() {
  if (!elements.sheet.hidden) closeForm();
  if (!elements.monthSheet.hidden) closeMonthSheet();
  if (!elements.fixedSheet.hidden) closeFixedSheet();
  if (!elements.notesSheet.hidden) closeNotes();
}

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

/* ── 시트 공통: 아래로 끌어 닫기 · 포커스 가두기 ──────────── */

setDismissHandler(closeActiveSheet);
SHEETS.forEach((sheet) => {
  sheet.addEventListener("pointerdown", startSheetDrag);
  sheet.addEventListener("pointermove", moveSheetDrag);
  sheet.addEventListener("pointerup", endSheetDrag);
  sheet.addEventListener("pointercancel", endSheetDrag);
});
elements.backdrop.addEventListener("click", closeActiveSheet);

/* ── 지출 입력 폼 ─────────────────────────────────────────── */

elements.form.addEventListener("submit", handleSubmit);
// 포커스가 폼 밖으로 나가면 키보드가 내려가며 레이아웃이 흔들린다. 그 사이 오탭을 막는다.
[elements.form, elements.fixedForm].forEach((form) => {
  form.addEventListener("focusout", (event) => {
    if (form.contains(event.relatedTarget)) return;
    beginSettle(form);
  });
});
closeOnPress(elements.closeForm, closeForm);

/* ── 마이페이지 · 설정 ────────────────────────────────────── */

elements.openAnalysis.addEventListener("click", openAnalysisPage);
elements.analysisPrev.addEventListener("click", () => {
  shiftAnalysisMonth(-1);
  render();
});
elements.analysisNext.addEventListener("click", () => {
  shiftAnalysisMonth(1);
  render();
});
elements.compareList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-compare]");
  if (button && !button.disabled) {
    toggleCompare(button.dataset.compare);
    render();
  }
});
elements.analysisMembers.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-member]");
  // 요약 카드를 누르는 것과 같은 상태다. 여기서 고르면 본 화면 목록에도 그대로 걸린다.
  if (button) toggleMemberFilter(button.dataset.member || null);
});
elements.openProfile.addEventListener("click", openProfilePage);
elements.openSettings.addEventListener("click", openSettingsPage);
elements.pages.forEach((page) => {
  page.querySelector("[data-close-page]").addEventListener("click", hidePage);
});
elements.profileForm.addEventListener("submit", handleProfileSubmit);
elements.profileName.addEventListener("input", handleNameInput);
elements.profileGoal.addEventListener("input", handleGoalInput);
elements.profilePalette.addEventListener("click", (event) => {
  const swatch = event.target.closest(".swatch");
  if (swatch) pickColor(swatch.dataset.color);
});
elements.openNag.addEventListener("click", openNagPage);
elements.nagEnabled.addEventListener("change", (event) => toggleNagEnabled(event.target.checked));
elements.nagForm.addEventListener("submit", handleNagSubmit);
elements.nagCancel.addEventListener("click", cancelEdit);
elements.nagPercent.addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 3);
  elements.nagError.textContent = "";
});
elements.nagBody.addEventListener("input", () => {
  elements.nagError.textContent = "";
});
elements.nagList.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-nag]");
  if (edit) {
    editNag(edit.dataset.editNag);
    return;
  }
  const remove = event.target.closest("[data-remove-nag]");
  if (remove) removeNag(remove.dataset.removeNag);
});
elements.resetForm.addEventListener("submit", handleReset);
elements.resetConfirm.addEventListener("input", syncResetButton);

/* ── 대화 ─────────────────────────────────────────────────── */

elements.noteForm.addEventListener("submit", handleNoteSubmit);
closeOnPress(elements.closeNotes, closeNotes);

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
  const digits = event.target.value.replace(/\D/g, "").slice(0, AMOUNT_MAX_DIGITS);
  event.target.value = digits ? formatMoney(Number(digits)) : "";
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
  const digits = event.target.value.replace(/\D/g, "").slice(0, AMOUNT_MAX_DIGITS);
  event.target.value = digits ? formatMoney(Number(digits)) : "";
  elements.amountError.textContent = "";
  syncGoalNotice();
});
elements.item.addEventListener("input", () => {
  elements.itemError.textContent = "";
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

/* ── 로그인 ───────────────────────────────────────────────── */

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;

  if (!email || !password) {
    elements.loginError.textContent = "이메일과 비밀번호를 모두 입력해 주세요.";
    (email ? elements.loginPassword : elements.loginEmail).focus();
    return;
  }

  elements.loginError.textContent = "";
  elements.loginSubmit.disabled = true;
  elements.loginSubmitLabel.textContent = "확인하는 중…";

  try {
    await signIn(email, password);
    // 로그인이 된 이메일만 기억한다. 오타를 기억해 두면 다음에도 그대로 막힌다.
    rememberEmail(elements.rememberEmail.checked ? email : null);
    await startApp();
  } catch (error) {
    elements.loginError.textContent = error.message;
    elements.loginPassword.value = "";
    elements.loginPassword.focus();
  } finally {
    elements.loginSubmit.disabled = false;
    elements.loginSubmitLabel.textContent = "로그인";
  }
});

elements.signOut.addEventListener("click", async () => {
  unsubscribe(channel);
  unsubscribe(noteChannel);
  clearTimeout(syncTimer);
  channel = null;
  noteChannel = null;
  closePageNow();
  clearData();
  // 사본만 비우면 화면에는 앞사람 기록이 그대로 남는다. 지운 상태로 한 번 그려서 흔적을 없앤다.
  resetTotalAnimation();
  render();
  elements.dataGate.hidden = true;
  await signOut();
  showLoginScreen();
});

/* ── 시작 ─────────────────────────────────────────────────── */

/** 상대 폰의 변경을 몰아서 한 번만 반영한다. 한 건씩 다시 읽으면 목록이 계속 껌뻑인다. */
const SYNC_DEBOUNCE_MS = 400;

let wired = false;
let channel = null;
let noteChannel = null;
let syncTimer = null;

function showDataGate(message, canRetry = false) {
  elements.dataGate.hidden = false;
  elements.authGate.hidden = true;
  elements.appShell.hidden = true;
  elements.dataStatus.textContent = message;
  elements.retryLoad.hidden = !canRetry;
}

function wireOnce() {
  if (wired) return;
  wired = true;
  document.querySelectorAll("[data-open-form]").forEach((button) => {
    button.addEventListener("click", () => openForm());
  });
  buildMonthGrid();
}

/** 상대가 기록하면 내 화면도 따라 바뀐다. 내 변경도 여기로 돌아오지만 결과는 같다. */
function watchForChanges(householdId) {
  unsubscribe(channel);
  unsubscribe(noteChannel);
  // 상대가 남긴 말은 목록의 개수와 열려 있는 대화 양쪽에 바로 반영된다.
  noteChannel = subscribeNotes(receiveNote);
  channel = subscribeExpenses(householdId, () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        await reloadExpenses();
        render();
      } catch {
        // 실패해도 지금 보이는 화면은 그대로 둔다. 다음 변경 때 다시 시도된다.
      }
    }, SYNC_DEBOUNCE_MS);
  });
}

async function startApp() {
  const profile = getProfile();
  showDataGate("기록을 불러오는 중…");

  try {
    await loadAll(profile);
  } catch (error) {
    showDataGate(error.message, true);
    return;
  }

  elements.dataGate.hidden = true;
  showApp();
  wireOnce();
  paintMembers();

  // 반영일이 지난 고정비를 먼저 채운 뒤 그린다.
  const applied = await applyDueFixedCosts();
  render();
  watchForChanges(profile.household_id);

  if (applied.created > 0) {
    showToast(`이번 달 고정비 ${applied.created}건을 넣었어요`);
  } else if (applied.failed > 0) {
    // 조용히 넘어가면 이번 달 고정비가 통째로 빠진 걸 모른 채 지나간다.
    showToast(`고정비 ${applied.failed}건을 반영하지 못했어요. 잠시 뒤 다시 열어 주세요`);
  }
}

elements.retryLoad.addEventListener("click", () => (getProfile() ? startApp() : boot()));

async function boot() {
  if (!isReady()) {
    showConfigError();
    return;
  }

  let profile = null;
  try {
    profile = await restoreSession();
  } catch (error) {
    // 세션은 그대로다. 로그인 화면으로 돌리지 않고 다시 시도할 기회만 준다.
    showDataGate(error.message, true);
    return;
  }

  if (profile) {
    await startApp();
    return;
  }
  showLoginScreen();
}

boot();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
