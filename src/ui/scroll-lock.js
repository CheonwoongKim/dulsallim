let lockedScrollY = 0;

/**
 * 몇 겹이 잠갔는지 센다.
 *
 * 전체 화면(설정) 위에 시트(고정비)를 열 수 있다. 세지 않으면 시트가 닫히며 잠금을 풀어,
 * 아직 열려 있는 화면 뒤로 배경이 다시 움직이고 원래 스크롤 위치도 0으로 덮어써진다.
 */
let depth = 0;

/**
 * 시트가 열린 동안 배경 페이지가 움직이지 않게 고정한다.
 * iOS는 overflow:hidden만으로는 스크롤이 막히지 않아 position:fixed로 위치를 잡아둔다.
 */
/** 잠긴 동안의 scrollY 는 0 이다. 그걸 "맨 위로 올라갔다"로 읽으면 안 되는 곳이 있다. */
export function isPageScrollLocked() {
  return depth > 0;
}

export function lockPageScroll() {
  depth += 1;
  // 이미 잠겨 있다면 위치를 다시 읽지 않는다. 그때의 scrollY는 0이라 원래 위치를 잃는다.
  if (depth > 1) return;

  lockedScrollY = window.scrollY;
  document.documentElement.classList.add("sheet-open");
  document.body.classList.add("sheet-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.right = "0";
  document.body.style.left = "0";
  document.body.style.width = "100%";
}

export function unlockPageScroll() {
  depth = Math.max(0, depth - 1);
  // 아직 무언가 열려 있으면 잠금을 유지한다.
  if (depth > 0) return;

  document.documentElement.classList.remove("sheet-open");
  document.body.classList.remove("sheet-open");
  document.body.style.removeProperty("position");
  document.body.style.removeProperty("top");
  document.body.style.removeProperty("right");
  document.body.style.removeProperty("left");
  document.body.style.removeProperty("width");
  window.scrollTo(0, lockedScrollY);
}
