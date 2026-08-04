import { elements } from "../dom.js";

/**
 * 머리는 크기가 변하지 않는다. 큰 금액은 그냥 함께 스크롤되어 올라간다.
 *
 * 작은 폰에서는 상단이 화면의 절반 가까이를 먹어 목록이 몇 줄 안 보인다. 그래서 큰 금액과
 * 요약 카드는 올려 보내고, 머리에는 달 이동과 작은 총액만 남긴다.
 * 총액이 화면에서 사라지는 순간은 없다.
 *
 * 예전에는 스크롤 위치를 재서 머리 높이를 줄였다. 그러면
 * 머리 높이 → 문서 길이 → 스크롤 위치 → 다시 머리 높이 로 도는 고리가 생긴다.
 * 그 고리 탓에 갇히거나 튕기는 버그가 여덟 번 났다(짧은 달·사람 필터·캘린더·시트 열림·
 * 브라우저의 스크롤 되잡기…). 높이가 변하지 않으면 고리가 없다.
 * 그래서 여기서 보는 것은 "무엇이 화면에 보이는가" 뿐이고, 스크롤 값은 읽지 않는다.
 */

/**
 * 머리 밑으로 이만큼 남았을 때 이미 바뀐 것으로 친다.
 *
 * 딱 맞춰 두면 한 픽셀 오르내림에도 껌뻑인다. 그리고 큰 금액이 완전히 숨은 뒤에 바꾸면
 * 그 사이 한 순간 총액이 어디에도 없다 — 조금 겹치게 두는 편이 낫다.
 */
const SLACK = 8;

let observers = [];
let sizeObserver = null;

/** 지출 내역 제목이 머리 바로 밑에 붙으려면 머리 높이를 알아야 한다. */
function syncHeaderHeight() {
  const height = elements.appHeader?.offsetHeight;
  if (!height) return 0;
  document.documentElement.style.setProperty("--header-h", `${height}px`);
  return height;
}

/**
 * 머리 아래로 잘린 창을 기준으로 요소가 보이는지 지켜본다.
 *
 * 머리는 불투명하게 붙어 있으므로, 그 밑으로 들어간 것은 화면에 있어도 보이지 않는다.
 * 창 자체를 머리 높이만큼 깎아 두면 "보인다"가 실제로 눈에 보인다는 뜻이 된다.
 */
function watch(target, headerHeight, onChange) {
  if (!target) return;
  const observer = new IntersectionObserver(onChange, {
    rootMargin: `-${headerHeight + SLACK}px 0px 0px 0px`,
    threshold: [0, 1],
  });
  observer.observe(target);
  observers = [...observers, observer];
}

/**
 * 한 번에 여러 기록이 올 수 있다. 첫 기록만 보면 지나간 상태로 판단하게 된다.
 * 마지막이 지금이다.
 */
const 마지막 = (entries) => entries[entries.length - 1];

/**
 * 제목이 머리에 가서 붙었나.
 *
 * "온전히 보이지 않는다"만으로는 모자란다. 화면보다 아래에 있어 아직 보이지도 않는 제목도
 * 그 조건에 걸린다 — 가로로 돌리거나(844×390) 화면이 짧으면 맨 위에서부터 붙은 것으로 읽혀,
 * 지나가는 줄도 없는데 흐림이 걸리고 머리 밑 그림자는 반대로 꺼졌다.
 * 잘라 둔 창의 윗변까지 올라왔을 때만 붙은 것이다.
 */
function 붙었나(entry) {
  if (entry.intersectionRatio >= 1) return false;
  const 창 = entry.rootBounds;
  return !창 || entry.boundingClientRect.top <= 창.top;
}

function rewatch() {
  const headerHeight = syncHeaderHeight();
  for (const observer of observers) observer.disconnect();
  observers = [];

  // 큰 금액이 머리 밑으로 들어가면 그 자리를 작은 총액이 대신한다.
  watch(elements.totalAmount, headerHeight, (entries) =>
    elements.appShell.classList.toggle("is-scrolled", !마지막(entries).isIntersecting));

  // 제목이 머리에 가서 붙었을 때만 그 아래를 흐려 준다.
  // 붙기 전에는 제목 밑을 지나가는 줄이 없으므로 흐릴 이유도 없다.
  watch(elements.sectionHeading, headerHeight, (entries) =>
    elements.appShell.classList.toggle("is-stuck", 붙었나(마지막(entries))));
}

export function watchHeaderSummary() {
  const { totalAmount, appShell, appHeader } = elements;
  if (!totalAmount || !appShell) return;

  /*
   * 관찰자가 없는 브라우저에서는 작은 총액을 그냥 두지 않는다(늘 띄우면 맨 위에서
   * 큰 금액과 나란히 두 번 보인다). 큰 금액은 그대로 있으므로 잃는 것은 없다.
   */
  if (typeof IntersectionObserver !== "function") {
    syncHeaderHeight();
    return;
  }

  rewatch();
  /*
   * 머리 높이는 화면을 돌릴 때 말고는 변하지 않는다. 그때만 다시 잰다.
   *
   * 이 함수는 앱을 띄울 때마다 불린다 — 로그인, 다시 로그인, 불러오기 실패 후 다시 시도.
   * 먼저 걸어 둔 것을 끊지 않으면 부를 때마다 하나씩 쌓여 화면을 돌릴 때 rewatch 가
   * 그만큼 겹쳐 돈다(계측: 다시 로그인하니 하나 더 생겼다).
   */
  sizeObserver?.disconnect();
  sizeObserver = null;
  if (appHeader && typeof ResizeObserver === "function") {
    sizeObserver = new ResizeObserver(rewatch);
    sizeObserver.observe(appHeader);
  }
}
