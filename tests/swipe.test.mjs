import assert from "node:assert/strict";
import test from "node:test";

import { 나무, 문서세우기 } from "./helpers/dom.mjs";

/*
 * 목록을 옆으로 밀어 수정·삭제를 꺼내는 자리. 열린 행은 하나뿐이라는 규칙과,
 * 얼마나 밀어야 열리느냐가 여기 있다. 여태 소스 문자열로만 봤다.
 */

문서세우기();
const { closeOpenRow, hasOpenRow, resetSwipeState, setRowOpen } = await import("../src/ui/swipe.js");

/** 실제 목록 한 줄의 생김새. 액션 폭은 브라우저가 재는 값이라 여기서 넣어 준다. */
const 줄 = (폭 = 120) =>
  나무("article", { 반: ["swipe-row"] },
    나무("span", { 반: ["swipe-actions"], 폭 }),
    나무("div", { 반: ["swipe-surface"] }));

const 밀린값 = (행) => 행.querySelector(".swipe-surface").style.transform;

test("열면 액션 폭만큼 밀고, 닫으면 되돌린다", () => {
  resetSwipeState();
  const 행 = 줄(120);
  setRowOpen(행, true);
  assert.equal(밀린값(행), "translateX(-120px)");
  // 내용면과 액션판이 같은 거리만큼 움직여야 색이 안 샌다.
  assert.equal(행.querySelector(".swipe-actions").style.transform, "translateX(-120px)");
  assert.ok(행.classList.contains("is-open"));
  assert.ok(hasOpenRow());

  setRowOpen(행, false);
  assert.equal(밀린값(행), "");
  assert.ok(!행.classList.contains("is-open"));
  assert.ok(!hasOpenRow());
});

test("열린 행은 언제나 하나뿐이다", () => {
  /*
   * 둘이 동시에 열려 있으면 어느 것을 지우는지 알 수 없다.
   * 다음 것을 열 때 앞엣것이 스스로 닫혀야 한다.
   */
  resetSwipeState();
  const 첫째 = 줄();
  const 둘째 = 줄();
  setRowOpen(첫째, true);
  setRowOpen(둘째, true);
  assert.ok(!첫째.classList.contains("is-open"), "앞 행이 열린 채로 남았다");
  assert.ok(둘째.classList.contains("is-open"));
  assert.equal(밀린값(첫째), "", "앞 행이 밀린 채로 남았다");
});

test("내용면이 없는 줄은 열지 않는다", () => {
  // 아직 안 그려졌거나 다른 생김새의 줄이다. 여기서 터지면 목록 전체가 안 그려진다.
  resetSwipeState();
  const 빈줄 = 나무("article", { 반: ["swipe-row"] });
  setRowOpen(빈줄, true);
  assert.ok(!hasOpenRow());
  assert.ok(!빈줄.classList.contains("is-open"));
});

test("열린 것을 닫는다 — 없으면 아무 일도 없다", () => {
  resetSwipeState();
  closeOpenRow();
  assert.ok(!hasOpenRow(), "열린 것이 없는데 무언가 열렸다");

  const 행 = 줄();
  setRowOpen(행, true);
  closeOpenRow();
  assert.ok(!hasOpenRow());
  assert.equal(밀린값(행), "");
});

test("목록을 다시 그리면 붙들고 있던 줄을 놓는다", () => {
  /*
   * 다시 그리면 열려 있던 행의 DOM 이 사라진다. 참조를 그대로 들고 있으면
   * 화면에 없는 것을 닫으려 든다.
   */
  resetSwipeState();
  setRowOpen(줄(), true);
  assert.ok(hasOpenRow());
  resetSwipeState();
  assert.ok(!hasOpenRow());
});
