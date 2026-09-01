import { escapeHtml } from "./escape.js";
import { CATEGORIES, formatMoney, formatShortDate } from "../domain/expenses.js";
import { getMemberName } from "../members.js";

/**
 * 목록의 한 줄. 그리는 일만 한다.
 *
 * ledger.js 에서 떼어 냈다. 거기 두면 store 와 dom.js 를 함께 끌고 와서 브라우저 없이는
 * 한 번도 돌려 볼 수가 없었다 — 서버가 준 글자가 마크업이 되는 자리인데 그랬다.
 * 창고에서 꺼내는 값(대화 개수·방금 넣은 것 표시)은 부르는 쪽이 넘겨 준다.
 *
 * @param {object} expense
 * @param {{notes?: number, highlighted?: boolean}} [곁들임]
 */
export function createExpenseRow(expense, { notes = 0, highlighted = false } = {}) {
  const article = document.createElement("article");
  const category = CATEGORIES[expense.category] || CATEGORIES.etc;
  article.className = `expense-item swipe-row${highlighted ? " is-new" : ""}`;
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
      <button class="swipe-action is-copy" type="button" data-copy-id="${escapeHtml(expense.id)}" aria-label="${escapeHtml(expense.item)} 복제">복제</button>
      <button class="swipe-action is-edit" type="button" data-edit-id="${escapeHtml(expense.id)}" aria-label="${escapeHtml(expense.item)} 수정">수정</button>
      <button class="swipe-action is-delete" type="button" data-delete-id="${escapeHtml(expense.id)}" aria-label="${escapeHtml(expense.item)} 삭제">삭제</button>
    </span>
    <button class="expense-surface swipe-surface" type="button" aria-label="${escapeHtml(label)}">
      <span class="expense-date">${escapeHtml(formatShortDate(expense.date))}</span>
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
