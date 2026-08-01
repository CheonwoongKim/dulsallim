let lockedScrollY = 0;

/**
 * 시트가 열린 동안 배경 페이지가 움직이지 않게 고정한다.
 * iOS는 overflow:hidden만으로는 스크롤이 막히지 않아 position:fixed로 위치를 잡아둔다.
 */
export function lockPageScroll() {
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
  document.documentElement.classList.remove("sheet-open");
  document.body.classList.remove("sheet-open");
  document.body.style.removeProperty("position");
  document.body.style.removeProperty("top");
  document.body.style.removeProperty("right");
  document.body.style.removeProperty("left");
  document.body.style.removeProperty("width");
  window.scrollTo(0, lockedScrollY);
}
