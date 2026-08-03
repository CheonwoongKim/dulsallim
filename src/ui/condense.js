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

/**
 * 접히면 문서가 머리 높이만큼 짧아진다. 그 탓에 브라우저가 스크롤 위치를 되돌려
 * 펴는 지점 아래로 내려가면 도로 펴진다 — 접었다가 곧바로 펴지는 그 튕김이다.
 * 그러니 "접고 난 뒤에도 펴는 지점보다 위에 남아 있을 수 있는가"를 본다.
 *
 * 줄어드는 양은 기기마다 다르다(노치 여백). 실제로 접힐 때 재 두고, 알기 전에는 넉넉히 잡는다.
 */
const FALLBACK_SHRINK = 180;
const SAFETY = 8;

let condensed = false;
let expandedHeight = 0;
let condensedHeight = 0;

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
  document.documentElement.style.setProperty("--header-h", `${height}px`);
  // 전환 도중 값도 들어오지만 마지막 값이 남으므로, 끝나면 저절로 맞는다.
  if (condensed) condensedHeight = height;
  else expandedHeight = height;
}

function shrinkAmount() {
  return expandedHeight && condensedHeight ? expandedHeight - condensedHeight : FALLBACK_SHRINK;
}

function setCondensed(next) {
  if (next === condensed) return;
  condensed = next;
  elements.appShell.classList.toggle("is-condensed", next);
}

function roomToCondense() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  return maxScroll - shrinkAmount() >= EXPAND_AT + SAFETY;
}

function onScroll() {
  /*
   * 시트가 열려 있으면 본 화면 스크롤이 잠겨 scrollY 가 0 이 된다.
   * 그걸 "맨 위로 올라갔다"로 읽으면, 달 선택 시트를 여는 순간 뒤에서 머리가 펴진다.
   * 시트를 닫으면 스크롤이 제자리로 돌아오고 그때 다시 판단한다.
   */
  if (isPageScrollLocked()) return;
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

/**
 * 목록이 바뀌면 문서 길이도 바뀐다. 다시 그린 뒤 불러 준다.
 *
 * 여기서 roomToCondense 를 쓰면 안 된다. 그건 "펼친 상태에서 접어도 되는가"를 재는 자라,
 * 이미 접힌 상태의 여유를 그 자로 재면 멀쩡한데도 펴 버린다.
 * (달을 바꿔 목록이 짧아지면 접힌 화면이 통째로 도로 커졌다)
 * 접힌 채로 볼 자리가 남아 있으면 그대로 둔다. 맨 위로 밀려났을 때만 편다.
 */
export function recheckCondense() {
  if (condensed && window.scrollY < EXPAND_AT) setCondensed(false);
}
