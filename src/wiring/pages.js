import { togglePush } from "../features/push.js";
import { elements } from "../dom.js";
import {
  openAnalysisPage,
  shiftAnalysisMonth,
  toggleCategoryDetail,
  toggleCompare,
} from "../features/analysis.js";
import { toggleMemberFilter } from "../features/expense-actions.js";
import {
  addNag,
  closeNagSheet,
  editNag,
  handleNagSubmit,
  openNagPage,
  removeNag,
  syncNagHint,
  toggleNagEnabled,
} from "../features/nag.js";
import { closeNotes, handleNoteSubmit, syncNoteSend } from "../features/notes.js";
import {
  handleCustomColorInput,
  handleGoalInput,
  handleNameInput,
  handleProfileSubmit,
  openProfilePage,
  pickColor,
} from "../features/profile.js";
import {
  closeResetSheet,
  handleReset,
  openResetSheet,
  openSettingsPage,
  syncResetButton,
} from "../features/settings.js";
import {
  closeTrendSheet,
  endScrub,
  moveScrub,
  openScrubbedMonth,
  openTrendSheet,
  scrubByKey,
  shiftTrendYear,
  startScrub,
} from "../features/trend.js";
import {
  agreeOnWish,
  closeAchieveSheet,
  closeDropSheet,
  closeWishDetail,
  closeWishSheet,
  dropWish,
  handleWishPriceInput,
  handleWishSubmit,
  openAchieveSheet,
  openWishDetail,
  editFromDetail,
  goalFromDetail,
  dropFromEdit,
  openWishPage,
  openWishSheet,
  pickAchievedExpense,
  setWishTab,
} from "../features/wish.js";
import { render } from "../render.js";
import { hidePage } from "../ui/page.js";
import { closeOnPress } from "../ui/sheet.js";

/**
 * 전체 화면과 시트의 배선 — 분석·마이페이지·설정·잔소리·초기화·추이·대화.
 */

/* ── 마이페이지 · 설정 ────────────────────────────────────── */

elements.openAnalysis.addEventListener("click", openAnalysisPage);
elements.analysisList.addEventListener("click", (event) => {
  const 줄 = event.target.closest("[data-category]");
  if (줄) {
    toggleCategoryDetail(줄.dataset.category);
    render();
  }
});

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
// input 은 끌면서 계속 울리고 change 는 고르고 나서 한 번 운다. 브라우저마다 오는 쪽이 달라 둘 다 받는다.
elements.profileCustomColor.addEventListener("input", handleCustomColorInput);
elements.profileCustomColor.addEventListener("change", handleCustomColorInput);
elements.profilePalette.addEventListener("click", (event) => {
  const swatch = event.target.closest(".swatch");
  if (swatch) pickColor(swatch.dataset.color);
});
elements.pushToggle.addEventListener("change", (event) => togglePush(event.target.checked));
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
elements.noteInput.addEventListener("input", syncNoteSend);
closeOnPress(elements.closeNotes, closeNotes);

/* ── 위시리스트 ───────────────────────────────────────────── */

elements.openWish.addEventListener("click", openWishPage);
elements.addWish.addEventListener("click", openWishSheet);
closeOnPress(elements.closeWishSheet, closeWishSheet);
elements.wishForm.addEventListener("submit", handleWishSubmit);
elements.wishPrice.addEventListener("input", handleWishPriceInput);
elements.wishName.addEventListener("input", () => {
  elements.wishNameError.textContent = "";
});
elements.wishUrl.addEventListener("input", () => {
  elements.wishUrlError.textContent = "";
});


/*
 * 격자에서는 밀지 않는다. 지우기는 그림 위 × 이고 두 단추 모두 그냥 눌린다.
 *
 * 두 칸이 나란히 서면 가로로 밀 자리가 없고, 밀면 옆 칸까지 함께 끌려 무엇을
 * 지우는지 흐려진다. 그래서 이 목록만 스와이프를 쓰지 않는다.
 */
elements.wishTabs.addEventListener("click", (event) => {
  // paintMemberTabs 가 세우는 단추다. data-member 에 사람 id 가 들어 있다.
  const tab = event.target.closest("[data-member]");
  if (tab) setWishTab(tab.dataset.member);
});

/* 목록은 그림뿐이다. 누르면 자세히가 뜨고, 손보는 일은 모두 거기서 고른다. */
elements.wishList.addEventListener("click", (event) => {
  const tile = event.target.closest("[data-open-wish]");
  if (tile) openWishDetail(tile.dataset.openWish);
});

elements.wishDetailBody.addEventListener("click", (event) => {
  const 무엇 = (이름) => event.target.closest(`[data-${이름}]`);
  const agree = 무엇("agree-wish");
  if (agree) return agreeOnWish(agree.dataset.agreeWish);
  const goal = 무엇("goal-wish");
  if (goal) return goalFromDetail(goal.dataset.goalWish);
  const edit = 무엇("edit-wish");
  if (edit) return editFromDetail(edit.dataset.editWish);
  const achieve = 무엇("achieve-wish");
  if (achieve) return openAchieveSheet(achieve.dataset.achieveWish);
});

elements.wishDelete.addEventListener("click", dropFromEdit);

closeOnPress(elements.closeWishDetailSheet, closeWishDetail);

// 지우기는 한 번 묻는다. 시트의 지우기 단추가 실제로 지운다.
closeOnPress(elements.closeWishDropSheet, closeDropSheet);
elements.wishDropSubmit.addEventListener("click", dropWish);

closeOnPress(elements.closeWishAchieveSheet, closeAchieveSheet);
elements.wishExpenseList.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-pick-expense]");
  if (choice) pickAchievedExpense(choice.dataset.pickExpense);
});
