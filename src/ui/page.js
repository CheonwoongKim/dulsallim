import { elements } from "../dom.js";
import { afterMotion } from "./after-motion.js";
import { lockPageScroll, unlockPageScroll } from "./scroll-lock.js";

/**
 * 가계부를 완전히 덮는 전체 화면(마이페이지·설정).
 *
 * 바텀시트와 달리 "다른 곳으로 갔다"는 느낌을 주려고 옆에서 밀려 들어온다.
 * 시트보다 아래에 깔리므로, 설정에서 고정비 시트를 열면 설정 화면 위에 시트가 뜬다.
 */
/*
 * 열린 화면을 쌓아 둔다. 뒤로 가기는 한 장씩만 벗긴다.
 *
 * 한 장짜리 슬롯이던 때는 설정에서 소비 잔소리를 열면 설정이 그 자리에서 사라져,
 * 뒤로 가기가 설정이 아니라 가계부로 데려갔다. 어디서 들어왔는지를 기억해야
 * 돌아갈 곳을 안다.
 *
 * 각 칸: { page, openerFocus, scrollTop } — 덮이기 전 스크롤 자리도 함께 기억해
 * 돌아왔을 때 보던 곳이 그대로 보인다.
 */
const pageStack = [];
let closingPage = null;
let stopWaiting = null;

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
  return pageStack.at(-1)?.page ?? null;
}

export function showPage(page) {
  // 곧 다른 화면을 열므로 잠금은 그대로 이어받는다.
  finishClose({ unlock: false });

  const 아래 = pageStack.at(-1);
  // 같은 화면을 다시 여는 것은 쌓지 않는다. 뒤로 두 번 눌러야 나가게 된다.
  if (아래?.page === page) return;

  if (아래) {
    // 덮이기 전에 보던 자리를 적어 둔다. 돌아왔을 때 그 자리가 그대로 보여야 한다.
    아래.scrollTop = 아래.page.scrollTop;
    아래.page.classList.remove("is-visible");
    아래.page.hidden = true;
  } else {
    lockPageScroll();
  }

  pageStack.push({ page, openerFocus: document.activeElement, scrollTop: 0 });
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

/** 한 장만 벗긴다. 밑에 화면이 남아 있으면 그것으로 돌아가고, 없으면 가계부로 나간다. */
export function hidePage() {
  const 지금 = pageStack.pop();
  if (!지금) return;

  const 아래 = pageStack.at(-1);
  // 밑에 화면이 남아 있으면 가계부는 여전히 덮여 있다. 잠금도 그대로 둔다.
  if (!아래) elements.appShell.inert = false;

  const focused = document.activeElement;
  if (focused instanceof HTMLElement && 지금.page.contains(focused)) focused.blur();
  지금.page.classList.remove("is-visible");

  finishClose({ unlock: !아래 });
  closingPage = 지금.page;
  stopWaiting = afterMotion(지금.page, () => {
    finishClose({ unlock: !아래 });
    requestAnimationFrame(() => 지금.openerFocus?.focus?.());
  });

  if (!아래) return;

  // 덮여 있던 화면을 도로 올린다. 보던 자리까지 그대로.
  아래.page.hidden = false;
  아래.page.scrollTop = 아래.scrollTop;
  requestAnimationFrame(() => {
    아래.page.classList.add("is-visible");
    아래.page.focus({ preventScroll: true });
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
  if (pageStack.length) unlockPageScroll();
  elements.appShell.inert = false;
  pageStack.length = 0;
}
