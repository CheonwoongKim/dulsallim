import { elements } from "../dom.js";
import { createDragTracker } from "./drag-tracker.js";
import { lockPageScroll, unlockPageScroll } from "./scroll-lock.js";

/*
 * 닫히는 데 걸리는 시간. sheet.css 의 transform 전환보다 짧으면 안 된다.
 * 짧으면 애니메이션 도중에 hidden 이 걸려 시트가 툭 사라진다.
 */
const CLOSE_MS = 420;
const DISMISS_DISTANCE = 96;
const SETTLE_MS = 350;
/** pointerdown 뒤 focusout 이 따라오는 데 걸리는 시간. 넉넉히 잡되 옛 기록은 안 믿는다. */
const PRESS_WINDOW_MS = 700;
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
];

let lastFocusedElement = null;
let closeTimer = null;
let swallowTimer = null;
/** 닫기 누름 직후 따라오는 click 한 번을 삼킬지. */
let swallowNextClick = false;
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
  // 닫히는 도중에 다시 열 수 있다. 막아 둔 것을 먼저 푼다.
  sheet.classList.remove("is-closing");
  // 어떤 경로로든 굳은 채 남았다면 여기서 푼다. 갓 연 시트가 안 눌리는 일만은 없어야 한다.
  sheet.querySelectorAll(".is-settling").forEach((el) => el.classList.remove("is-settling"));
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
  /*
   * 닫는 동안에는 시트 안의 무엇도 눌리지 않게 한다.
   *
   * click 은 손을 뗄 때 좌표를 다시 히트테스트한다. 그런데 포커스를 놓는 순간
   * 키보드가 내려가기 시작해 시트가 움직이므로, 닫기를 누른 손가락 밑에 다른 것이
   * 들어와 대신 눌린다. 분류 select 가 닫기 버튼에서 330px 아래인데 아이폰 키보드가
   * 딱 그만한 높이라, 실제로 분류 피커가 열리는 일이 있었다.
   *
   * 어느 요소가 들어오는지 맞히는 대신 통째로 막는다. 어차피 사라질 화면이라 잃을 것이 없다.
   */
  sheet.classList.add("is-closing");

  // 포커스를 먼저 놓아 키보드가 내려가기 시작하게 한다.
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && sheet.contains(focused)) focused.blur();

  elements.backdrop.classList.remove("is-visible");
  sheet.classList.remove("is-visible");
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    elements.backdrop.hidden = true;
    sheet.hidden = true;
    sheet.classList.remove("is-closing");
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
const settleTimers = new WeakMap();

function beginSettle(scroller) {
  // 타이머를 하나로 쓰면 두 폼이 잇달아 굳을 때 뒤엣것이 앞엣것의 해제를 취소한다.
  // 그러면 앞 폼은 pointer-events: none 인 채로 영영 남아 입력이 아예 안 된다.
  clearTimeout(settleTimers.get(scroller));
  scroller.classList.add("is-settling");
  settleTimers.set(
    scroller,
    setTimeout(() => scroller.classList.remove("is-settling"), SETTLE_MS),
  );
}

/** 마지막으로 손이 닿은 곳. focusout 만으로는 "어디를 눌러서" 포커스가 빠졌는지 알 수 없다. */
let lastPress = { target: null, at: 0 };
document.addEventListener(
  "pointerdown",
  (event) => {
    lastPress = { target: event.target, at: event.timeStamp };
  },
  true,
);

/**
 * 포커스가 폼 밖으로 나가면 잠깐 굳힌다. 단, 폼 안을 눌러서 빠진 경우는 뺀다.
 *
 * iOS 사파리는 버튼을 탭해도 포커스를 주지 않는다. 그래서 금액 칸에 커서가 있는 채로
 * 「추가」를 누르면 relatedTarget 이 빈 focusout 이 먼저 오는데, 이것까지 "폼을 떠났다"로
 * 치면 폼 전체가 pointer-events: none 이 되어 방금 누른 그 click 이 통째로 사라진다.
 * 버튼이 안 눌리고 분류 선택이 됐다 안 됐다 하던 원인이 이것이다.
 *
 * 눌린 곳이 폼 안이면 키보드가 내려가도 시트는 그 자리에 있으므로 굳힐 이유도 없다.
 */
export function settleOnFocusLeave(form) {
  form.addEventListener("focusout", (event) => {
    if (form.contains(event.relatedTarget)) return;
    // 방금 누른 곳이 폼 안이면 그 손짓의 결과다. 시간까지 보는 건 오래된 기록을 믿지 않기 위해서다.
    const 방금 = event.timeStamp - lastPress.at < PRESS_WINDOW_MS;
    if (!방금) return beginSettle(form);
    if (form.contains(lastPress.target)) return;
    // 닫기를 누른 것이라면 시트가 통째로 사라지는 중이다. 잘못 눌릴 입력 자체가 없으니
    // 굳힐 이유가 없고, 굳히면 닫히는 동안과 다시 열었을 때까지 입력이 먹지 않는다.
    if (lastPress.target?.closest?.(".close-button")) return;
    beginSettle(form);
  });
}

/*
 * 키보드가 오르내리면 보이는 화면의 높이가 바뀌고, 그만큼 시트가 움직인다.
 * 그 순간 노린 곳과 실제로 눌리는 곳이 어긋난다 — 닫기 버튼을 보고 눌렀는데
 * 327px 아래에 있던 분류 select 가 그 자리에 올라와 대신 눌렸다(아이폰 키보드 높이가 딱 그만하다).
 *
 * focusout 으로는 이 순간을 잡을 수 없다. 키보드가 뜰 때 포커스는 폼 안에 그대로 있어
 * 아무 신호도 나지 않는다. 화면 크기가 바뀌는 것이 유일하게 정확한 신호다.
 */
window.visualViewport?.addEventListener("resize", () => {
  const scroller = getOpenSheet()?.querySelector(".sheet-scroll");
  if (scroller) beginSettle(scroller);
});

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
