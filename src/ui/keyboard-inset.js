const root = document.documentElement;

/** 이보다 작은 차이는 키보드가 아니라 주소창이 오르내린 것이다. */
const KEYBOARD_MIN = 120;

/**
 * 키보드가 차지한 높이를 CSS 로 알려 준다.
 *
 * iOS Safari 는 키보드가 뜰 때 레이아웃 뷰포트를 통째로 밀어 올린다. 다른 브라우저처럼
 * "밀지 마라"고 지정하는 스위치(viewport 의 interactive-widget)는 Safari 가 아직 없다
 * (iOS 26.5 까지 미지원).
 *
 * 그래서 바닥에 붙은 시트가 키보드에 가려지면, Safari 가 입력칸을 보이게 하려고 화면을 민다.
 * 미는 동안 누른 손가락 밑으로는 다른 요소가 들어온다 — 닫기를 눌렀는데 그 자리로 올라온
 * 분류 목록이 열리던 것이 이것이다. 날짜·분류·항목·금액을 차례로 누르면 그때마다 밀리므로
 * 만질수록 어긋났다.
 *
 * 시트를 처음부터 키보드 위 공간에 맞춰 두면 Safari 가 밀 이유 자체가 없어진다.
 */
function sync() {
  const viewport = window.visualViewport;
  if (!viewport) return;

  /*
   * innerHeight 는 키보드와 상관없이 그대로다(레이아웃 뷰포트).
   * visualViewport 는 키보드에 가려지고 남은 자리다. 그 차이가 키보드가 먹은 높이다.
   * offsetTop 을 빼는 이유: Safari 가 이미 밀어 놓았다면 그만큼은 이미 반영된 것이다.
   */
  const inset = window.innerHeight - viewport.height - viewport.offsetTop;
  /*
   * 주소창이 오르내려도 두 높이는 조금씩 어긋난다. 그걸 키보드로 오해하면 시트 밑에
   * 까닭 없는 빈 틈이 생긴다. 키보드는 이보다 훨씬 크므로 작은 차이는 없는 것으로 본다.
   */
  root.style.setProperty("--keyboard-inset", inset > KEYBOARD_MIN ? `${Math.round(inset)}px` : "0px");
  root.style.setProperty("--viewport-h", `${Math.round(viewport.height)}px`);
}

export function watchKeyboard() {
  const viewport = window.visualViewport;
  // 없는 브라우저에서는 변수도 두지 않는다. CSS 의 기본값이 지금까지의 동작이다.
  if (!viewport) return;
  sync();
  viewport.addEventListener("resize", sync);
  viewport.addEventListener("scroll", sync);
}
