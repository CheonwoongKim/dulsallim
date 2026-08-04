import assert from "node:assert/strict";
import test from "node:test";

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
  };
}

function createStyle() {
  return {
    removeProperty(name) {
      delete this[name];
    },
  };
}

function installPageFixture() {
  const root = { classList: createClassList() };
  const body = { classList: createClassList(), style: createStyle() };
  const scrollCalls = [];

  globalThis.document = { documentElement: root, body };
  globalThis.window = {
    scrollY: 240,
    scrollTo: (...args) => scrollCalls.push(args),
  };

  return { root, body, scrollCalls };
}

test("같은 소유자가 스크롤을 두 번 잠가도 한 번의 해제로 완전히 풀린다", async () => {
  const { root, body, scrollCalls } = installPageFixture();
  const scrollLock = await import(`../src/ui/scroll-lock.js?idempotent=${Math.random()}`);
  const sheet = {};

  scrollLock.lockPageScroll(sheet);
  scrollLock.lockPageScroll(sheet);
  scrollLock.unlockPageScroll(sheet);

  assert.equal(scrollLock.isPageScrollLocked(), false);
  assert.equal(root.classList.contains("sheet-open"), false);
  assert.equal(body.classList.contains("sheet-open"), false);
  assert.equal(body.style.position, undefined);
  assert.deepEqual(scrollCalls, [[0, 240]]);
});

test("서로 다른 화면이 잠갔다면 마지막 화면이 닫힐 때까지 유지한다", async () => {
  const { root, body, scrollCalls } = installPageFixture();
  const scrollLock = await import(`../src/ui/scroll-lock.js?owners=${Math.random()}`);
  const page = {};
  const sheet = {};

  scrollLock.lockPageScroll(page);
  scrollLock.lockPageScroll(sheet);
  scrollLock.unlockPageScroll(sheet);

  assert.equal(scrollLock.isPageScrollLocked(), true);
  assert.equal(root.classList.contains("sheet-open"), true);
  assert.equal(body.style.position, "fixed");
  assert.deepEqual(scrollCalls, []);

  scrollLock.unlockPageScroll(page);
  assert.equal(scrollLock.isPageScrollLocked(), false);
  assert.deepEqual(scrollCalls, [[0, 240]]);
});

test("닫기 버튼은 pointerdown이 아니라 완성된 click에서 한 번만 닫는다", async () => {
  const listeners = new Map();
  const inertElement = {
    hidden: true,
    classList: createClassList(),
    style: createStyle(),
    addEventListener() {},
    querySelectorAll: () => [],
  };

  globalThis.document = {
    querySelector: () => inertElement,
    querySelectorAll: () => [],
    addEventListener() {},
    activeElement: null,
    documentElement: { classList: createClassList() },
    body: { classList: createClassList(), style: createStyle() },
  };
  globalThis.window = {};
  globalThis.HTMLElement = class {};

  const { closeOnPress } = await import(`../src/ui/sheet.js?click=${Math.random()}`);
  const button = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };
  let closes = 0;
  closeOnPress(button, () => {
    closes += 1;
  });

  listeners.get("pointerdown")?.({ preventDefault() {} });
  assert.equal(closes, 0, "손을 누른 시점에는 시트를 움직이면 안 된다");

  listeners.get("click")?.({});
  assert.equal(closes, 1, "탭이 완성된 뒤 정확히 한 번 닫혀야 한다");
});
