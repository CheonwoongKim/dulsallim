import { toMonthKey } from "./expenses.js";
import { setMembers } from "./members.js";
import * as remote from "./data/remote.js";

/**
 * 화면과 서버 사이의 창고.
 *
 * 서버를 오갈 때마다 화면이 기다리면 목록이 껌뻑인다. 그래서 읽기는 여기 쌓아 둔
 * 사본에서 즉시 꺼내 쓰고(동기), 쓰기만 서버에 다녀온다(비동기).
 * 서버가 성공을 확인해 준 뒤에야 사본을 고치므로, 화면에 보이는 것은 항상 서버에 실제로 있는 것이다.
 */
let expenses = [];
let fixedTemplates = [];
let fixedApplied = [];

/** 어느 가구에, 누구 이름으로 쓸지. 로그인해야 정해진다. */
let context = null;

let selectedMonth = toMonthKey(new Date());
let memberFilter = null;
let highlightId = null;
let pendingDelete = null;

/* ── 불러오기 ─────────────────────────────────────────────── */

export async function loadAll(profile) {
  context = { householdId: profile.household_id, userId: profile.id };
  const data = await remote.fetchAll(profile.household_id);
  setMembers(data.members);
  expenses = data.expenses;
  fixedTemplates = data.fixedCosts;
  fixedApplied = data.applied;
}

/** 이름·색을 바꾼 뒤. 지출은 그대로 두고 명부만 다시 읽는다. */
export async function reloadMembers() {
  if (!context) return;
  setMembers(await remote.fetchMembers(context.householdId));
}

/** 가구의 모든 기록을 지운다. 되돌릴 수 없다. */
export async function resetHousehold() {
  await remote.resetHousehold(context.householdId);
  expenses = [];
  fixedTemplates = [];
  fixedApplied = [];
}

/** 상대가 바꾼 내용을 반영할 때. 구성원·고정비는 거의 안 바뀌므로 지출만 다시 읽는다. */
export async function reloadExpenses() {
  if (!context) return;
  const [nextExpenses, nextApplied] = await Promise.all([
    remote.fetchExpenses(context.householdId),
    remote.fetchApplied(),
  ]);
  expenses = nextExpenses;
  fixedApplied = nextApplied;
}

/** 로그아웃. 다음 사람이 앞사람 기록을 보지 않도록 사본을 비운다. */
export function clearData() {
  expenses = [];
  fixedTemplates = [];
  fixedApplied = [];
  context = null;
  setMembers([]);
  memberFilter = null;
  highlightId = null;
  pendingDelete = null;
}

/* ── 지출 ─────────────────────────────────────────────────── */

export function getExpenses() {
  return expenses;
}

export async function addExpense(input) {
  const created = await remote.insertExpense(input, context);
  expenses = [...expenses, created];
  return created;
}

export async function editExpense(id, input) {
  const updated = await remote.updateExpense(id, input, context);
  expenses = expenses.map((expense) => (expense.id === id ? updated : expense));
  return updated;
}

export async function removeExpense(id) {
  await remote.deleteExpenseRow(id);
  expenses = expenses.filter((expense) => expense.id !== id);
}

/* ── 고정비 ───────────────────────────────────────────────── */

export function getFixedTemplates() {
  return fixedTemplates;
}

export function getFixedApplied() {
  return fixedApplied;
}

export async function createFixedCost(input) {
  const created = await remote.insertTemplate(input, context);
  fixedTemplates = [...fixedTemplates, created];
  return created;
}

export async function updateFixedCost(id, input) {
  const updated = await remote.updateTemplate(id, input, context);
  fixedTemplates = fixedTemplates.map((template) => (template.id === id ? updated : template));
  return updated;
}

export async function deleteFixedCost(id) {
  await remote.deleteTemplate(id);
  fixedTemplates = fixedTemplates.filter((template) => template.id !== id);
}

/**
 * 반영일이 지난 고정비를 지출로 만든다.
 *
 * 한 건이 실패해도 나머지는 살린다. 한 건 때문에 이번 달 고정비 전체가 안 들어오는 편이
 * 더 나쁘고, 실패한 건은 반영 기록이 남지 않아 다음에 다시 시도된다.
 * @returns {Promise<number>} 실제로 만들어진 건수
 */
export async function applyOccurrences(occurrences) {
  const created = [];
  const appliedKeys = [];

  for (const occurrence of occurrences) {
    try {
      const expense = await remote.applyOccurrence(occurrence, context);
      // null이면 상대 폰이 먼저 넣은 것이다. 기록만 남기고 넘어간다.
      if (expense) created.push(expense);
      appliedKeys.push(occurrence.key);
    } catch {
      // 이유는 remote가 콘솔에 남긴다. 여기서는 다음 건을 계속 시도한다.
    }
  }

  expenses = [...expenses, ...created];
  fixedApplied = [...fixedApplied, ...appliedKeys];
  return created.length;
}

/* ── 화면 상태 ────────────────────────────────────────────── */

export function getSelectedMonth() {
  return selectedMonth;
}

export function setSelectedMonth(monthKey) {
  selectedMonth = monthKey;
}

export function getMemberFilter() {
  return memberFilter;
}

export function setMemberFilter(member) {
  memberFilter = member;
}

/** 방금 추가·복원된 항목. 목록에서 한 번만 강조하고 비운다. */
export function getHighlightId() {
  return highlightId;
}

export function setHighlightId(id) {
  highlightId = id;
}

/** 되돌리기를 위해 잠시 들고 있는 삭제된 항목. */
export function getPendingDelete() {
  return pendingDelete;
}

export function setPendingDelete(expense) {
  pendingDelete = expense;
}
