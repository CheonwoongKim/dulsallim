import assert from "node:assert/strict";
import test from "node:test";

import { createDragTracker } from "../src/ui/drag-tracker.js";

/** 콜백 호출을 기록하는 트래커를 만든다. decide는 기본적으로 가로 우세만 받아들인다. */
function makeTracker(overrides = {}) {
  const calls = [];
  const tracker = createDragTracker({
    onBegin: (event) => (event.reject ? null : { id: "ctx", offset: 0 }),
    onDecide: ({ dx, dy }) => Math.abs(dx) > Math.abs(dy),
    onDrag: ({ dx, dy, context }) => {
      context.offset = dx;
      calls.push(`drag:${dx},${dy}`);
    },
    onRelease: ({ context }) => calls.push(`release:${context.offset}`),
    ...overrides,
  });
  return { tracker, calls };
}

const at = (x, y, extra = {}) => ({ clientX: x, clientY: y, ...extra });

test("slop을 넘기 전에는 아무 콜백도 부르지 않는다", () => {
  const { tracker, calls } = makeTracker();
  tracker.start(at(100, 100));
  tracker.move(at(103, 102));
  tracker.move(at(104, 104));
  assert.deepEqual(calls, [], "5px 미만 흔들림은 탭으로 봐야 한다");
});

test("slop을 넘으면 방향을 한 번만 판정한다", () => {
  const decisions = [];
  const { tracker, calls } = makeTracker({
    onDecide: ({ dx, dy }) => {
      decisions.push([dx, dy]);
      return Math.abs(dx) > Math.abs(dy);
    },
  });
  tracker.start(at(100, 100));
  tracker.move(at(120, 101));
  tracker.move(at(140, 101));
  tracker.move(at(160, 101));
  assert.equal(decisions.length, 1, "판정은 최초 1회만");
  assert.equal(calls.length, 3);
});

test("내 제스처가 아니면 즉시 추적을 포기한다", () => {
  const { tracker, calls } = makeTracker();
  tracker.start(at(100, 100));
  tracker.move(at(101, 130)); // 세로 우세
  tracker.move(at(101, 200));
  tracker.release();
  assert.deepEqual(calls, [], "세로 스크롤을 방해하면 안 된다");
});

test("onBegin이 null을 주면 추적하지 않는다", () => {
  const { tracker, calls } = makeTracker();
  tracker.start(at(100, 100, { reject: true }));
  tracker.move(at(200, 100));
  tracker.release();
  assert.deepEqual(calls, []);
});

test("손을 떼면 마지막 컨텍스트로 release가 불린다", () => {
  const { tracker, calls } = makeTracker();
  tracker.start(at(100, 100));
  tracker.move(at(150, 100));
  tracker.move(at(180, 100));
  tracker.release();
  assert.deepEqual(calls, ["drag:50,0", "drag:80,0", "release:80"]);
});

test("판정 전에 손을 떼면 release가 불리지 않는다", () => {
  const { tracker, calls } = makeTracker();
  tracker.start(at(100, 100));
  tracker.release();
  assert.deepEqual(calls, [], "단순 탭은 제스처가 아니다");
});

test("cancel은 지정하면 별도 처리, 없으면 release로 대체된다", () => {
  const withCancel = [];
  const t1 = createDragTracker({
    onBegin: () => ({}),
    onDecide: () => true,
    onDrag: () => {},
    onRelease: () => withCancel.push("release"),
    onCancel: () => withCancel.push("cancel"),
  });
  t1.start(at(0, 0));
  t1.move(at(20, 0));
  t1.cancel();
  assert.deepEqual(withCancel, ["cancel"]);

  const { tracker, calls } = makeTracker();
  tracker.start(at(100, 100));
  tracker.move(at(150, 100));
  tracker.cancel();
  assert.deepEqual(calls, ["drag:50,0", "release:50"], "onCancel이 없으면 release로 마무리");
});

test("release 뒤에는 상태가 비어 두 번 불려도 안전하다", () => {
  const { tracker, calls } = makeTracker();
  tracker.start(at(100, 100));
  tracker.move(at(150, 100));
  tracker.release();
  tracker.release();
  tracker.move(at(200, 100));
  assert.deepEqual(calls, ["drag:50,0", "release:50"]);
});

test("reset은 콜백 없이 추적만 버린다", () => {
  const { tracker, calls } = makeTracker();
  tracker.start(at(100, 100));
  tracker.move(at(150, 100));
  tracker.reset();
  tracker.release();
  assert.deepEqual(calls, ["drag:50,0"], "목록이 다시 그려지면 진행 중 제스처는 없던 일이 된다");
});

test("slop은 조절할 수 있다", () => {
  const { tracker, calls } = makeTracker({ slop: 20 });
  tracker.start(at(0, 0));
  tracker.move(at(10, 0));
  assert.deepEqual(calls, [], "slop 미만");
  tracker.move(at(25, 0));
  assert.deepEqual(calls, ["drag:25,0"]);
});
