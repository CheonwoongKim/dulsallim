import { elements } from "../dom.js";
import { escapeHtml } from "./escape.js";
import { CATEGORIES, formatDayLabel, formatMoney, formatShortDate } from "../expenses.js";
import { getMemberName } from "../members.js";
import {
  getDateFilter,
  getHighlightId,
  getMemberFilter,
  getNoteCount,
  setHighlightId,
} from "../store.js";
import { resetSwipeState } from "./swipe.js";

function createExpenseRow(expense) {
  const article = document.createElement("article");
  const category = CATEGORIES[expense.category] || CATEGORIES.etc;
  // 상대가 남긴 말이 있다는 걸 목록에서 알 수 있어야 열어 볼 생각을 한다.
  const notes = getNoteCount(expense.id);
  article.className = `expense-item swipe-row${expense.id === getHighlightId() ? " is-new" : ""}`;
  article.dataset.id = expense.id;
  // 액션 패널을 먼저 두고 내용면이 그 위를 덮는다. 스와이프하면 내용면이 밀려 액션이 드러난다.
  article.innerHTML = `
    <span class="swipe-actions">
      <button class="swipe-action is-copy" type="button" data-copy-id="${expense.id}" aria-label="${escapeHtml(expense.item)} 복제">복제</button>
      <button class="swipe-action is-edit" type="button" data-edit-id="${expense.id}" aria-label="${escapeHtml(expense.item)} 수정">수정</button>
      <button class="swipe-action is-delete" type="button" data-delete-id="${expense.id}" aria-label="${escapeHtml(expense.item)} 삭제">삭제</button>
    </span>
    <div class="expense-surface swipe-surface">
      <span class="expense-date">${formatShortDate(expense.date)}</span>
      <div class="expense-copy">
        <strong>${escapeHtml(expense.item)}</strong>
        <span class="expense-meta">
          ${escapeHtml(getMemberName(expense.member))}<i></i>${category.label}${notes ? `<i></i><span class="note-count">대화 ${notes}</span>` : ""}
        </span>
      </div>
      <strong class="expense-amount">${formatMoney(expense.amount)}원</strong>
    </div>
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
