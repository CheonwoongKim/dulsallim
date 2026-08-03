import { elements } from "../dom.js";
import { createDragTracker } from "./drag-tracker.js";
import { lockPageScroll, unlockPageScroll } from "./scroll-lock.js";

const CLOSE_MS = 320;
const DISMISS_DISTANCE = 96;
const SETTLE_MS = 350;
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 열릴 수 있는 시트 전부. 포커스 가두기와 드래그 배선이 이 목록을 따른다. */
export const SHEETS = [
  elements.sheet,
  elements.monthSheet,
  elements.fixedSheet,
  elements.notesSheet,
  elements.nagSheet,
];

let lastFocusedElement = null;
let closeTimer = null;
let swallowTimer = null;
/** 닫기 누름 직후 따라오는 click 한 번을 삼킬지. */
let swallowNextClick = false;
let formSettleTimer = null;
let dismiss = () => {};

/** 아래로 끌어 닫을 때 어떤 시트를 닫을지는 기능 쪽이 안다. 배선은 app.js가 주입한다. */
export function setDismissHandler(handler) {
  dismiss = handler;
}

/**
 * 닫기 버튼을 누르면 그 순간 닫고, 뒤이어 오는 click 한 번을 삼킨다.
 *
 * click은 손을 뗄 때 좌표를 다시 히트테스트한다. 그때 시트는 이미 내려가 있어
 * 그 자리에 있던 다른 것(요약 카드, 목록 행)이 대신 눌린다.
 * 닫기를 pointerup까지 미루면 키보드가 내려가며 시트가 흔들려 또 다른 오탭이 생기므로,
 * 누르는 순간 닫되 뒤따르는 click만 막는 쪽을 택한다.
 */
export function closeOnPress(button, close) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    swallowNextClick = true;
    clearTimeout(swallowTimer);
    // 손을 아주 오래 짚고 있다 떼는 경우까지 막아 두지는 않는다. 안전장치로만 둔다.
    swallowTimer = setTimeout(() => {
      swallowNextClick = false;
    }, 1200);
    close();
  });
  // 키보드나 보조기술은 pointerdown 없이 click만 보낸다.
  button.addEventListener("click", close);
}

document.addEventListener(
  "click",
  (event) => {
    if (!swallowNextClick) return;
    swallowNextClick = false;
    clearTimeout(swallowTimer);
    event.preventDefault();
    event.stopPropagation();
  },
  true,
);

export function showSheet(sheet) {
  clearTimeout(closeTimer);
  lastFocusedElement = document.activeElement;
  sheet.style.removeProperty("--drag-y");
  elements.backdrop.style.removeProperty("opacity");
  elements.backdrop.hidden = false;
  sheet.hidden = false;
  lockPageScroll();
  requestAnimationFrame(() => {
    elements.backdrop.classList.add("is-visible");
    sheet.classList.add("is-visible");
  });
}

export function hideSheet(sheet, onHidden) {
  // 포커스를 먼저 놓아 키보드가 내려가기 시작하게 한다.
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && sheet.contains(focused)) focused.blur();

  elements.backdrop.classList.remove("is-visible");
  sheet.classList.remove("is-visible");
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    elements.backdrop.hidden = true;
    sheet.hidden = true;
    sheet.style.removeProperty("--drag-y");
    onHidden?.();
    unlockPageScroll();
    requestAnimationFrame(() => lastFocusedElement?.focus?.());
  }, CLOSE_MS);
}

function getOpenSheet() {
  return SHEETS.find((sheet) => sheet.classList.contains("is-visible")) || null;
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

/**
 * 모바일 키보드가 내려가는 동안 시트가 움직여 클릭 좌표가 엉뚱한 입력 요소에 떨어지는 것을 막는다.
 * 레이아웃이 자리를 잡을 때까지 폼만 잠깐 입력을 받지 않게 한다(헤더의 닫기 버튼은 계속 동작).
 */
export function beginSettle(scroller) {
  clearTimeout(formSettleTimer);
  scroller.classList.add("is-settling");
  formSettleTimer = setTimeout(() => {
    scroller.classList.remove("is-settling");
  }, SETTLE_MS);
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
