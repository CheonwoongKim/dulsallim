const DEFAULT_SLOP = 6;

/**
 * 포인터 끌기 제스처의 공통 뼈대.
 *
 * 손가락이 slop을 넘기 전에는 아무것도 하지 않는다. 넘는 순간 **한 번만** 방향을 판정하고,
 * 그 제스처가 내 것이 아니면 즉시 손을 뗀다(브라우저의 스크롤을 방해하지 않기 위해).
 *
 * @param {object} config
 * @param {number} [config.slop] 판정을 유보할 이동 거리(px)
 * @param {(event: PointerEvent) => object|null} config.onBegin 추적할 대상이면 컨텍스트를, 아니면 null
 * @param {(info: {dx: number, dy: number, context: object}) => boolean} config.onDecide 내 제스처가 맞는지
 * @param {(info: {dx: number, dy: number, context: object}) => void} config.onDrag 매 이동마다
 * @param {(info: {context: object}) => void} config.onRelease 손을 뗐을 때
 * @param {(info: {context: object}) => void} [config.onCancel] 브라우저가 제스처를 가져갔을 때(생략 시 onRelease)
 */
export function createDragTracker({ slop = DEFAULT_SLOP, onBegin, onDecide, onDrag, onRelease, onCancel }) {
  let state = null;

  function finish(handler) {
    if (!state) return;
    const { context, active } = state;
    state = null;
    if (active) handler({ context });
  }

  return {
    start(event) {
      const context = onBegin(event);
      state = context
        ? { context, startX: event.clientX, startY: event.clientY, decided: false, active: false }
        : null;
    },

    move(event) {
      if (!state) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;

      if (!state.decided) {
        if (Math.abs(dx) < slop && Math.abs(dy) < slop) return;
        state.decided = true;
        state.active = onDecide({ dx, dy, context: state.context });
        if (!state.active) {
          state = null;
          return;
        }
      }

      onDrag({ dx, dy, context: state.context });
    },

    release() {
      finish(onRelease);
    },

    cancel() {
      finish(onCancel ?? onRelease);
    },

    /** 추적 대상 DOM이 사라졌을 때처럼 아무 콜백 없이 상태만 버린다. */
    reset() {
      state = null;
    },
  };
}
