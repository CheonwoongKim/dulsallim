import {
  nextDateFilter,
  nextMemberFilter } from "../expenses.js";
import { openForm } from "./expense-form.js";
import { render } from "../render.js";
import {
  addExpense,
  getDateFilter,
  getExpenses,
  getMemberFilter,
  getNoteCount,
  getPendingDelete,
  removeExpense,
  setCategoryFilter,
  setDateFilter,
  setHighlightId,
  setMemberFilter,
  setPendingDelete,
  setViewMode,
} from "../store.js";
import { closeOpenRow } from "../ui/swipe.js";
import { withViewTransition } from "../ui/view-transition.js";
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

/**
 * 같은 지출을 오늘 또 했을 때. 분류·항목·금액만 가져와 새 기록으로 연다.
 *
 * 날짜와 결제자는 일부러 가져오지 않는다 — 오늘, 내가 쓴 것을 적는 것이지
 * 지난 기록을 그대로 옮기는 게 아니다. 폼이 오늘·로그인한 사람으로 채운다.
 */
export function copyExpense(id) {
  const source = getExpenses().find((expense) => expense.id === id);
  closeOpenRow();
  if (!source) return;

  openForm(
    { category: source.category, item: source.item, amount: source.amount },
    { editing: false },
  );
}

/** 같은 사람을 다시 누르면 필터가 해제된다. */
export function toggleMemberFilter(member) {
  setMemberFilter(nextMemberFilter(getMemberFilter(), member));
  closeOpenRow();
  render();
}

/** 캘린더에서 같은 날을 다시 누르면 해제된다. */
export function toggleDateFilter(date) {
  setDateFilter(nextDateFilter(getDateFilter(), date));
  render();
}

/**
 * 목록과 캘린더를 오간다.
 * 목록으로 돌아갈 때 날짜 필터는 푼다 — 캘린더에서 고른 날인데 캘린더가 사라지면
 * 무엇 때문에 걸린 필터인지 알 수 없다.
 */

/**
 * 지출 내역 제목에 붙은 조건을 눌러 한꺼번에 푼다.
 *
 * 사람은 요약 카드를, 날짜는 달력을 다시 누르면 풀린다 — 화면에 보이는 자리가 있다.
 * 분류만 그런 자리가 없어서, 풀려면 분석 화면으로 되돌아가야 했다.
 * 제목에 이미 걸린 조건이 적혀 있으니 거기가 푸는 자리이기도 하게 둔다.
 */
export function clearFilters() {
  setMemberFilter(null);
  setCategoryFilter(null);
  setDateFilter(null);
  closeOpenRow();
  render();
}

export function toggleView(mode) {
  closeOpenRow();
  withViewTransition(() => {
    setViewMode(mode);
    if (mode === "list") setDateFilter(null);
    render();
  });
}
