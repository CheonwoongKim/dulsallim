import { elements } from "../dom.js";
import { escapeHtml } from "./escape.js";
import { CATEGORIES, formatDayLabel, formatMoney, formatShortDate } from "../domain/expenses.js";
import { getMemberName } from "../members.js";
import {
  getDateFilter,
  getHighlightId,
  getMemberFilter,
  getNoteCount,
  setHighlightId,
} from "../store.js";
import { closeOpenRow, resetSwipeState } from "./swipe.js";

function createExpenseRow(expense) {
  const article = document.createElement("article");
  const category = CATEGORIES[expense.category] || CATEGORIES.etc;
  // 상대가 남긴 말이 있다는 걸 목록에서 알 수 있어야 열어 볼 생각을 한다.
  const notes = getNoteCount(expense.id);
  article.className = `expense-item swipe-row${expense.id === getHighlightId() ? " is-new" : ""}`;
  article.dataset.id = expense.id;
  // 액션 패널을 먼저 두고 내용면이 그 위를 덮는다. 스와이프하면 내용면이 밀려 액션이 드러난다.
  // 내용면은 버튼이다. 눌러서 대화를 여는 자리인데 div 로 두면 키보드로는 닿을 수 없다.
  const label = [
    formatShortDate(expense.date),
    getMemberName(expense.member),
    category.label,
    expense.item,
    `${formatMoney(expense.amount)}원`,
    notes ? `대화 ${notes}개` : null,
    "대화 열기",
  ].join(" ");
  article.innerHTML = `
    <span class="swipe-actions">
      <button class="swipe-action is-copy" type="button" data-copy-id="${expense.id}" aria-label="${escapeHtml(expense.item)} 복제">복제</button>
      <button class="swipe-action is-edit" type="button" data-edit-id="${expense.id}" aria-label="${escapeHtml(expense.item)} 수정">수정</button>
      <button class="swipe-action is-delete" type="button" data-delete-id="${expense.id}" aria-label="${escapeHtml(expense.item)} 삭제">삭제</button>
    </span>
    <button class="expense-surface swipe-surface" type="button" aria-label="${escapeHtml(label)}">
      <span class="expense-date">${formatShortDate(expense.date)}</span>
      <span class="expense-copy">
        <strong>${escapeHtml(expense.item)}</strong>
        <span class="expense-meta">
          ${escapeHtml(getMemberName(expense.member))}<i></i>${category.label}${notes ? `<i></i><span class="note-count">대화 ${notes}</span>` : ""}
        </span>
      </span>
      <strong class="expense-amount">${formatMoney(expense.amount)}원</strong>
    </button>
  `;
  return article;
}

/** 무엇 때문에 비었는지에 따라 문구가 달라야 한다. 그래야 어디를 눌러 풀지 알 수 있다. */
function fillEmptyState() {
  const empty = elements.emptyTemplate.content.cloneNode(true);
  const member = getMemberFilter();
  const date = getDateFilter();
  if (!member && !date) return empty;

  const who = member ? `${getMemberName(member)} ` : "";
  const when = date ? formatDayLabel(date) : "이 달";
  empty.querySelector("h3").textContent = `${who}지출이 없어요`;
  empty.querySelector("p").innerHTML = date
    ? `${when}에는 기록이 없습니다.<br />날짜를 다시 눌러 전체를 볼 수 있어요.`
    : "이 달에는 기록이 없습니다.<br />위 카드를 다시 눌러 전체를 볼 수 있어요.";
  return empty;
}

export function renderList(visible) {
  resetSwipeState();
  elements.list.replaceChildren();

  if (!visible.length) {
    elements.list.append(fillEmptyState());
    return;
  }

  elements.list.append(...visible.map(createExpenseRow));
  setHighlightId(null);
}

/**
 * 한 행만 다시 그린다. 대화 개수처럼 그 행에서만 달라진 것을 반영할 때 쓴다.
 *
 * 목록을 통째로 갈면 열어 둔 스와이프가 닫히고, 눌러 두었던 자리(포커스)도 사라진다.
 * 상대가 말을 남길 때마다 그러면 쓰던 것을 방해받는다.
 * @returns {boolean} 그 행이 화면에 있어 다시 그렸으면 true
 */
export function repaintExpenseRow(expense) {
  const row = elements.list.querySelector(`.expense-item[data-id="${expense.id}"]`);
  if (!row) return false;
  // 열린 행을 갈아 끼우면 스와이프 상태가 사라진 노드를 가리킨 채 남는다. 먼저 닫는다.
  if (row.classList.contains("is-open")) closeOpenRow();
  const hadFocus = row.contains(document.activeElement);
  const fresh = createExpenseRow(expense);
  row.replaceWith(fresh);
  if (hadFocus) fresh.querySelector(".expense-surface")?.focus();
  return true;
}
