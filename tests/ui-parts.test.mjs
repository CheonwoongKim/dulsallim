import assert from "node:assert/strict";
import test from "node:test";

import { 나무, 문서세우기, 요소만들기 } from "./helpers/dom.mjs";

/*
 * 작은 부품 넷. 셋 다 분기가 하나씩 있는데, 그 분기가 왜 있는지가 소스 주석에만 있고
 * 잰 적은 없었다 — 커서를 잃지 않으려고 단추를 고쳐 쓴다, 움직임을 줄여 달라고 한
 * 사람에게는 연출을 안 쓴다, 같은 것들이다.
 */

const { 뿌리 } = 문서세우기();
const { paintMemberTabs } = await import("../src/ui/member-tabs.js");
const { setMembers } = await import("../src/members.js");
const { fillCategoryOptions } = await import("../src/ui/category-options.js");
const { afterMotion } = await import("../src/ui/after-motion.js");
const { withViewTransition } = await import("../src/ui/view-transition.js");
const { CATEGORIES } = await import("../src/domain/expenses.js");

/* ── 사람 탭 ──────────────────────────────────────────────── */

const 두사람 = [
  { id: "a", name: "우리", color: "#20211e", goal: null },
  { id: "b", name: "너와", color: "#f2674b", goal: null },
];

test("전체와 사람들을 차례로 놓는다", () => {
  setMembers(두사람);
  const 자리 = 요소만들기("div");
  paintMemberTabs(자리, null);
  assert.deepEqual(자리.children.map((b) => b.textContent), ["전체", "우리", "너와"]);
  assert.deepEqual(자리.children.map((b) => b.dataset.member), ["", "a", "b"]);
  // 지금 고른 것만 눌린 것으로 읽힌다.
  assert.deepEqual(자리.children.map((b) => b.getAttribute("aria-pressed")), ["true", "false", "false"]);

  paintMemberTabs(자리, "b");
  assert.deepEqual(자리.children.map((b) => b.getAttribute("aria-pressed")), ["false", "false", "true"]);
});

test("위시처럼 전체가 없는 자리도 있다", () => {
  // 각자의 목록이라 "전체" 라는 자리가 없다.
  setMembers(두사람);
  const 자리 = 요소만들기("div");
  paintMemberTabs(자리, "a", { 전체: false });
  assert.deepEqual(자리.children.map((b) => b.textContent), ["우리", "너와"]);
});

test("단추를 갈아 끼우지 않고 고쳐 쓴다", () => {
  /*
   * 통째로 갈아 끼우면 방금 누른 단추가 그 자리에서 사라져 커서가 <body> 로 떨어진다.
   * 키보드로 고른 사람은 누른 순간 자리를 놓치고 다음 Tab 이 화면 처음부터 다시 짚는다.
   * 사람 수가 그대로면 같은 단추가 그대로 있어야 한다.
   */
  setMembers(두사람);
  const 자리 = 요소만들기("div");
  paintMemberTabs(자리, null);
  const 처음것 = [...자리.children];
  paintMemberTabs(자리, "a");
  assert.deepEqual(자리.children, 처음것, "같은 사람 수인데 단추를 새로 만들었다");

  // 사람 수가 달라졌을 때만 새로 만든다.
  setMembers([...두사람, { id: "c", name: "셋", color: "#20211e", goal: null }]);
  paintMemberTabs(자리, null);
  assert.equal(자리.children.length, 4);
  assert.notDeepEqual(자리.children, 처음것);
});

/* ── 분류 선택지 ──────────────────────────────────────────── */

test("분류는 한 곳에서만 만든다", () => {
  /*
   * 손으로 적어 두면 분류를 하나 더할 때 세 곳을 고쳐야 하고, 한 곳을 빠뜨리면
   * 그 화면에서만 조용히 안 보인다.
   */
  const 고르개 = 나무("select", { 자료: { categories: "food" } });
  뿌리.replaceChildren(고르개);
  fillCategoryOptions(뿌리);

  const 값들 = Object.keys(CATEGORIES);
  assert.deepEqual(고르개.children.map((o) => o.value), 값들);
  assert.deepEqual(고르개.children.map((o) => o.textContent), 값들.map((v) => CATEGORIES[v].label));
  // data-categories 에 적힌 것이 처음부터 골라져 있다.
  assert.deepEqual(고르개.children.filter((o) => o.selected).map((o) => o.value), ["food"]);
});

test("두 번 채워도 선택지가 쌓이지 않는다", () => {
  const 고르개 = 나무("select", { 자료: { categories: "etc" } });
  뿌리.replaceChildren(고르개);
  fillCategoryOptions(뿌리);
  fillCategoryOptions(뿌리);
  assert.equal(고르개.children.length, Object.keys(CATEGORIES).length);
});

/* ── 움직임이 끝난 뒤 ─────────────────────────────────────── */

test("움직임이 없으면 곧바로 한다", () => {
  /*
   * 움직임을 줄여 달라고 한 사람에게는 전환이 없다. 기다리면 영영 안 끝난다.
   */
  const 요소 = 요소만들기("div");
  let 했나 = false;
  const 그만 = afterMotion(요소, () => (했나 = true));
  assert.equal(했나, true, "전환이 없는데 기다렸다");
  assert.equal(typeof 그만, "function", "그만두는 길은 언제나 있어야 한다");
});

test("움직임이 끝나야 한다", async () => {
  const 요소 = 요소만들기("div");
  let 끝내기;
  요소.getAnimations = () => [{ finished: new Promise((풀기) => (끝내기 = 풀기)) }];
  let 했나 = false;
  afterMotion(요소, () => (했나 = true));
  await Promise.resolve();
  assert.equal(했나, false, "아직 움직이는데 벌써 했다");
  끝내기();
  await new Promise((풀기) => setTimeout(풀기, 0));
  assert.equal(했나, true);
});

test("도중에 취소돼도 뒤처리는 한다", async () => {
  // finished 는 취소되면 거절된다. 그래도 잠근 것은 풀어야 한다.
  const 요소 = 요소만들기("div");
  요소.getAnimations = () => [{ finished: Promise.reject(new Error("cancelled")) }];
  let 했나 = false;
  afterMotion(요소, () => (했나 = true));
  await new Promise((풀기) => setTimeout(풀기, 0));
  assert.equal(했나, true, "취소되면 뒤처리를 안 한다");
});

test("그만두라고 하면 안 한다", async () => {
  // 시트가 닫히는 도중에 다시 열리면 앞의 뒤처리가 돌면 안 된다.
  const 요소 = 요소만들기("div");
  요소.getAnimations = () => [{ finished: Promise.resolve() }];
  let 했나 = false;
  const 그만 = afterMotion(요소, () => (했나 = true));
  그만();
  await new Promise((풀기) => setTimeout(풀기, 0));
  assert.equal(했나, false);
});

/* ── 화면 이어 주기 ───────────────────────────────────────── */

test("이어 주기를 못 하면 그냥 바꾼다", () => {
  // 잃는 것은 연출뿐이라 기능은 그대로여야 한다.
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  delete document.startViewTransition;
  let 바뀌었나 = false;
  withViewTransition(() => (바뀌었나 = true));
  assert.equal(바뀌었나, true);
});

test("움직임을 줄여 달라고 했으면 연출을 안 쓴다", () => {
  const 부른것 = [];
  document.startViewTransition = (바꾸기) => 부른것.push(바꾸기);
  globalThis.window = { matchMedia: (질문) => ({ matches: 질문.includes("reduce") }) };
  let 바뀌었나 = false;
  withViewTransition(() => (바뀌었나 = true));
  assert.equal(바뀌었나, true, "연출을 건너뛰면서 바꾸지도 않았다");
  assert.equal(부른것.length, 0, "줄여 달라고 했는데 연출을 썼다");
});

test("쓸 수 있으면 브라우저에게 맡긴다", () => {
  const 부른것 = [];
  document.startViewTransition = (바꾸기) => 부른것.push(바꾸기);
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  let 바뀌었나 = false;
  withViewTransition(() => (바뀌었나 = true));
  assert.equal(부른것.length, 1, "브라우저에게 안 맡겼다");
  assert.equal(바뀌었나, false, "브라우저가 부르기 전에 벌써 바꿨다");
  부른것[0]();
  assert.equal(바뀌었나, true);
});
