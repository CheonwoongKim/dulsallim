import { elements } from "../dom.js";
import { CATEGORIES, formatMoney, getMonthlyExpenses, nextCategoryFilter } from "../expenses.js";
import { render } from "../render.js";
import { getCategoryFilter, getExpenses, getSelectedMonth, setCategoryFilter } from "../store.js";
import { escapeHtml } from "../ui/escape.js";
import { hideSheet, showSheet } from "../ui/sheet.js";
import { closeOpenRow } from "../ui/swipe.js";

/**
 * 분류로 거르기.
 *
 * 거르는 일은 거르는 자리에서 한다. 사람은 요약 카드, 날짜는 캘린더가 이미 홈에 있는데
 * 분류만 분석 화면에 있었다 — 거기서 누르면 보던 화면에서 튕겨 나와 홈으로 끌려갔다.
 * 무엇이 바뀌었는지 되짚어야 했고, 누를 수 있다는 표시도 없었다.
 *
 * 이 시트는 지출 내역 제목 줄에서 연다. 고르면 시트만 닫히고 화면은 그대로다.
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

export function openCategorySheet() {
  그리기();
  showSheet(elements.categorySheet);
}

export function closeCategorySheet() {
  hideSheet(elements.categorySheet);
}

/** 고르면 시트만 닫는다. 보던 화면은 그대로 둔다 — 어디로 갔는지 헷갈릴 일이 없다. */
export function pickCategory(key) {
  setCategoryFilter(key ? nextCategoryFilter(getCategoryFilter(), key) : null);
  closeOpenRow();
  render();
  closeCategorySheet();
}
