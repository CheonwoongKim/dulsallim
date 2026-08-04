import { elements } from "../dom.js";
import { afterMotion } from "./after-motion.js";
import { createDragTracker } from "./drag-tracker.js";
import { lockPageScroll, unlockPageScroll } from "./scroll-lock.js";

const DISMISS_DISTANCE = 96;
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 열릴 수 있는 시트 전부. 포커스 가두기와 드래그 배선이 이 목록을 따른다. */
export const SHEETS = [
  elements.sheet,
  elements.monthSheet,
  elements.fixedSheet,
  elements.notesSheet,
  elements.nagSheet,
  elements.trendSheet,
  elements.resetSheet,
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

function hasInteractiveSheet(except = null) {
  return SHEETS.some((sheet) => {
    if (sheet === except) return false;
    const phase = getSheetState(sheet).phase;
    return phase === "opening" || phase === "open";
  });
}

function moveFocusIntoSheet(sheet) {
  if (sheet.contains(document.activeElement)) return;
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
  elements.backdrop.style.removeProperty("opacity");
  elements.backdrop.hidden = false;
  sheet.hidden = false;

  requestAnimationFrame(() => {
    if (state.phase !== "opening") return;
    elements.backdrop.classList.add("is-visible");
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

  if (!hasInteractiveSheet(sheet)) elements.backdrop.classList.remove("is-visible");
  sheet.classList.remove("is-visible");

  state.stopWaiting?.();
  state.stopWaiting = afterMotion(sheet, () => {
    // 다시 열렸으면 그 사이에 phase 가 바뀐다. 그때는 뒤처리를 하면 안 된다.
    if (state.phase !== "closing") return;
    state.phase = "closed";
    state.stopWaiting = null;
    sheet.hidden = true;
    sheet.classList.remove("is-closing");
    sheet.style.removeProperty("--drag-y");
    mountedSheets.delete(sheet);
    unlockPageScroll(sheet);

    const afterHidden = state.onHidden;
    const focusTarget = state.lastFocusedElement;
    state.onHidden = null;
    state.lastFocusedElement = null;
    afterHidden?.();

    if (mountedSheets.size === 0) {
      elements.backdrop.hidden = true;
      requestAnimationFrame(() => focusTarget?.focus?.());
    }
  });
}

function getOpenSheet() {
  return (
    SHEETS.find((sheet) => {
      const phase = getSheetState(sheet).phase;
      return phase === "opening" || phase === "open";
    }) || null
  );
}

function getFocusable(sheet) {
  return [...sheet.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
}

/** aria-modal 시트 밖으로 포커스가 새 나가지 않도록 Tab 순환을 가둔다. */
export function trapTab(event) {
  if (event.key !== "Tab") return;
  const sheet = getOpenSheet();
  if (!sheet) return;

  const focusable = getFocusable(sheet);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Tab 이외의 경로(프로그램 포커스 등)로 빠져나간 포커스도 시트 안으로 되돌린다. */
export function keepFocusInSheet(event) {
  const sheet = getOpenSheet();
  if (!sheet || sheet.contains(event.target)) return;
  getFocusable(sheet)[0]?.focus();
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
    elements.backdrop.style.opacity = String(fade);
  },

  onRelease({ context }) {
    context.sheet.classList.remove("is-dragging");
    elements.backdrop.style.removeProperty("opacity");
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
