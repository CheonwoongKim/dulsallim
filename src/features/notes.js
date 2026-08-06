import { elements } from "../dom.js";
import { CATEGORIES, formatMoney, formatShortDate } from "../expenses.js";
import { getMemberName } from "../members.js";
import { addNote, countNote, getExpenses, loadNotes } from "../store.js";
import { escapeHtml } from "../ui/escape.js";
import { repaintExpenseRow } from "../ui/ledger.js";
import { hideSheet, showSheet } from "../ui/sheet.js";
import { showToast } from "../ui/toast.js";
import { getProfile } from "./auth.js";

const MAX_BODY = 500;

let openExpenseId = null;
/** 지금 시트에 그려진 메시지들. 실시간으로 같은 것이 또 와도 겹치지 않게 id를 대조한다. */
let messages = [];

function formatWhen(isoText) {
  const at = new Date(isoText);
  if (Number.isNaN(at.getTime())) return "";
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const today = new Date();
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate();
  // 오늘 것은 시각만 보여 준다. 대부분의 대화가 오늘 일어나므로 날짜가 반복되면 시끄럽다.
  return sameDay ? time : `${at.getMonth() + 1}.${at.getDate()} ${time}`;
}

function createBubble(note) {
  const mine = note.author === getProfile()?.id;
  const row = document.createElement("div");
  row.className = `note-row${mine ? " is-mine" : ""}`;
  row.dataset.id = note.id;
  row.innerHTML = `
    ${mine ? "" : `<span class="note-author">${escapeHtml(getMemberName(note.author))}</span>`}
    <p class="note-bubble">${escapeHtml(note.body)}</p>
    <time class="note-when">${formatWhen(note.createdAt)}</time>
  `;
  return row;
}

function paintMessages() {
  if (!messages.length) {
    elements.noteList.innerHTML = `
      <p class="note-empty">아직 나눈 이야기가 없어요.<br />이 지출에 대해 먼저 말을 걸어 보세요.</p>
    `;
    return;
  }
  elements.noteList.replaceChildren(...messages.map(createBubble));
}

/** 새 메시지는 아래에 쌓이므로 항상 바닥을 보여 준다. */
function scrollToLatest() {
  elements.noteList.scrollTop = elements.noteList.scrollHeight;
}

function paintHeader(expense) {
  const category = CATEGORIES[expense.category] || CATEGORIES.etc;
  elements.notesEyebrow.textContent =
    `${formatShortDate(expense.date)} · ${getMemberName(expense.member)} · ${category.label}`;
  elements.notesTitle.textContent = `${expense.item} ${formatMoney(expense.amount)}원`;
}

export async function openNotes(expenseId) {
  const expense = getExpenses().find((current) => current.id === expenseId);
  if (!expense) return;

  openExpenseId = expenseId;
  messages = [];
  paintHeader(expense);
  elements.noteInput.value = "";
  syncNoteSend();
  elements.noteList.innerHTML = `<p class="note-empty">불러오는 중…</p>`;
  showSheet(elements.notesSheet);

  try {
    const loaded = await loadNotes(expenseId);
    // 불러오는 사이 사용자가 시트를 닫거나 다른 지출을 열었을 수 있다.
    if (openExpenseId !== expenseId) return;
    /*
     * 불러오는 사이 상대의 말이 실시간으로 도착해 이미 붙어 있을 수 있다.
     * 통째로 갈아 끼우면 화면에 떴던 말이 사라진다 — 조회 스냅샷은 그보다 앞선 순간이라
     * 그 말을 담고 있지 않다. 나중에 온 것이므로 뒤에 잇는다.
     */
    const loadedIds = new Set(loaded.map((note) => note.id));
    messages = [...loaded, ...messages.filter((note) => !loadedIds.has(note.id))];
    paintMessages();
    scrollToLatest();
  } catch (error) {
    if (openExpenseId !== expenseId) return;
    elements.noteList.innerHTML = `<p class="note-empty">${escapeHtml(error.message)}</p>`;
  }
}

export function closeNotes() {
  hideSheet(elements.notesSheet, () => {
    openExpenseId = null;
    messages = [];
  });
}

/**
 * 적을 것이 있을 때만 보내기가 나타난다.
 *
 * 늘 떠 있으면 빈 칸 옆에서 누를 수 없는 단추가 자리를 지킨다. 자리를 비켜 주는 대신
 * 사라지게만 두면 칸 너비가 오락가락하므로, 칸 안에 겹쳐 두고 보이고 안 보이고만 바꾼다.
 */
export function syncNoteSend() {
  const 적었나 = Boolean(elements.noteInput.value.trim());
  elements.noteSend.classList.toggle("is-ready", 적었나);
  // 안 보이는 단추가 탭 순서에 남아 있으면 커서가 빈 곳에 멈춘다.
  elements.noteSend.disabled = !적었나;
}

export async function handleNoteSubmit(event) {
  event.preventDefault();
  const body = elements.noteInput.value.trim();
  if (!body || !openExpenseId) return;

  const expenseId = openExpenseId;
  elements.noteSend.disabled = true;
  try {
    // 실시간 구독으로 같은 메시지가 되돌아오지만 개수는 id 기준으로 한 번만 센다.
    receiveNote(await addNote(expenseId, body.slice(0, MAX_BODY)));
    elements.noteInput.value = "";
  } catch (error) {
    showToast(error.message);
  } finally {
      elements.noteInput.focus();
      // 보낸 뒤에는 칸이 비었으니 단추도 함께 물러난다.
      syncNoteSend();
  }
}

/**
 * 아직 내 목록에 없는 지출의 메시지를 잠시 맡아 둔다.
 *
 * 두 통로의 속도가 다른 게 원인이다. 지출은 400ms 씩 모아서 다시 읽는데 메시지는 즉시 온다.
 * 그래서 상대가 기록하는 순간 서버가 붙이는 잔소리는 거의 매번 지출보다 먼저 도착한다.
 * 그때 그냥 버리면 개수를 세는 곳(countNote)까지 건너뛰어, 앱을 완전히 새로 켜기 전에는
 * 목록의 말풍선 숫자가 계속 하나 모자라게 보인다.
 *
 * 지워진 지출의 메시지처럼 끝내 짝을 못 찾는 것도 있어 한도를 둔다.
 */
const pending = new Map();
const MAX_PENDING = 50;

/** 지출을 다시 읽은 뒤 부른다. 그 사이 맡아 둔 메시지를 이제야 붙인다. */
export function flushPendingNotes() {
  if (!pending.size) return;
  const waiting = [...pending.values()];
  pending.clear();
  // 여전히 모르는 지출이면 receiveNote 가 도로 맡아 둔다.
  waiting.forEach(receiveNote);
}

/**
 * 상대가 남긴(또는 내가 방금 보낸) 메시지를 화면에 붙인다.
 * 구독에는 가구 필터를 걸 수 없어 RLS에 기대는데, 개수까지 흐트러지지 않도록 한 겹 더 확인한다.
 */
export function receiveNote(note) {
  const expense = getExpenses().find((current) => current.id === note.expenseId);
  if (!expense) {
    // 버리면 안 된다. 아래 pending 설명 참고.
    if (pending.size < MAX_PENDING) pending.set(note.id, note);
    return;
  }

  // 응답과 구독 중 어느 쪽이 먼저 와도 여기서 한 번만 센다.
  const isNew = countNote(note);
  if (!isNew) return;

  if (note.expenseId === openExpenseId && !messages.some((current) => current.id === note.id)) {
    messages = [...messages, note];
    paintMessages();
    scrollToLatest();
  }

  /*
   * 달라진 건 그 행의 대화 개수뿐이다. 총액도 요약도 그대로다.
   * 목록에 없으면 보일 자리가 없으니 그럴 필요도 없고,
   * 있더라도 통째로 다시 그리면 열어 둔 스와이프와 포커스가 사라진다.
   */
  repaintExpenseRow(expense);
}
