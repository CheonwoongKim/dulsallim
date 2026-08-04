import { elements } from "../dom.js";

const VISIBLE_MS = 4200;
const FADE_MS = 220;

let toastTimer = null;
let hideTimer = null;

/** 토스트가 하단 피드백을 맡는 동안 FAB는 겹치거나 눌리지 않게 자리를 비운다. */
function setFloatingAddSuppressed(suppressed) {
  elements.floatingAdd.classList.toggle("is-toast-suppressed", suppressed);
  elements.floatingAdd.disabled = suppressed;
  if (suppressed) elements.floatingAdd.setAttribute("aria-hidden", "true");
  else elements.floatingAdd.removeAttribute("aria-hidden");
}

/**
 * @param {string} message
 * @param {{ canUndo?: boolean, onExpire?: () => void }} [options]
 */
export function showToast(message, options = {}) {
  const { canUndo = false, onExpire } = options;

  clearTimeout(toastTimer);
  // 이전 숨김 예약을 반드시 취소한다. 남아 있으면 방금 띄운 토스트를 지워버린다.
  clearTimeout(hideTimer);

  elements.toastMessage.textContent = message;
  elements.undoDelete.hidden = !canUndo;
  setFloatingAddSuppressed(true);
  elements.toast.hidden = false;
  requestAnimationFrame(() => elements.toast.classList.add("is-visible"));

  toastTimer = setTimeout(() => {
    onExpire?.();
    hideToast();
  }, VISIBLE_MS);
}

export function hideToast() {
  clearTimeout(toastTimer);
  clearTimeout(hideTimer);
  elements.toast.classList.remove("is-visible");
  hideTimer = setTimeout(() => {
    elements.toast.hidden = true;
    setFloatingAddSuppressed(false);
  }, FADE_MS);
}
