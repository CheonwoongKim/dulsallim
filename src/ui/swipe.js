import { createDragTracker } from "./drag-tracker.js";

const OPEN_RATIO = 0.4;

let openRow = null;

function getActionsWidth(item) {
  return item.querySelector(".swipe-actions").offsetWidth;
}

/** 내용면과 액션 패널을 같은 거리만큼 움직인다. 둘이 어긋나면 색이 새어 보인다. */
function applySwipeOffset(item, offset) {
  const value = offset ? `translateX(${offset}px)` : "";
  item.querySelectorAll(".swipe-surface, .swipe-actions").forEach((part) => {
    part.style.transform = value;
  });
}

export function setRowOpen(item, open) {
  if (!item.querySelector(".swipe-surface")) return;
  if (open) {
    if (openRow && openRow !== item) setRowOpen(openRow, false);
    applySwipeOffset(item, -getActionsWidth(item));
    item.classList.add("is-open");
    openRow = item;
    return;
  }
  applySwipeOffset(item, 0);
  item.classList.remove("is-open");
  if (openRow === item) openRow = null;
}

export function closeOpenRow() {
  if (openRow) setRowOpen(openRow, false);
}

const tracker = createDragTracker({
  onBegin(event) {
    const item = event.target.closest(".swipe-row");
    // 액션 버튼 위에서 시작한 누름은 버튼의 몫이다.
    if (!item || event.target.closest(".swipe-actions")) return null;
    const width = getActionsWidth(item);
    const startOffset = item === openRow ? -width : 0;
    return { item, width, startOffset, offset: startOffset };
  },

  onDecide({ dx, dy, context }) {
    // 세로가 우세하면 스와이프를 포기해 목록 스크롤을 방해하지 않는다.
    if (Math.abs(dx) <= Math.abs(dy)) return false;
    if (openRow && openRow !== context.item) setRowOpen(openRow, false);
    context.item.classList.add("is-dragging");
    return true;
  },

  onDrag({ dx, context }) {
    context.offset = Math.min(0, Math.max(-context.width, context.startOffset + dx));
    applySwipeOffset(context.item, context.offset);
  },

  onRelease({ context }) {
    context.item.classList.remove("is-dragging");
    setRowOpen(context.item, context.offset < -context.width * OPEN_RATIO);
  },

  // 브라우저가 제스처를 가져간 경우: 끌기 전 상태로 되돌린다.
  onCancel({ context }) {
    context.item.classList.remove("is-dragging");
    setRowOpen(context.item, context.startOffset < 0);
  },
});

export const startSwipe = tracker.start;
export const moveSwipe = tracker.move;
export const endSwipe = tracker.release;
export const cancelSwipe = tracker.cancel;

/** 목록을 다시 그리면 열려 있던 행의 DOM이 사라지므로 참조를 버린다. */
export function resetSwipeState() {
  openRow = null;
  tracker.reset();
}
