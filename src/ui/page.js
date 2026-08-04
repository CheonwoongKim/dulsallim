import { elements } from "../dom.js";
import { afterMotion } from "./after-motion.js";
import { lockPageScroll, unlockPageScroll } from "./scroll-lock.js";

/**
 * 가계부를 완전히 덮는 전체 화면(마이페이지·설정).
 *
 * 바텀시트와 달리 "다른 곳으로 갔다"는 느낌을 주려고 옆에서 밀려 들어온다.
 * 시트보다 아래에 깔리므로, 설정에서 고정비 시트를 열면 설정 화면 위에 시트가 뜬다.
 */
let openedPage = null;
let closingPage = null;
let stopWaiting = null;
let lastFocusedElement = null;

/**
 * 닫히는 중이던 화면의 뒤처리를 지금 끝낸다.
 *
 * 기다리던 것을 그냥 취소하면 그 화면이 hidden = false 인 채 DOM 에 남는다.
 * 눈에는 안 보여도(is-visible 이 빠져 옆으로 밀려 있다) 버튼은 그대로 눌리고
 * 탭으로도 들어간다. 계측: 설정을 닫자마자 마이페이지를 열면 설정 화면의 버튼이
 * 여전히 히트테스트에 잡혔다.
 *
 * 잠금은 다음에 열 화면이 이어받을 수 있으므로 풀지 말지를 부르는 쪽이 정한다.
 * 여기서 풀었다 곧바로 다시 걸면 그사이 스크롤이 제자리로 튀어 오른다.
 */
function finishClose({ unlock }) {
  stopWaiting?.();
  stopWaiting = null;
  const page = closingPage;
  closingPage = null;
  if (!page) return;
  page.hidden = true;
  if (unlock) unlockPageScroll();
}

export function getOpenPage() {
  return openedPage;
}

export function showPage(page) {
  // 곧 다른 화면을 열므로 잠금은 그대로 이어받는다.
  finishClose({ unlock: false });
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
  /*
   * 뒤에 있는 가계부는 안 보일 뿐, 탭으로는 그대로 들어간다.
   * 시트는 <dialog> 라 브라우저가 포커스를 가둬 주지만 화면은 아니라, 커서가 덮인 목록 속으로 사라진다.
   */
  elements.appShell.inert = true;
  requestAnimationFrame(() => {
    page.classList.add("is-visible");
    // 어디로 왔는지 알 수 있게 화면 자체로 옮긴다. aria-labelledby 가 제목을 읽어 준다.
    page.tabIndex = -1;
    page.focus({ preventScroll: true });
  });
}

export function hidePage() {
  const page = openedPage;
  if (!page) return;
  openedPage = null;
  elements.appShell.inert = false;

  const focused = document.activeElement;
  if (focused instanceof HTMLElement && page.contains(focused)) focused.blur();
  page.classList.remove("is-visible");

  finishClose({ unlock: true });
  closingPage = page;
  stopWaiting = afterMotion(page, () => {
    finishClose({ unlock: true });
    requestAnimationFrame(() => lastFocusedElement?.focus?.());
  });
}

/** 로그아웃처럼 화면을 통째로 갈아엎을 때. 애니메이션 없이 즉시 정리한다. */
export function closePageNow() {
  stopWaiting?.();
  stopWaiting = null;
  closingPage = null;
  elements.pages.forEach((page) => {
    page.classList.remove("is-visible");
    page.hidden = true;
  });
  if (openedPage) unlockPageScroll();
  elements.appShell.inert = false;
  openedPage = null;
}
