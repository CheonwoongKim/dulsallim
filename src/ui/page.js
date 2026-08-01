import { elements } from "../dom.js";
import { lockPageScroll, unlockPageScroll } from "./scroll-lock.js";

/**
 * 가계부를 완전히 덮는 전체 화면(마이페이지·설정).
 *
 * 바텀시트와 달리 "다른 곳으로 갔다"는 느낌을 주려고 옆에서 밀려 들어온다.
 * 시트보다 아래에 깔리므로, 설정에서 고정비 시트를 열면 설정 화면 위에 시트가 뜬다.
 */
const CLOSE_MS = 280;

let openedPage = null;
let closeTimer = null;
let lastFocusedElement = null;

export function getOpenPage() {
  return openedPage;
}

export function showPage(page) {
  clearTimeout(closeTimer);
  // 이미 다른 화면이 열려 있으면 갈아 끼운다. 두 장이 겹치면 뒤로 가기가 꼬인다.
  if (openedPage && openedPage !== page) {
    openedPage.classList.remove("is-visible");
    openedPage.hidden = true;
  } else if (!openedPage) {
    lastFocusedElement = document.activeElement;
    lockPageScroll();
  }

  openedPage = page;
  page.hidden = false;
  page.scrollTop = 0;
  requestAnimationFrame(() => page.classList.add("is-visible"));
}

export function hidePage() {
  const page = openedPage;
  if (!page) return;
  openedPage = null;

  const focused = document.activeElement;
  if (focused instanceof HTMLElement && page.contains(focused)) focused.blur();
  page.classList.remove("is-visible");

  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    page.hidden = true;
    unlockPageScroll();
    requestAnimationFrame(() => lastFocusedElement?.focus?.());
  }, CLOSE_MS);
}

/** 로그아웃처럼 화면을 통째로 갈아엎을 때. 애니메이션 없이 즉시 정리한다. */
export function closePageNow() {
  clearTimeout(closeTimer);
  elements.pages.forEach((page) => {
    page.classList.remove("is-visible");
    page.hidden = true;
  });
  if (openedPage) unlockPageScroll();
  openedPage = null;
}
