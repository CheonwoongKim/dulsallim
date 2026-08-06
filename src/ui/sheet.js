import { elements } from "../dom.js";
import { afterMotion } from "./after-motion.js";
import { createDragTracker } from "./drag-tracker.js";
import { lockPageScroll, unlockPageScroll } from "./scroll-lock.js";

const DISMISS_DISTANCE = 96;

/** 열릴 수 있는 시트 전부. 포커스 가두기와 드래그 배선이 이 목록을 따른다. */
export const SHEETS = [
  elements.sheet,
  elements.monthSheet,
  elements.filterSheet,
  elements.fixedSheet,
  elements.notesSheet,
  elements.nagSheet,
  elements.trendSheet,
  elements.resetSheet,
  elements.wishSheet,
  elements.wishDetailSheet,
  elements.wishMenuSheet,
  elements.wishDropSheet,
  elements.wishAchieveSheet,
];

const sheetStates = new WeakMap();
const mountedSheets = new Set();
let dismiss = () => {};

function getSheetState(sheet) {
  let state = sheetStates.get(sheet);
  if (!state) {
    state = {
      phase: sheet.hidden ? "closed" : "open",
      stopWaiting: null,
      lastFocusedElement: null,
      onHidden: null,
    };
    sheetStates.set(sheet, state);
  }
  return state;
}

/**
 * 포커스를 시트 껍데기에 둔다. 안의 버튼이 아니라.
 *
 * showModal 은 시트 안 첫 요소(우리 경우 닫기 버튼)에 포커스를 준다. 그러면 열자마자
 * 닫기 아이콘에 동그란 포커스 링이 뜬다 — 누르지도 않았는데 눌린 것처럼 보인다.
 * 껍데기를 잡아 두면 링이 없고, 보조기술도 "무엇이 열렸는지"부터 읽는다.
 */
function moveFocusIntoSheet(sheet, 무조건 = false) {
  if (!무조건 && sheet.contains(document.activeElement)) return;
  sheet.tabIndex = -1;
  sheet.focus({ preventScroll: true });
}

/** 아래로 끌어 닫을 때 어떤 시트를 닫을지는 기능 쪽이 안다. 배선은 app.js가 주입한다. */
export function setDismissHandler(handler) {
  dismiss = handler;
}

/**
 * 탭이 완성된 뒤 닫는다.
 *
 * pointerdown에서 DOM을 움직이면 같은 손짓의 pointerup/click이 배경이나 select로
 * 다시 히트테스트된다. click이 이미 X 버튼으로 확정된 뒤에만 닫으면 전역 클릭 삼키기 없이
 * 포인터, 키보드, 보조기술이 모두 같은 한 경로를 쓴다.
 */
export function closeOnPress(button, close) {
  button.addEventListener("click", close);
}

export function showSheet(sheet) {
  const state = getSheetState(sheet);
  if (state.phase === "opening" || state.phase === "open") {
    // 같은 시트 안에서 목록↔폼을 바꾸면 방금 숨긴 요소가 포커스를 잃는다.
    // 브라우저가 click 기본 동작으로 숨은 버튼의 포커스를 정리한 다음 실행해야 하므로
    // 다음 렌더링 프레임까지 넘긴 뒤 포커스만 현재 시트로 되돌린다. 잠금은 더하지 않는다.
    requestAnimationFrame(() => requestAnimationFrame(() => moveFocusIntoSheet(sheet)));
    return;
  }

  const wasClosing = state.phase === "closing";
  state.stopWaiting?.();
  state.stopWaiting = null;
  state.onHidden = null;
  state.phase = "opening";
  if (!wasClosing) state.lastFocusedElement = document.activeElement;

  mountedSheets.add(sheet);
  lockPageScroll(sheet);
  sheet.classList.remove("is-closing");
  sheet.style.removeProperty("--drag-y");
  sheet.style.removeProperty("--backdrop-fade");
  sheet.hidden = false;
  /*
   * showModal 이 시트를 top layer 로 올린다. 그러면 브라우저가 배경(::backdrop)을 그려 주고,
   * 바깥을 통째로 못 만지게 하고, 포커스를 안에 가둬 준다. Esc 도 브라우저가 받는다.
   * 우리가 손으로 하던 일이 전부 여기로 넘어갔다 — 배경 스크롤 잠금만 빼고.
   */
  if (!sheet.open) sheet.showModal();
  // 그림이 그려지기 전에 되돌린다. 같은 작업 안이라 링이 한 번도 보이지 않는다.
  moveFocusIntoSheet(sheet, true);

  requestAnimationFrame(() => {
    if (state.phase !== "opening") return;
    sheet.classList.add("is-visible");
    state.phase = "open";
    moveFocusIntoSheet(sheet);
  });
}

export function hideSheet(sheet, onHidden) {
  const state = getSheetState(sheet);
  if (state.phase === "closed" || state.phase === "closing") return;

  state.phase = "closing";
  state.onHidden = onHidden;
  sheet.classList.add("is-closing");

  // 호출 지점은 click·Escape·pointerup 뒤다. 제스처의 대상이 확정된 다음 키보드를 내린다.
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && sheet.contains(focused)) focused.blur();

  sheet.classList.remove("is-visible");

  state.stopWaiting?.();
  state.stopWaiting = afterMotion(sheet, () => {
    // 다시 열렸으면 그 사이에 phase 가 바뀐다. 그때는 뒤처리를 하면 안 된다.
    if (state.phase !== "closing") return;
    state.phase = "closed";
    state.stopWaiting = null;
    if (sheet.open) sheet.close();
    sheet.hidden = true;
    sheet.classList.remove("is-closing");
    sheet.style.removeProperty("--drag-y");
    sheet.style.removeProperty("--backdrop-fade");
    mountedSheets.delete(sheet);
    unlockPageScroll(sheet);

    const afterHidden = state.onHidden;
    const focusTarget = state.lastFocusedElement;
    state.onHidden = null;
    state.lastFocusedElement = null;
    afterHidden?.();

    // 마지막 한 장이 닫힐 때만 원래 있던 자리로 포커스를 돌려준다.
    if (mountedSheets.size === 0) requestAnimationFrame(() => focusTarget?.focus?.());
  });
}

const dragTracker = createDragTracker({
  onBegin(event) {
    const sheet = event.currentTarget;
    // 닫기 버튼 누름은 시트 끌기가 아니다.
    if (sheet.hidden || event.target.closest(".close-button")) return null;
    return {
      sheet,
      scroller: event.target.closest(".sheet-scroll"),
      offset: 0,
    };
  },

  onDecide({ dx, dy, context }) {
    // 아래로 내리는 동작만 받는다. 내부가 이미 스크롤돼 있으면 스크롤이 우선이다.
    const scrolledDown = context.scroller ? context.scroller.scrollTop > 0 : false;
    if (dy <= Math.abs(dx) || scrolledDown) return false;
    context.sheet.classList.add("is-dragging");
    return true;
  },

  onDrag({ dy, context }) {
    context.offset = Math.max(0, dy);
    context.sheet.style.setProperty("--drag-y", `${context.offset}px`);
    const fade = 1 - Math.min(1, context.offset / (context.sheet.offsetHeight || 1));
    context.sheet.style.setProperty("--backdrop-fade", String(fade));
  },

  onRelease({ context }) {
    context.sheet.classList.remove("is-dragging");
    context.sheet.style.removeProperty("--backdrop-fade");
    if (context.offset > DISMISS_DISTANCE) {
      dismiss();
      return;
    }
    context.sheet.style.setProperty("--drag-y", "0px");
  },
});

export const startSheetDrag = dragTracker.start;
export const moveSheetDrag = dragTracker.move;
export const endSheetDrag = dragTracker.release;
