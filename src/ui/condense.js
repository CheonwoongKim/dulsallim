import { elements } from "../dom.js";
import { isPageScrollLocked } from "./scroll-lock.js";

/**
 * 목록을 보려고 스크롤하면 머리를 접는다.
 *
 * 작은 폰(667px)에서는 상단바와 총액이 화면의 45%를 차지해 목록이 다섯 줄밖에 안 보인다.
 * 스크롤은 "목록을 보겠다"는 뜻이므로, 그때는 머리를 한 줄로 줄여 자리를 내준다.
 *
 * 접어도 월 이동은 남긴다. 월 라벨이 달 선택 시트를 여는 버튼이기도 해서,
 * 사라지면 달을 바꾸려고 스크롤을 도로 올려야 한다.
 */

/** 접는 지점과 펴는 지점을 다르게 둔다 — 같으면 경계에서 폈다 접었다를 반복한다. */
const CONDENSE_AT = 72;
const EXPAND_AT = 24;

let condensed = false;
let stuck = false;
let headerHeight = 0;

/**
 * 지출 내역 제목이 머리 바로 밑에 붙으려면 머리 높이를 알아야 한다.
 *
 * 접힘은 180ms 에 걸쳐 일어난다. 클래스를 바꾼 직후에 한 번만 재면 애니메이션 도중의
 * 어중간한 값을 잡아, 제목이 실제 머리보다 아래에 붙어 빈 띠가 생긴다(194px 을 쟀다).
 * 크기가 바뀔 때마다 따라가게 두면 그 틈이 없다.
 */
function syncHeaderHeight() {
  const height = elements.appHeader?.offsetHeight;
  if (!height) return;
  headerHeight = height;
  document.documentElement.style.setProperty("--header-h", `${height}px`);
}

function setCondensed(next) {
  if (next === condensed) return;
  condensed = next;
  elements.appShell.classList.toggle("is-condensed", next);
}

/**
 * 지출 내역 제목이 실제로 머리 밑에 가서 붙었는지.
 *
 * 접힘과 붙음은 다른 일이다. 접히는 건 72px 부터인데 제목이 붙는 건 180px 쯤부터라,
 * 그 사이 100px 구간에서는 접혔지만 제목은 제자리에 있다.
 * 그때는 제목 밑을 지나가는 줄이 없으므로 흐릴 이유도 없다 — 흐리면 첫 줄 위쪽만
 * 까닭 없이 잘려 보인다.
 */
function syncStuck() {
  const heading = elements.sectionHeading;
  if (!heading) return;
  const next = heading.getBoundingClientRect().top - headerHeight < 1;
  if (next === stuck) return;
  stuck = next;
  elements.appShell.classList.toggle("is-stuck", next);
}

/**
 * 펴도 되는 상황인가.
 *
 * 접히면 문서가 머리 높이만큼 짧아지고, 브라우저는 스크롤 위치를 그만큼 되감는다.
 * 그 되감김을 "사용자가 위로 올렸다"로 읽으면 곧바로 도로 펴진다 — 접었다 펴지는 튕김이다.
 *
 * 전에는 이걸 "여유가 있을 때만 접기"로 막았는데, 그러면 목록이 짧은 달에는 아예 접히지
 * 않았다. 접기가 가장 쓸모 있는 경우를 막은 셈이다(짧은 목록일수록 접으면 다 보인다).
 * 막을 곳은 접는 쪽이 아니라 펴는 쪽이다.
 *
 * 스크롤할 수 있는 거리가 펴는 지점에도 못 미치면, 위에 있는 건 사용자가 올린 것이
 * 아니라 밀려난 것이다. 그때는 펴지 않는다.
 */
function userIsAtTop() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  return maxScroll >= EXPAND_AT && window.scrollY < EXPAND_AT;
}

function onScroll() {
  /*
   * 시트가 열려 있으면 본 화면 스크롤이 잠겨 scrollY 가 0 이 된다.
   * 그걸 "맨 위로 올라갔다"로 읽으면, 달 선택 시트를 여는 순간 뒤에서 머리가 펴진다.
   * 시트를 닫으면 스크롤이 제자리로 돌아오고 그때 다시 판단한다.
   */
  if (isPageScrollLocked()) return;
  const y = window.scrollY;
  // 목록 길이와 상관없이, 내리면 접는다.
  if (!condensed && y > CONDENSE_AT) setCondensed(true);
  else if (condensed && userIsAtTop()) setCondensed(false);
  syncStuck();
}

export function watchScroll() {
  syncHeaderHeight();
  new ResizeObserver(() => {
    syncHeaderHeight();
    syncStuck();
  }).observe(elements.appHeader);
  // passive: 스크롤을 막을 일이 없다고 알려 줘야 브라우저가 기다리지 않는다.
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
}

/**
 * 목록이 바뀌면 문서 길이도 바뀐다. 다시 그린 뒤 불러 준다.
 *
 * 목록이 짧아졌다고 펴지 않는다. 달을 바꿔 목록이 짧아지면 접힌 화면이 통째로
 * 도로 커지던 적이 있었다. 사용자가 실제로 맨 위로 올렸을 때만 편다.
 */
export function recheckCondense() {
  if (condensed && userIsAtTop()) setCondensed(false);
}
