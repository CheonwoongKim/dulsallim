import { elements } from "../dom.js";
import { CATEGORIES, formatMoney, formatShortDate } from "../expenses.js";
import { getMemberName } from "../members.js";
import { render } from "../render.js";
import { addNote, countNote, getExpenses, loadNotes } from "../store.js";
import { escapeHtml } from "../ui/escape.js";
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
  elements.noteList.innerHTML = `<p class="note-empty">불러오는 중…</p>`;
  showSheet(elements.notesSheet);

  try {
    const loaded = await loadNotes(expenseId);
    // 불러오는 사이 사용자가 시트를 닫거나 다른 지출을 열었을 수 있다.
    if (openExpenseId !== expenseId) return;
    messages = loaded;
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

export async function handleNoteSubmit(event) {
  event.preventDefault();
  const body = elements.noteInput.value.trim();
  if (!body || !openExpenseId) return;

  const expenseId = openExpenseId;
  elements.noteSend.disabled = true;
  try {
    const saved = await addNote(expenseId, body.slice(0, MAX_BODY));
    // 실시간 구독으로 같은 메시지가 되돌아오므로 id로 한 번 걸러 준다.
    receiveNote(saved, { counted: true });
    elements.noteInput.value = "";
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.noteSend.disabled = false;
    elements.noteInput.focus();
  }
}

/**
 * 상대가 남긴(또는 내가 방금 보낸) 메시지를 화면에 붙인다.
 * @param {object} note
 * @param {{counted?: boolean}} [options] 개수를 이미 셌으면 또 세지 않는다.
 */
export function receiveNote(note, { counted = false } = {}) {
  const known = messages.some((current) => current.id === note.id);
  if (!counted && !known) countNote(note.expenseId);

  if (note.expenseId === openExpenseId && !known) {
    messages = [...messages, note];
    paintMessages();
    scrollToLatest();
  }
  // 목록의 대화 개수도 함께 갱신한다.
  if (!known) render();
}
