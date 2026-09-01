import assert from "node:assert/strict";
import test from "node:test";

/*
 * 화면이 읽는 창고. 이 저장소에서 가장 많은 상태가 여기 있는데 여태 한 번도 못 돌려 봤다 —
 * supabase.js 가 브라우저에만 있는 자리(import.meta.env)를 곧장 파고들어, 불러오는 순간
 * 터졌기 때문이다. 그 자리를 없는 것도 견디게 고치고 나서 여기가 열렸다.
 *
 * 서버에 다녀오는 길은 여기서 안 본다(그건 목이 있어야 한다). 손대는 것은 화면이 곧바로
 * 읽어 가는 상태 — 보고 있는 달, 걸린 조건, 대화 개수, 로그아웃 뒤 남는 것.
 */

function 가짜저장소() {
  const 통 = new Map();
  return {
    getItem: (k) => (통.has(k) ? 통.get(k) : null),
    setItem: (k, v) => 통.set(k, String(v)),
    removeItem: (k) => 통.delete(k),
  };
}
globalThis.localStorage = 가짜저장소();

const store = await import("../src/store.js");
const { getMembers } = await import("../src/members.js");
const { writeSnapshot } = await import("../src/data/snapshot.js");
const { toMonthKey } = await import("../src/domain/expenses.js");

const 사본 = () => ({
  members: [{ id: "u1", name: "우리", color: "#20211e", goal: null }],
  expenses: [{ id: "e1", date: "2026-08-01", member: "u1", category: "etc", item: "커피", amount: 4500, createdAt: 1 }],
  fixedCosts: [{ id: "f1", member: "u1", category: "housing", item: "월세", amount: 500000, day: 1, startMonth: "2026-01" }],
  applied: ["f1:2026-08"],
  wishes: [{ id: "w1", name: "의자" }],
  noteCounts: { e1: 2 },
});

/* ── 보고 있는 달 ─────────────────────────────────────────── */

test("달을 옮기면 걸어 둔 날짜를 푼다", () => {
  /*
   * 8월 3일을 고른 채 9월로 넘어가면 아무것도 안 보인다.
   * 그 자리에서 왜 비었는지 알 길이 없어, 달이 바뀌면 날짜 조건을 함께 푼다.
   */
  store.setDateFilter("2026-08-03");
  store.setSelectedMonth("2026-09");
  assert.equal(store.getSelectedMonth(), "2026-09");
  assert.equal(store.getDateFilter(), null, "날짜 조건이 남았다");
});

test("사람·분류 조건은 달을 옮겨도 남는다", () => {
  // 보던 사람을 계속 보려고 달을 넘기는 것이 흔하다. 그때마다 풀리면 매번 다시 걸어야 한다.
  store.setMemberFilter("u1");
  store.setCategoryFilter("food");
  store.setSelectedMonth("2026-10");
  assert.equal(store.getMemberFilter(), "u1");
  assert.equal(store.getCategoryFilter(), "food");
});

/* ── 대화 개수 ────────────────────────────────────────────── */

test("같은 메시지를 두 번 세지 않는다", () => {
  /*
   * 내가 보낸 메시지는 응답으로도, 실시간 구독으로도 돌아온다.
   * 어느 쪽이 먼저 와도 한 번만 세야 목록의 숫자가 맞는다.
   */
  store.clearData();
  const 쪽지 = { id: "n1", expenseId: "e1" };
  assert.equal(store.countNote(쪽지), true, "처음 센 것인데 아니라고 한다");
  assert.equal(store.getNoteCount("e1"), 1);
  assert.equal(store.countNote(쪽지), false, "같은 메시지를 또 셌다");
  assert.equal(store.getNoteCount("e1"), 1);

  // 다른 메시지는 따로 센다.
  store.countNote({ id: "n2", expenseId: "e1" });
  assert.equal(store.getNoteCount("e1"), 2);
  // 말이 없는 지출은 0 이다.
  assert.equal(store.getNoteCount("없는지출"), 0);
});

/* ── 폰에 적어 둔 것 ──────────────────────────────────────── */

test("적어 둔 것으로 채우되 손은 대지 못한다", () => {
  /*
   * 아직 서버에 아무것도 안 물어봤다. 이 상태에서 무엇을 쓰려 하면 막혀야 한다 —
   * 화면은 보되 손은 대지 않는 짧은 사이다. context 가 그 자물쇠다.
   */
  store.clearData();
  writeSnapshot("u1", 사본());
  assert.equal(store.hydrateFromSnapshot({ id: "u1" }), true);

  assert.equal(store.getExpenses().length, 1, "지출을 안 채웠다");
  assert.equal(store.getFixedTemplates().length, 1);
  assert.deepEqual(store.getFixedApplied(), ["f1:2026-08"]);
  assert.equal(store.getWishes().length, 1);
  assert.equal(store.getNoteCount("e1"), 2, "대화 개수를 안 채웠다");
  assert.equal(getMembers().length, 1);

  assert.equal(store.getContext(), null, "손댈 수 있는 상태로 열렸다");
});

test("적어 둔 것이 없으면 그렇다고 한다", () => {
  store.clearData();
  assert.equal(store.hydrateFromSnapshot({ id: "없는사람" }), false);
  assert.equal(store.getExpenses().length, 0);
  // 사람을 모르면 아예 안 뒤진다.
  assert.equal(store.hydrateFromSnapshot(null), false);
  assert.equal(store.hydrateFromSnapshot(undefined), false);
});

test("다시 읽어 오면 센 것도 새로 센다", () => {
  /*
   * 서버에서 통째로 다시 읽으면 개수도 함께 새로 온다. 그런데 "이미 센 id" 를 그대로
   * 들고 있으면, 그 뒤에 구독으로 도착한 같은 메시지가 새 개수에 안 얹힌다 —
   * 화면의 숫자가 하나 모자란 채로 굳는다.
   */
  store.clearData();
  const 쪽지 = { id: "n1", expenseId: "e1" };
  store.countNote(쪽지);

  writeSnapshot("u1", 사본());
  store.hydrateFromSnapshot({ id: "u1" });

  assert.equal(store.countNote(쪽지), true, "다시 읽었는데 앞서 센 것을 기억하고 있다");
  assert.equal(store.getNoteCount("e1"), 3, "새로 읽은 2 에 하나가 얹혀야 한다");
});

/* ── 로그아웃 ─────────────────────────────────────────────── */

test("로그아웃하면 앞사람 것이 하나도 안 남는다", () => {
  store.clearData();
  writeSnapshot("u1", 사본());
  store.hydrateFromSnapshot({ id: "u1" });
  store.setMemberFilter("u1");
  store.setCategoryFilter("food");
  store.setDateFilter("2026-08-01");
  store.setViewMode("calendar");
  store.setSelectedMonth("2020-01");
  store.setHighlightId("e1");
  store.setPendingDelete({ id: "e1" }, 2);
  store.countNote({ id: "n9", expenseId: "e1" });

  store.clearData();

  assert.deepEqual(store.getExpenses(), []);
  assert.deepEqual(store.getFixedTemplates(), []);
  assert.deepEqual(store.getFixedApplied(), []);
  assert.deepEqual(store.getWishes(), []);
  assert.deepEqual(getMembers(), []);
  assert.equal(store.getNoteCount("e1"), 0);
  assert.equal(store.getContext(), null);
  assert.equal(store.getMemberFilter(), null);
  assert.equal(store.getCategoryFilter(), null);
  assert.equal(store.getDateFilter(), null);
  assert.equal(store.getHighlightId(), null);
  assert.equal(store.getPendingDelete(), null);
  // 보던 달과 보기 방식도 앞사람의 것이다. 남기면 다음 사람이 2020년 캘린더로 시작한다.
  assert.equal(store.getSelectedMonth(), toMonthKey(new Date()));
  assert.equal(store.getViewMode(), "list");
});

test("로그아웃하면 폰에 적어 둔 것도 지운다", () => {
  // 가계부는 폰에 남겨 둘 것이 아니다.
  store.clearData();
  writeSnapshot("u1", 사본());
  store.clearData();
  assert.equal(store.hydrateFromSnapshot({ id: "u1" }), false, "적어 둔 것이 남아 있다");
});

test("같은 메시지도 로그아웃 뒤에는 새로 센다", () => {
  // 센 것을 기억한 채로 두면 다음 사람 화면에서 그 메시지가 안 세어진다.
  store.clearData();
  const 쪽지 = { id: "n1", expenseId: "e1" };
  store.countNote(쪽지);
  store.clearData();
  assert.equal(store.countNote(쪽지), true, "앞사람이 센 것을 기억하고 있다");
});

/* ── 되돌리기 ─────────────────────────────────────────────── */

test("지운 것을 되돌릴 수 있게 들고 있는다", () => {
  store.clearData();
  const 지출 = { id: "e1", item: "커피" };
  store.setPendingDelete(지출, 3);
  // 대화도 함께 사라진다 — 몇 개를 잃었는지 알려 줘야 되돌릴지 정할 수 있다.
  assert.deepEqual(store.getPendingDelete(), { expense: 지출, lostNotes: 3 });
  store.setPendingDelete(null);
  assert.equal(store.getPendingDelete(), null);
  // 몇 개인지 안 넘기면 0 이다.
  store.setPendingDelete(지출);
  assert.equal(store.getPendingDelete().lostNotes, 0);
});
