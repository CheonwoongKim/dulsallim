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

/** layout.css 의 --condense-ms 와 같은 값이다. */
const CONDENSE_MS = 260;

/** 이어 붙이는 중인 애니메이션. 다시 부를 때 앞엣것을 세운다. */
const bridging = new WeakMap();

/** 상자는 가운데를 기준으로 잰다. 안의 글자가 가운데 정렬이라 왼쪽 끝이 같아도 글자는 움직인다. */
function centerOf(element) {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * 배치가 바뀌며 튀는 자리를 이어 붙인다 (FLIP).
 *
 * 펼친 머리는 세로로 쌓이고 접힌 머리는 가로 한 줄이다. block 과 flex 사이에는 중간 상태가
 * 없어서, 클래스를 바꾸는 순간 총액이 200px 넘게, 월 이동 줄이 80px 넘게 순간이동했다.
 * 높이·글자 크기만 260ms 동안 흐르니 "툭 자리를 잡은 뒤 상자만 줄어드는" 두 박자가 됐다.
 *
 * 바꾼 뒤 위치를 다시 재서, 옛 자리에서 새 자리로 가는 transform 애니메이션을 건다.
 * 옮기는 일은 transform 이 맡으므로 레이아웃을 다시 계산하지 않는다.
 *
 * 인라인 style 로 하지 않고 Web Animations 로 거는 이유가 있다.
 * 되돌려 놓을 때 style.transition = "none" 을 쓰면 그 요소의 전환이 통째로 꺼져,
 * 곧바로 레이아웃을 읽는 순간 height 와 font-size 까지 최종값으로 뛰어 버린다
 * (총액 높이가 30 → 62 로 한 프레임에 튀는 것을 계측했다).
 * animate() 는 인라인 style 을 건드리지 않으므로 CSS 전환이 그대로 살아 있다.
 *
 * 머리 높이는 여기서 다루지 않는다 — layout.css 에서 220px ↔ 50px 로 못 박아 두었다.
 *
 * @param {() => void} change 배치를 바꾸는 일
 */
function bridgeJump(change) {
  const movers = [elements.overviewMonthControl, elements.totalAmount].filter(Boolean);
  // 움직임을 줄여 달라고 했으면 이을 것도 없다. 전환이 없는데 되돌려 놓으면 되레 한 프레임 튄다.
  if (!movers.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    change();
    return;
  }

  // 아직 흐르는 중이면 지금 눈에 보이는 자리가 시작점이다 — 도는 애니메이션이 반영된 값이 나온다.
  const before = movers.map(centerOf);
  change();
  const after = movers.map(centerOf);

  movers.forEach((element, index) => {
    const dx = before[index].x - after[index].x;
    const dy = before[index].y - after[index].y;
    // 겹쳐 돌면 뒤엣것이 앞엣것 위에 얹혀 엉뚱한 데서 출발한다.
    bridging.get(element)?.cancel();
    bridging.set(
      element,
      element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: CONDENSE_MS,
        easing: "ease",
      }),
    );
  });
}

function setCondensed(next) {
  if (next === condensed) return;
  condensed = next;
  bridgeJump(() => {
    elements.appShell.classList.toggle("is-condensed", next);
  });
  /*
   * 접힌 요약 카드는 눈에서만 사라진다.
   * opacity 0 · 높이 0 · pointer-events none 중 어느 것도 탭 순서와 낭독기에서 빼 주지 않아,
   * 스크롤한 뒤 Tab 을 누르면 보이지 않는 카드로 커서가 들어간다.
   */
  if (elements.overview) elements.overview.inert = next;
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

function measure() {
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

/**
 * 스크롤은 한 프레임에 여러 번 울린다.
 *
 * 그때마다 scrollHeight 와 getBoundingClientRect 를 읽으면 브라우저가 레이아웃을 다시 계산한다.
 * passive 는 스크롤을 막지 않겠다는 약속일 뿐, 읽는 값이 비싸다는 사실은 바꾸지 않는다.
 * 화면은 한 프레임에 한 번만 바뀌므로 재는 것도 그만큼이면 된다.
 */
let queued = false;

function onScroll() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    measure();
  });
}

let watching = false;

export function watchScroll() {
  // 같은 탭에서 로그아웃·로그인을 되풀이하면 startApp 이 다시 불린다.
  // 막지 않으면 스크롤 한 번에 같은 측정이 로그인 횟수만큼 돈다.
  if (watching) return;
  watching = true;
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
