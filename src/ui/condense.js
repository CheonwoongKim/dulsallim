import { elements } from "../dom.js";

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

/**
 * 접히면 문서가 그만큼 짧아진다. 짧아진 탓에 브라우저가 스크롤 위치를 되돌리면
 * 펴는 지점 아래로 내려가 다시 펴지고, 그 반복이 곧 깜빡임이다.
 * 접고 나서도 스크롤할 여유가 남을 만큼 긴 화면에서만 접는다.
 */
const MIN_SCROLLABLE = 300;

let condensed = false;

/**
 * 지출 내역 제목이 머리 바로 밑에 붙으려면 머리 높이를 알아야 한다.
 *
 * 접힘은 180ms 에 걸쳐 일어난다. 클래스를 바꾼 직후에 한 번만 재면 애니메이션 도중의
 * 어중간한 값을 잡아, 제목이 실제 머리보다 아래에 붙어 빈 띠가 생긴다(194px 을 쟀다).
 * 크기가 바뀔 때마다 따라가게 두면 그 틈이 없다.
 */
function syncHeaderHeight() {
  const height = elements.appHeader?.offsetHeight;
  if (height) document.documentElement.style.setProperty("--header-h", `${height}px`);
}

function setCondensed(next) {
  if (next === condensed) return;
  condensed = next;
  elements.appShell.classList.toggle("is-condensed", next);
}

function roomToCondense() {
  return document.documentElement.scrollHeight - window.innerHeight > MIN_SCROLLABLE;
}

function onScroll() {
  const y = window.scrollY;
  if (!condensed && y > CONDENSE_AT && roomToCondense()) setCondensed(true);
  else if (condensed && y < EXPAND_AT) setCondensed(false);
}

export function watchScroll() {
  syncHeaderHeight();
  new ResizeObserver(syncHeaderHeight).observe(elements.appHeader);
  // passive: 스크롤을 막을 일이 없다고 알려 줘야 브라우저가 기다리지 않는다.
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
}

/** 목록이 줄어 스크롤할 거리가 없어졌을 수 있다. 다시 그린 뒤 불러 준다. */
export function recheckCondense() {
  if (condensed && !roomToCondense()) setCondensed(false);
}
