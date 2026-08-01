import { elements } from "../dom.js";

const VISIBLE_MS = 4200;
const FADE_MS = 220;

let toastTimer = null;
let hideTimer = null;

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
  }, FADE_MS);
}
