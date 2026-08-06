import { elements } from "../dom.js";
import {
  CATEGORIES,
  formatDayLabel,
  formatMoney,
  getMonthlyExpenses,
  nextCategoryFilter,
  nextMemberFilter,
} from "../expenses.js";
import { render } from "../render.js";
import {
  getCategoryFilter,
  getDateFilter,
  getExpenses,
  getMemberFilter,
  getSelectedMonth,
  setCategoryFilter,
  setDateFilter,
  setMemberFilter,
} from "../store.js";
import { paintMemberTabs } from "../ui/member-tabs.js";
import { escapeHtml } from "../ui/escape.js";
import { hideSheet, showSheet } from "../ui/sheet.js";
import { closeOpenRow } from "../ui/swipe.js";

/**
 * 지출 내역 거르기 — 사람 · 분류 · 날짜.
 *
 * 예전에는 거르는 길이 셋으로 흩어져 있었다. 사람은 요약 카드, 날짜는 캘린더 칸,
 * 분류는 제목 줄의 아이콘. 아이콘 하나가 옆의 보기 토글과 크기도(42 vs 34) 성격도
 * 달라 한 무리처럼 보이지 않았다.
 *
 * 그 아이콘을 걷고 제목 자체를 단추로 만들었다. 제목은 원래부터 걸린 조건을 적는
 * 자리다("지출 내역(5) · 이름"). 거기가 곧 여는 자리이기도 하면 읽는 곳과 바꾸는 곳이
 * 같아진다.
 *
 * 요약 카드와 캘린더 칸은 지름길로 그대로 둔다 — 한 번에 되는 것을 두 번으로 만들 이유가 없다.
 */

/** 그 달에 실제로 쓴 분류만, 많이 쓴 순으로. 안 쓴 분류를 늘어놓으면 고를 것이 묻힌다. */
function 이번달분류() {
  const 합계 = new Map();
  for (const expense of getMonthlyExpenses(getExpenses(), getSelectedMonth())) {
    합계.set(expense.category, (합계.get(expense.category) ?? 0) + expense.amount);
  }
  return [...합계.entries()]
    .map(([key, total]) => ({
      key,
      label: (CATEGORIES[key] || CATEGORIES.etc).label,
      color: (CATEGORIES[key] || CATEGORIES.etc).color,
      total,
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function 그리기() {
  const 걸린것 = getCategoryFilter();
  const 분류들 = 이번달분류();

  if (!분류들.length) {
    elements.categoryList.innerHTML = `<p class="category-empty">이 달에는 기록이 없어요.</p>`;
    return;
  }

  // 맨 위에 "전체"를 둔다. 고른 것을 푸는 길이 이 시트 안에도 있어야 한다.
  const 전체 = `
    <button class="category-row" type="button" data-category="" aria-pressed="${!걸린것}">
      <span class="category-name">전체</span>
      <span class="category-amount">${formatMoney(분류들.reduce((합, c) => 합 + c.total, 0))}원</span>
    </button>`;

  elements.categoryList.innerHTML =
    전체 +
    분류들
      .map(
        (분류) => `
      <button class="category-row" type="button" data-category="${escapeHtml(분류.key)}"
        aria-pressed="${분류.key === 걸린것}">
        <span class="category-dot" style="background:${분류.color}" aria-hidden="true"></span>
        <span class="category-name">${escapeHtml(분류.label)}</span>
        <span class="category-amount">${formatMoney(분류.total)}원</span>
      </button>`,
      )
      .join("");
}

export function openFilterSheet() {
  그리기();
  사람그리기();
  날짜그리기();
  showSheet(elements.filterSheet);
}

export function closeFilterSheet() {
  hideSheet(elements.filterSheet);
}

function 사람그리기() {
  paintMemberTabs(elements.filterMembers, getMemberFilter());
}

/**
 * 날짜는 캘린더에서만 고른다. 여기서는 걸린 것을 보여 주고 푸는 자리다.
 *
 * 시트 안에서 날을 고르게 하면 달력을 하나 더 그려야 하는데, 그 달력은 이미 이 화면에 있다.
 */
function 날짜그리기() {
  const 걸린날 = getDateFilter();
  elements.filterDateRow.hidden = !걸린날;
  if (걸린날) elements.filterDateLabel.textContent = formatDayLabel(걸린날);
}

/** 사람은 요약 카드와 같은 규칙을 쓴다 — 같은 사람을 다시 누르면 풀린다. */
export function pickFilterMember(member) {
  setMemberFilter(nextMemberFilter(getMemberFilter(), member || null));
  closeOpenRow();
  render();
  사람그리기();
}

export function clearDateFilter() {
  setDateFilter(null);
  render();
  날짜그리기();
}

/** 셋을 한꺼번에 푼다. 시트는 닫는다 — 풀고 나면 더 볼 것이 없다. */
export function clearAllFilters() {
  setMemberFilter(null);
  setCategoryFilter(null);
  setDateFilter(null);
  closeOpenRow();
  render();
  closeFilterSheet();
}

/** 고르면 시트만 닫는다. 보던 화면은 그대로 둔다 — 어디로 갔는지 헷갈릴 일이 없다. */
export function pickCategory(key) {
  setCategoryFilter(key ? nextCategoryFilter(getCategoryFilter(), key) : null);
  closeOpenRow();
  render();
  closeFilterSheet();
}
