import { toMonthKey } from "./domain/expenses.js";
import { setMembers } from "./members.js";
import * as remote from "./data/remote.js";
import { clearSnapshot, readSnapshot, writeSnapshot } from "./data/snapshot.js";

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
let wishes = [];
/** 지출 id별 대화 개수. 목록에 표시만 하므로 본문은 들고 있지 않는다. */
let noteCounts = {};
/**
 * 이미 센 메시지 id.
 * 내가 보낸 메시지는 응답으로도, 실시간 구독으로도 돌아온다. 어느 쪽이 먼저 와도
 * 한 번만 세도록 id를 기억한다.
 */
let countedNoteIds = new Set();

/** 어느 가구에, 누구 이름으로 쓸지. 로그인해야 정해진다. */
let context = null;

let selectedMonth = toMonthKey(new Date());
let memberFilter = null;
let dateFilter = null;
let categoryFilter = null;
/** "list" 또는 "calendar". 같은 달을 다르게 보는 것뿐이라 서버와는 무관하다. */
let viewMode = "list";
let highlightId = null;
let pendingDelete = null;

/* ── 불러오기 ─────────────────────────────────────────────── */

/**
 * 시작할 때 한 번. 명부를 받으면 그것을 쓰고, 안 받으면 읽는다.
 *
 * 로그인은 내 프로필을 읽으면서 명부까지 함께 받아 온다. 그것을 넘겨 주면 시작할 때
 * 같은 표를 두 번 왕복하지 않는다.
 */
export async function loadAll(profile, members) {
  const session = { householdId: profile.household_id, userId: profile.id };
  context = session;
  const data = await remote.fetchAll(profile.household_id, members);
  if (context !== session) return;
  얹기(data);
  writeSnapshot(profile.id, data);
}

/** 읽어 온 것을 사본에 얹는다. 서버에서 왔든 폰에 적어 둔 것에서 왔든 같은 자리에 앉는다. */
function 얹기(data) {
  setMembers(data.members);
  expenses = data.expenses;
  fixedTemplates = data.fixedCosts;
  fixedApplied = data.applied;
  wishes = data.wishes;
  noteCounts = data.noteCounts ?? {};
  countedNoteIds = new Set();
}

/**
 * 폰에 적어 둔 것으로 먼저 채운다. 서버에서 온 것이 곧 덮는다.
 *
 * 여기서는 context 를 세우지 않는다. 아직 서버에 아무것도 안 물어봤으므로, 이 상태에서
 * 무엇을 쓰려 하면 막혀야 한다 — 화면은 보되 손은 대지 않는 짧은 사이다.
 *
 * @returns {boolean} 적어 둔 것이 있어 채웠나
 */
export function hydrateFromSnapshot(profile) {
  const data = readSnapshot(profile?.id);
  if (!data) return false;
  얹기(data);
  return true;
}

/** 이름·색을 바꾼 뒤. 지출은 그대로 두고 명부만 다시 읽는다. */
export async function reloadMembers() {
  const session = context;
  if (!session) return;
  const members = await remote.fetchMembers(session.householdId);
  if (context !== session) return;
  setMembers(members);
}

/** 화면이 들고 있던 사본을 비운다. 초기화와 로그아웃이 같은 것을 지운다. */
function 비우기() {
  expenses = [];
  fixedTemplates = [];
  fixedApplied = [];
  wishes = [];
  noteCounts = {};
  countedNoteIds = new Set();
}

/** 가구의 모든 기록을 지운다. 되돌릴 수 없다. */
export async function resetHousehold() {
  await remote.resetHousehold();
  // 폰에 적어 둔 것도 함께 지운다. 안 그러면 다음에 열 때 지운 기록이 잠깐 되살아난다.
  clearSnapshot();
  // 지출이 사라지면 달려 있던 대화도 DB에서 함께 지워진다(on delete cascade).
  비우기();
}

/**
 * 상대가 바꾼 내용을 반영할 때.
 *
 * 고정비까지 다시 읽는다. 상대가 데이터를 초기화하면 고정비도 함께 지워지는데,
 * 지출만 읽으면 목록에는 지운 고정비가 그대로 남아 반영을 시도하다 실패한다.
 * 이름·색 같은 구성원 정보는 화면 곳곳에 박혀 있어 여기서 건드리지 않는다(마이페이지가 맡는다).
 */
export async function reloadHousehold() {
  const session = context;
  if (!session) return;
  const [nextExpenses, nextApplied, nextTemplates, nextWishes] = await Promise.all([
    remote.fetchExpenses(session.householdId),
    remote.fetchApplied(),
    remote.fetchFixedCosts(session.householdId),
    remote.fetchWishes(session.householdId),
  ]);
  /*
   * 다녀오는 사이에 로그아웃했거나 다른 사람이 로그인했을 수 있다.
   * 그대로 쓰면 지금 보고 있는 사람 화면에 앞사람 기록이 얹힌다.
   * context 는 loadAll 이 매번 새로 만드는 객체라, 같은 가구여도 다른 세션이면 걸러진다.
   */
  if (context !== session) return;
  expenses = nextExpenses;
  fixedApplied = nextApplied;
  fixedTemplates = nextTemplates;
  wishes = nextWishes;
}

/** 로그아웃. 다음 사람이 앞사람 기록을 보지 않도록 사본을 비운다. */
export function clearData() {
  clearSnapshot();
  비우기();
  context = null;
  setMembers([]);
  memberFilter = null;
  dateFilter = null;
  categoryFilter = null;
  // 보던 달과 보기 방식도 앞사람의 것이다. 남기면 다음 사람이 2000년 캘린더로 시작한다.
  selectedMonth = toMonthKey(new Date());
  viewMode = "list";
  highlightId = null;
  pendingDelete = null;
}

/* ── 지출 ─────────────────────────────────────────────────── */

export function getExpenses() {
  return expenses;
}

export function getContext() {
  return context;
}

export async function addExpense(input) {
  const created = await remote.insertExpense(input, context);
  expenses = [...expenses, created];
  // 목표 구간을 넘겼는지는 서버가 판단하고 서버가 적는다. 실패해도 지출은 이미 저장됐다.
  remote.fireNags(created.id);
  return created;
}

export async function editExpense(id, input) {
  const updated = await remote.updateExpense(id, input, context);
  expenses = expenses.map((expense) => (expense.id === id ? updated : expense));
  // 금액을 올려 구간을 넘기는 것도 넘긴 것이다. 새 지출만 보면 이 경우를 놓친다.
  remote.fireNags(id);
  return updated;
}

export async function removeExpense(id) {
  await remote.deleteExpenseRow(id);
  expenses = expenses.filter((expense) => expense.id !== id);
  // 지출과 함께 대화도 DB에서 사라진다. 개수만 남으면 없는 대화를 있다고 표시하게 된다.
  const { [id]: removed, ...rest } = noteCounts;
  noteCounts = rest;
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

/* ── 위시리스트 ───────────────────────────────────────────── */

/** 화면은 서버를 기다리지 않고 이 메모리 사본을 즉시 읽는다. */
export function getWishes() {
  return wishes;
}

export async function addWish(input) {
  const created = await remote.insertWish(input);
  wishes = [created, ...wishes];
  return created;
}

export async function agreeWish(id) {
  const updated = await remote.agreeWish(id);
  wishes = wishes.map((wish) => (wish.id === id ? updated : wish));
  return updated;
}

/**
 * 지금 목표를 정하거나 푼다. 서버가 바뀐 줄만 돌려주므로 그것만 갈아 끼운다.
 *
 * 새로 고르면 앞의 것이 함께 풀려 둘이 온다 — 둘 다 갈아 끼워야 화면에 목표가 두 개로
 * 보이지 않는다.
 */
export async function setWishGoal(id, on) {
  const 바뀐 = await remote.setWishGoal(id, on);
  const 바뀐것 = new Map(바뀐.map((wish) => [wish.id, wish]));
  wishes = wishes.map((wish) => 바뀐것.get(wish.id) ?? wish);
  return 바뀐;
}

export async function achieveWish(id, expenseId) {
  const updated = await remote.achieveWish(id, expenseId);
  wishes = wishes.map((wish) => (wish.id === id ? updated : wish));
  return updated;
}

/**
 * 링크에서 대표 그림을 찾아 위시에 붙인다. 담기가 끝난 뒤에 따로 부른다.
 *
 * 못 찾는 일이 흔하다 — og 태그가 없거나, 봇을 막거나, 시간이 넘는다. 그건 잘못이 아니라
 * 그냥 그림이 없는 링크다. 그래서 던지지 않고 null 로 알린다.
 *
 * @returns {Promise<string|null>} 붙인 그림 주소. 못 붙였으면 null
 */
export async function attachWishImage(id, href) {
  const image = await remote.fetchLinkImage(href);
  if (!image) return null;

  try {
    await remote.setWishImage(id, image);
  } catch {
    // 서버에 못 적었으면 화면에도 얹지 않는다. 다음에 열면 없는 것이 맞다.
    return null;
  }
  wishes = wishes.map((wish) => (wish.id === id ? { ...wish, imageUrl: image } : wish));
  return image;
}

export async function editWish(id, input) {
  const updated = await remote.updateWish(id, input);
  wishes = wishes.map((wish) => (wish.id === id ? updated : wish));
  return updated;
}

export async function removeWish(id) {
  await remote.deleteWish(id);
  wishes = wishes.filter((wish) => wish.id !== id);
}

/** 한 건 넣기. 실패는 여기서 삼키고 null 로 알린다 — 나머지는 계속 시도해야 한다. */
async function applyOne(occurrence) {
  try {
    return { key: occurrence.key, expense: await remote.applyOccurrence(occurrence) };
  } catch {
    // 이유는 remote가 콘솔에 남긴다. 여기서는 실패했다는 사실만 올려 보낸다.
    return null;
  }
}

/**
 * 한 번에 이만큼만 함께 보낸다.
 *
 * 한 건씩 줄 세워 기다리면 오래 안 열었을 때가 문제다. 고정비 10개가 열두 달 밀리면
 * 백스무 번을 차례로 기다려, 첫 화면이 뜨기까지 몇 초가 걸린다.
 * 그렇다고 전부 한꺼번에 던지면 서버를 두드리는 꼴이라 중간을 잡는다.
 */
const APPLY_BATCH = 6;

/**
 * 반영일이 지난 고정비를 지출로 만든다.
 *
 * 한 건이 실패해도 나머지는 살린다. 한 건 때문에 이번 달 고정비 전체가 안 들어오는 편이
 * 더 나쁘고, 실패한 건은 반영 기록이 남지 않아 다음에 다시 시도된다.
 * @returns {Promise<{created: number, failed: number}>} 만들어진 건수와 실패한 건수
 */
export async function applyOccurrences(occurrences) {
  const session = context;
  const created = [];
  const appliedKeys = [];
  let failed = 0;

  for (let from = 0; from < occurrences.length; from += APPLY_BATCH) {
    const batch = await Promise.all(occurrences.slice(from, from + APPLY_BATCH).map(applyOne));
    for (const result of batch) {
      if (!result) {
        failed += 1;
        continue;
      }
      // expense 가 null 이면 상대 폰이 먼저 넣은 것이다. 기록만 남기고 넘어간다.
      if (result.expense) {
        created.push(result.expense);
        // 월세처럼 큰 고정비 하나로 구간을 넘기는 일이 잦다. 직접 적은 지출만 볼 이유가 없다.
        remote.fireNags(result.expense.id);
      }
      appliedKeys.push(result.key);
    }
  }

  /*
   * 다녀오는 사이에 로그아웃했거나 다른 사람이 로그인했을 수 있다.
   * reloadHousehold 와 같은 관문이다 — 쓰는 길에서 이것만 빠져 있었다.
   * 없으면 비운 사본에 앞사람 지출이 도로 붙어, 로그인 화면 뒤로 남의 기록이 남는다.
   */
  if (context !== session) return { created: created.length, failed };

  /*
   * 붙이지 않고 id 로 겹쳐 넣는다.
   *
   * 넣는 사이에 구독이 울린다 — 내가 만든 행이 서버에 생겼으니 당연하다. 400ms 뒤
   * reloadHousehold 가 사본을 통째로 갈아 끼우는데 그 목록에는 방금 만든 것이 이미 들어
   * 있다. 거기에 또 붙이면 같은 지출이 두 번 보인다. 열두 달을 소급하면 왕복이 400ms 를
   * 쉽게 넘어 실제로 겹친다. 순서는 그리는 쪽이 날짜로 다시 세우므로 겹쳐 넣어도 된다.
   */
  const byId = new Map(expenses.map((expense) => [expense.id, expense]));
  for (const expense of created) byId.set(expense.id, expense);
  expenses = [...byId.values()];
  // 반영 기록도 같은 까닭으로 겹칠 수 있다. 어차피 Set 으로 쓰는 값이라 여기서 접는다.
  fixedApplied = [...new Set([...fixedApplied, ...appliedKeys])];
  return { created: created.length, failed };
}

/* ── 대화 ─────────────────────────────────────────────────── */

export function getNoteCount(expenseId) {
  return noteCounts[expenseId] || 0;
}

export async function loadNotes(expenseId) {
  return remote.fetchNotes(expenseId);
}

/**
 * 메시지를 보낸다. 세는 일은 하지 않는다.
 *
 * 보낸 메시지는 응답과 실시간 구독 두 경로로 돌아온다. 여기서도 세면
 * 먼저 도착한 쪽이 "이미 아는 메시지"가 되어, 화면에 붙는 단계가 통째로 건너뛰어진다.
 * 세는 곳과 그리는 곳을 한 군데(receiveNote)로 모아 둔다.
 */
export async function addNote(expenseId, body) {
  return remote.insertNote(expenseId, body, context);
}

/**
 * 메시지 하나를 개수에 반영한다. 같은 메시지를 여러 번 넣어도 한 번만 센다.
 * @returns {boolean} 이번에 처음 센 메시지인지
 */
export function countNote(note) {
  if (countedNoteIds.has(note.id)) return false;
  countedNoteIds.add(note.id);
  noteCounts = { ...noteCounts, [note.expenseId]: (noteCounts[note.expenseId] || 0) + 1 };
  return true;
}

/* ── 화면 상태 ────────────────────────────────────────────── */

export function getSelectedMonth() {
  return selectedMonth;
}

export function setSelectedMonth(monthKey) {
  selectedMonth = monthKey;
  // 8월 3일을 고른 채 9월로 넘어가면 아무것도 안 보인다. 달이 바뀌면 날짜 필터를 푼다.
  dateFilter = null;
}

export function getCategoryFilter() {
  return categoryFilter;
}

export function setCategoryFilter(category) {
  categoryFilter = category;
}

export function getMemberFilter() {
  return memberFilter;
}

export function setMemberFilter(member) {
  memberFilter = member;
}

export function getDateFilter() {
  return dateFilter;
}

export function setDateFilter(date) {
  dateFilter = date;
}

export function getViewMode() {
  return viewMode;
}

export function setViewMode(mode) {
  viewMode = mode;
}

/** 방금 추가·복원된 항목. 목록에서 한 번만 강조하고 비운다. */
export function getHighlightId() {
  return highlightId;
}

export function setHighlightId(id) {
  highlightId = id;
}

/**
 * 되돌리기를 위해 잠시 들고 있는 삭제된 항목.
 * 대화는 지출과 함께 DB에서 사라져 되살릴 수 없으므로, 몇 개를 잃었는지 함께 기억해 알린다.
 * @returns {{expense: object, lostNotes: number}|null}
 */
export function getPendingDelete() {
  return pendingDelete;
}

export function setPendingDelete(expense, lostNotes = 0) {
  pendingDelete = expense ? { expense, lostNotes } : null;
}
