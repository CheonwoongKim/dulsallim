import "./style.css";

import { elements } from "./dom.js";
import { formatMoney } from "./expenses.js";
import { paintMembers, render, resetTotalAnimation } from "./render.js";
import { clearData, getExpenses, loadAll, reloadHousehold } from "./store.js";
import { subscribeHousehold, subscribeNotes, unsubscribe } from "./data/remote.js";
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
import { describeApplied } from "./fixed-costs.js";
import { formatAmountInput } from "./money.js";
import { closePageNow, getOpenPage, hidePage } from "./ui/page.js";
import {
  handleGoalInput,
  handleNameInput,
  handleProfileSubmit,
  openProfilePage,
  pickColor,
} from "./features/profile.js";
import {
  closeResetSheet,
  handleReset,
  openResetSheet,
  openSettingsPage,
  syncResetButton,
} from "./features/settings.js";
import {
  addNag,
  closeNagSheet,
  editNag,
  handleNagSubmit,
  openNagPage,
  removeNag,
  syncNagHint,
  toggleNagEnabled,
} from "./features/nag.js";
import { openAnalysisPage, shiftAnalysisMonth, toggleCompare } from "./features/analysis.js";
import {
  closeTrendSheet,
  endScrub,
  moveScrub,
  openScrubbedMonth,
  openTrendSheet,
  scrubByKey,
  shiftTrendYear,
  startScrub,
} from "./features/trend.js";
import {
  closeNotes,
  flushPendingNotes,
  handleNoteSubmit,
  openNotes,
  receiveNote,
} from "./features/notes.js";
import { watchScroll } from "./ui/condense.js";
import { watchKeyboard } from "./ui/keyboard-inset.js";
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
  refreshFixedSheet,
  removeFixedTemplate,
  showFormView,
  updateFixedHint,
} from "./features/fixed-sheet.js";

function closeActiveSheet() {
  if (!elements.sheet.hidden) closeForm();
  if (!elements.monthSheet.hidden) closeMonthSheet();
  if (!elements.fixedSheet.hidden) closeFixedSheet();
  if (!elements.notesSheet.hidden) closeNotes();
  if (!elements.nagSheet.hidden) closeNagSheet();
  if (!elements.trendSheet.hidden) closeTrendSheet();
  if (!elements.resetSheet.hidden) closeResetSheet();
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
elements.addNag.addEventListener("click", addNag);
closeOnPress(elements.closeNagSheet, closeNagSheet);

/* ── 한 해 추이 시트 ──────────────────────────────────────── */

elements.openTrend.addEventListener("click", openTrendSheet);
closeOnPress(elements.closeTrendSheet, closeTrendSheet);
elements.trendPrev.addEventListener("click", () => shiftTrendYear(-1));
elements.trendNext.addEventListener("click", () => shiftTrendYear(1));
// 세로 점선을 끌어 달을 짚는다. 아래 숫자 줄을 누르면 그 달을 자세히 본다.
elements.trendChart.addEventListener("pointerdown", startScrub);
elements.trendChart.addEventListener("pointermove", moveScrub);
elements.trendChart.addEventListener("pointerup", endScrub);
elements.trendChart.addEventListener("pointercancel", endScrub);
elements.trendChart.addEventListener("keydown", scrubByKey);
// 보고 있는 달은 본 화면과 나눠 쓰는 상태다. 한쪽만 그리면 화면과 상태가 어긋난다.
elements.trendReadout.addEventListener("click", () => {
  if (openScrubbedMonth()) render();
});
elements.nagForm.addEventListener("submit", handleNagSubmit);
elements.nagPercent.addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 3);
  elements.nagError.textContent = "";
  syncNagHint();
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
elements.openResetSheet.addEventListener("click", openResetSheet);
closeOnPress(elements.closeResetSheet, closeResetSheet);
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

/** 다시 읽은 뒤 화면을 맞춘다. 실시간 변경과 화면 복귀가 같은 마무리를 쓴다. */
function repaintAfterSync() {
  // 지출보다 먼저 도착해 맡겨 뒀던 메시지를 이제 붙인다. 그려지기 전이어야 개수가 맞는다.
  flushPendingNotes();
  render();
  // 고정비 목록은 render 가 그리지 않는다. 열어 둔 채라면 여기서 맞춘다.
  refreshFixedSheet();
}

/** 상대가 기록하면 내 화면도 따라 바뀐다. 내 변경도 여기로 돌아오지만 결과는 같다. */
function watchForChanges(householdId) {
  unsubscribe(channel);
  unsubscribe(noteChannel);
  // 상대가 남긴 말은 목록의 개수와 열려 있는 대화 양쪽에 바로 반영된다.
  noteChannel = subscribeNotes(receiveNote);
  channel = subscribeHousehold(householdId, () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        await reloadHousehold();
        repaintAfterSync();
      } catch {
        // 실패해도 지금 보이는 화면은 그대로 둔다. 다음 변경 때 다시 시도된다.
      }
    }, SYNC_DEBOUNCE_MS);
  });
}

let catchingUp = false;

/**
 * 화면으로 돌아왔을 때 처음부터 다시 읽는다.
 *
 * 폰이 앱을 재우면 실시간 연결이 끊긴다. 깨어나 다시 이어져도 자는 동안 있었던 일은
 * 들려주지 않는다 — 지나간 변경을 재생해 주는 구독이 아니기 때문이다.
 * 그래서 상대가 그사이 적은 지출은 다음에 무언가 바뀔 때까지 화면에 없었다.
 *
 * 바뀐 것만 골라 읽지 않고 통째로 읽는다. 얼마나 오래 잠들었는지 알 수 없으니
 * 무엇이 어긋났는지도 알 수 없다. 특히 대화 개수와 구성원은 reloadHousehold 가
 * 읽지 않아, 그것만으로는 상대가 남긴 말이 목록에 나타나지 않는다.
 */
async function catchUp() {
  const profile = getProfile();
  // 로그아웃하면 profile 이 비므로, 로그인 화면에서 돌아온 것과 구분된다.
  if (!profile || catchingUp) return;

  catchingUp = true;
  try {
    await loadAll(profile);
  } catch {
    // 돌아오자마자 오류 화면을 띄우지 않는다. 보던 것을 그대로 두고 다음 기회에 맞춘다.
    return;
  } finally {
    catchingUp = false;
  }
  paintMembers();
  repaintAfterSync();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") catchUp();
});
/* 얼려 둔 페이지를 되살릴 때는 visibilitychange 없이 이쪽만 울리는 경우가 있다. */
window.addEventListener("pageshow", (event) => {
  if (event.persisted) catchUp();
});

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
  watchScroll();
  watchKeyboard();
  paintMembers();

  /*
   * 고정비를 채우기 전에 귀부터 연다.
   *
   * 뒤에 두면 그 사이 상대가 남긴 말이 어느 쪽에도 안 잡힌다 — 이미 불러온 개수에도 없고,
   * 구독은 지나간 일을 들려주지 않는다. 밀린 고정비가 많을수록 그 틈이 길어진다.
   */
  watchForChanges(profile.household_id);

  // 반영일이 지난 고정비를 채운 뒤 그린다.
  const applied = await applyDueFixedCosts();
  render();

  // 조용히 넘어가면 이번 달 고정비가 통째로 빠진 걸 모른 채 지나간다.
  const notice = describeApplied(applied);
  if (notice) showToast(notice);
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

/**
 * iOS 홈 화면 웹앱은 Safari 탭과 별도 프로세스로 살아남을 수 있다.
 * 앱이 다시 보일 때 워커를 확인하고, 새 워커가 제어권을 잡으면 문서도 같은 버전으로 맞춘다.
 */
export async function registerPwaUpdater(environment = {}) {
  const serviceWorker = environment.serviceWorker ?? globalThis.navigator?.serviceWorker;
  const windowTarget = environment.windowTarget ?? globalThis.window;
  const documentTarget = environment.documentTarget ?? globalThis.document;
  const locationTarget = environment.locationTarget ?? globalThis.location;

  if (!serviceWorker || !windowTarget || !documentTarget || !locationTarget || locationTarget.protocol === "file:") {
    return null;
  }

  let hasController = Boolean(serviceWorker.controller);
  let isReloading = false;

  serviceWorker.addEventListener("controllerchange", () => {
    if (!hasController) {
      hasController = true;
      return;
    }
    if (isReloading) return;

    isReloading = true;
    locationTarget.reload();
  });

  const registration = await serviceWorker.register("/sw.js", { updateViaCache: "none" });
  let updatePromise = null;

  const checkForUpdate = () => {
    if (updatePromise) return updatePromise;
    updatePromise = registration
      .update()
      .catch(() => undefined)
      .finally(() => {
        updatePromise = null;
      });
    return updatePromise;
  };

  const checkWhenVisible = () => {
    if (documentTarget.visibilityState === "visible") void checkForUpdate();
  };

  windowTarget.addEventListener("pageshow", checkForUpdate);
  windowTarget.addEventListener("online", checkForUpdate);
  documentTarget.addEventListener("visibilitychange", checkWhenVisible);

  await checkForUpdate();
  return registration;
}

if (import.meta.env.PROD) {
  window.addEventListener("load", () => registerPwaUpdater().catch(() => {}), { once: true });
}
