import { nextMemberFilter } from "../expenses.js";
import { render } from "../render.js";
import {
  addExpense,
  getExpenses,
  getMemberFilter,
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

  try {
    await removeExpense(id);
  } catch (error) {
    showToast(error.message);
    return;
  }

  setPendingDelete(target);
  render();
  // 토스트가 사라지면 되돌리기 대상도 함께 버린다.
  showToast("지출을 삭제했어요", { canUndo: true, onExpire: () => setPendingDelete(null) });
}

/**
 * 삭제를 되돌린다.
 * 서버에서 지운 행은 되살릴 수 없어 같은 내용으로 새로 넣는다.
 * 사용자가 보기엔 그대로 돌아오지만, 고정비에서 왔던 기록이라면 그 연결은 끊어진다.
 */
export async function undoDelete() {
  const deleted = getPendingDelete();
  if (!deleted) return;

  let restored;
  try {
    restored = await addExpense(deleted);
  } catch (error) {
    showToast(error.message);
    return;
  }

  setHighlightId(restored.id);
  setPendingDelete(null);
  render();
  hideToast();
}

/** 같은 사람을 다시 누르면 필터가 해제된다. */
export function toggleMemberFilter(member) {
  setMemberFilter(nextMemberFilter(getMemberFilter(), member));
  closeOpenRow();
  render();
}
