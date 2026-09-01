import assert from "node:assert/strict";
import test from "node:test";

import { 나무, 문서세우기 } from "./helpers/dom.mjs";

/*
 * 목록을 옆으로 밀어 수정·삭제를 꺼내는 자리. 열린 행은 하나뿐이라는 규칙과,
 * 얼마나 밀어야 열리느냐가 여기 있다. 여태 소스 문자열로만 봤다.
 */

문서세우기();
const { cancelSwipe, closeOpenRow, didJustSwipe, endSwipe, hasOpenRow, moveSwipe, resetSwipeState, setRowOpen, startSwipe } =
  await import("../src/ui/swipe.js");

/** 실제 목록 한 줄의 생김새. 액션 폭은 브라우저가 재는 값이라 여기서 넣어 준다. */
const 줄 = (폭 = 120) =>
  나무("article", { 반: ["swipe-row"] },
    나무("span", { 반: ["swipe-actions"], 폭 }),
    나무("div", { 반: ["swipe-surface"] }));

/** 얼마나 밀렸나. 한 번도 안 움직인 것과 제자리로 돌아온 것은 같은 뜻이라 함께 "" 로 본다. */
const 밀린값 = (행) => 행.querySelector(".swipe-surface").style.transform ?? "";

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

/* ── 손짓 ─────────────────────────────────────────────────── */

/** 포인터 하나가 지나간 자취. 시작점에서 (dx, dy) 만큼 끌고 손을 뗀다. */
function 끌기(시작, dx, dy, { 놓기 = "release" } = {}) {
  startSwipe({ target: 시작, clientX: 0, clientY: 0 });
  moveSwipe({ clientX: dx, clientY: dy });
  if (놓기 === "release") endSwipe();
  if (놓기 === "cancel") cancelSwipe();
}

test("반을 넘게 밀어야 열린다", () => {
  /*
   * 이 문턱이 이 파일의 핵심인데 여태 아무도 안 봤다. 문턱을 0.9 로 올리거나
   * "손 떼면 무조건 열기" 로 바꿔도 검사가 다 통과했다.
   *
   * 폭의 40% 가 문턱이다. 살짝 건드린 것으로 열리면 지우기 단추가 불쑥 나오고,
   * 너무 깊으면 끝까지 끌어야 열려 손이 아프다.
   */
  resetSwipeState();
  const 조금 = 줄(100);
  끌기(조금.querySelector(".swipe-surface"), -30, 0);
  assert.ok(!조금.classList.contains("is-open"), "30%만 밀었는데 열렸다");

  const 많이 = 줄(100);
  끌기(많이.querySelector(".swipe-surface"), -50, 0);
  assert.ok(많이.classList.contains("is-open"), "50%나 밀었는데 안 열렸다");
});

test("세로로 끌면 목록 스크롤에 양보한다", () => {
  /*
   * 세로가 우세하면 스와이프를 포기한다. 안 그러면 목록을 위아래로 훑는 동안
   * 행이 옆으로 밀려 스크롤이 안 된다.
   */
  resetSwipeState();
  const 행 = 줄(100);
  끌기(행.querySelector(".swipe-surface"), -20, -60);
  assert.ok(!행.classList.contains("is-open"), "세로로 끌었는데 스와이프가 가로챘다");
  assert.equal(밀린값(행), "", "세로로 끄는데 행이 옆으로 밀렸다");
  assert.ok(!didJustSwipe(), "세로 끌기를 스와이프로 쳤다");
});

test("액션 폭보다 더 밀리지 않는다", () => {
  // 더 밀리면 행 뒤의 빈 자리가 드러난다.
  resetSwipeState();
  const 행 = 줄(100);
  startSwipe({ target: 행.querySelector(".swipe-surface"), clientX: 0, clientY: 0 });
  moveSwipe({ clientX: -400, clientY: 0 });
  assert.equal(밀린값(행), "translateX(-100px)", "액션 폭을 넘겨 밀었다");
  // 반대쪽으로도 안 넘어간다. 오른쪽으로 끌어 봐야 제자리다.
  moveSwipe({ clientX: 400, clientY: 0 });
  assert.equal(밀린값(행), "");
  endSwipe();
});

test("액션 단추 위에서 시작한 누름은 단추 몫이다", () => {
  // 지우기를 누르려는 손가락이 조금 흔들렸다고 행이 따라 움직이면 안 된다.
  resetSwipeState();
  const 행 = 줄(100);
  끌기(행.querySelector(".swipe-actions"), -80, 0);
  assert.ok(!행.classList.contains("is-open"));
  assert.equal(밀린값(행), "");
});

test("브라우저가 제스처를 가져가면 끌기 전으로 되돌린다", () => {
  resetSwipeState();
  const 행 = 줄(100);
  끌기(행.querySelector(".swipe-surface"), -80, 0, { 놓기: "cancel" });
  assert.ok(!행.classList.contains("is-open"), "취소됐는데 열린 채로 남았다");
  assert.equal(밀린값(행), "");

  // 이미 열려 있던 것을 끌다 취소하면 열린 채로 돌아간다.
  const 열린것 = 줄(100);
  setRowOpen(열린것, true);
  끌기(열린것.querySelector(".swipe-surface"), 40, 0, { 놓기: "cancel" });
  assert.ok(열린것.classList.contains("is-open"), "열려 있던 것이 닫혀 버렸다");
});

test("스와이프 끝의 누름을 탭으로 오인하지 않는다", () => {
  // 손을 뗄 때 click 이 한 번 더 온다. 그것을 탭으로 치면 대화가 불쑥 열린다.
  resetSwipeState();
  assert.ok(!didJustSwipe());
  끌기(줄(100).querySelector(".swipe-surface"), -80, 0);
  assert.ok(didJustSwipe(), "스와이프였는데 아니라고 한다");
});
