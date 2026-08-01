import { nextMemberFilter } from "../expenses.js";
import { render } from "../render.js";
import {
  addExpense,
  getExpenses,
  getMemberFilter,
  getNoteCount,
  getPendingDelete,
  removeExpense,
  setHighlightId,
  setMemberFilter,
  setPendingDelete,
} from "../store.js";
import { closeOpenRow } from "../ui/swipe.js";
import { hideToast, showToast } from "../ui/toast.js";

export async function deleteExpense(id) {
  const target = getExpenses().find((expense) => expense.id === id);
  if (!target) return;

  // 대화는 지출과 함께 DB에서 사라진다. 지우기 전에 세어 둬야 몇 개를 잃었는지 말할 수 있다.
  const lostNotes = getNoteCount(id);

  try {
    await removeExpense(id);
  } catch (error) {
    showToast(error.message);
    return;
  }

  setPendingDelete(target, lostNotes);
  render();
  // 토스트가 사라지면 되돌리기 대상도 함께 버린다.
  showToast(lostNotes ? `지출과 대화 ${lostNotes}개를 지웠어요` : "지출을 삭제했어요", {
    canUndo: true,
    onExpire: () => setPendingDelete(null),
  });
}

/**
 * 삭제를 되돌린다.
 *
 * 서버에서 지운 행은 되살릴 수 없어 같은 내용으로 새로 넣는다.
 * 사용자가 보기엔 그대로 돌아오지만 두 가지는 돌아오지 않는다 —
 * 고정비에서 왔던 연결, 그리고 그 건에 달려 있던 대화다. 대화는 잃었다고 밝힌다.
 */
export async function undoDelete() {
  const pending = getPendingDelete();
  if (!pending) return;

  let restored;
  try {
    restored = await addExpense(pending.expense);
  } catch (error) {
    showToast(error.message);
    return;
  }

  setHighlightId(restored.id);
  setPendingDelete(null);
  render();

  if (pending.lostNotes) {
    showToast(`지출을 되돌렸어요. 대화 ${pending.lostNotes}개는 되살릴 수 없어요`);
    return;
  }
  hideToast();
}

/** 같은 사람을 다시 누르면 필터가 해제된다. */
export function toggleMemberFilter(member) {
  setMemberFilter(nextMemberFilter(getMemberFilter(), member));
  closeOpenRow();
  render();
}
