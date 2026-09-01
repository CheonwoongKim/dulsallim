import { elements } from "../dom.js";
import { formatDayLabel } from "../domain/expenses.js";
import { createExpenseRow } from "./expense-row.js";
import { getMemberName } from "../members.js";
import {
  getDateFilter,
  getHighlightId,
  getMemberFilter,
  getNoteCount,
  setHighlightId,
} from "../store.js";
import { closeOpenRow, resetSwipeState } from "./swipe.js";


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

  elements.list.append(
    ...visible.map((expense) =>
      createExpenseRow(expense, { notes: getNoteCount(expense.id), highlighted: expense.id === getHighlightId() }),
    ),
  );
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
  const fresh = createExpenseRow(expense, { notes: getNoteCount(expense.id) });
  row.replaceWith(fresh);
  if (hadFocus) fresh.querySelector(".expense-surface")?.focus();
  return true;
}
