import { elements } from "../dom.js";
import { getMembers } from "../members.js";
import { paintMembers, render, resetTotalAnimation } from "../render.js";
import { loadAll, resetHousehold } from "../store.js";
import { hidePage, showPage } from "../ui/page.js";
import { showToast } from "../ui/toast.js";
import { getProfile } from "./auth.js";

/** 지우려면 이 말을 그대로 적어야 한다. 손이 미끄러져 눌리는 일을 막는 유일한 방법이다. */
const CONFIRM_WORD = "초기화";

export function openSettingsPage() {
  elements.resetConfirm.value = "";
  elements.resetError.textContent = "";
  syncResetButton();

  // 함께 쓰는 가계부다. 내 기록만 지워지는 게 아니라는 걸 상대 이름으로 못 박는다.
  const me = getProfile()?.id;
  const partner = getMembers().find((member) => member.id !== me);
  elements.resetWarning.textContent = partner
    ? `지출 기록과 고정비가 모두 사라집니다. 되돌릴 수 없고, ${partner.name} 님의 기록도 함께 지워집니다.`
    : "지출 기록과 고정비가 모두 사라집니다. 되돌릴 수 없습니다.";

  showPage(elements.settingsPage);
}

export function syncResetButton() {
  elements.resetSubmit.disabled = elements.resetConfirm.value.trim() !== CONFIRM_WORD;
  elements.resetError.textContent = "";
}

export async function handleReset(event) {
  event.preventDefault();
  if (elements.resetConfirm.value.trim() !== CONFIRM_WORD) return;

  elements.resetSubmit.disabled = true;
  try {
    await resetHousehold();
    // 지운 뒤 서버에서 다시 읽는다. 상대 폰이 방금 넣은 기록이 있을 수 있다.
    await loadAll(getProfile());
  } catch (error) {
    elements.resetError.textContent = error.message;
    elements.resetSubmit.disabled = false;
    return;
  }

  elements.resetConfirm.value = "";
  syncResetButton();
  paintMembers();
  resetTotalAnimation();
  render();
  hidePage();
  showToast("모든 기록을 지웠어요");
}
