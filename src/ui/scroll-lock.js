let lockedScrollY = 0;

/**
 * 잠금을 요청한 화면을 소유자로 기억한다.
 *
 * 단순 숫자는 같은 시트가 실수로 두 번 열렸을 때 2가 되어, 한 번 닫아도 페이지가
 * 영원히 잠긴다. 같은 소유자의 잠금은 한 번으로 취급하고 서로 다른 화면만 함께 센다.
 */
const defaultOwner = Symbol("page-scroll-lock");
const owners = new Set();

/** 잠긴 동안의 scrollY 는 0 이다. 그걸 "맨 위로 올라갔다"로 읽으면 안 되는 곳이 있다. */
export function isPageScrollLocked() {
  return owners.size > 0;
}

/**
 * 시트가 열린 동안 배경 페이지가 움직이지 않게 고정한다.
 * iOS는 overflow:hidden만으로는 스크롤이 막히지 않아 position:fixed로 위치를 잡아둔다.
 */
export function lockPageScroll(owner = defaultOwner) {
  if (owners.has(owner)) return;
  const alreadyLocked = owners.size > 0;
  owners.add(owner);
  // 다른 화면이 이미 잠갔다면 위치를 다시 읽지 않는다. 그때의 scrollY는 0이다.
  if (alreadyLocked) return;

  lockedScrollY = window.scrollY;
  document.documentElement.classList.add("sheet-open");
  document.body.classList.add("sheet-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.right = "0";
  document.body.style.left = "0";
  document.body.style.width = "100%";
}

export function unlockPageScroll(owner = defaultOwner) {
  if (!owners.delete(owner)) return;
  // 아직 다른 소유자가 열려 있으면 잠금을 유지한다.
  if (owners.size > 0) return;

  document.documentElement.classList.remove("sheet-open");
  document.body.classList.remove("sheet-open");
  document.body.style.removeProperty("position");
  document.body.style.removeProperty("top");
  document.body.style.removeProperty("right");
  document.body.style.removeProperty("left");
  document.body.style.removeProperty("width");
  window.scrollTo(0, lockedScrollY);
}
