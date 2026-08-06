import { elements } from "../dom.js";
import { paintMemberTabs } from "../ui/member-tabs.js";
import { compareCategories, compareMonth, sumByCategory, untilDay } from "../analysis.js";
import {
  filterByMember,
  formatMonth,
  formatMoney,
  getMonthlyExpenses,
  isValidMonthKey,
  shiftMonthKey,
} from "../expenses.js";
import { getMembers } from "../members.js";
import { getExpenses, getMemberFilter, getSelectedMonth, setSelectedMonth } from "../store.js";
import { escapeHtml } from "../ui/escape.js";
import { showPage } from "../ui/page.js";

/**
 * 무엇과 견줄지. null이면 이 달 구성만 본다.
 * 모드에 따라 질문이 바뀐다 — 끄면 "구성이 어떤가", 켜면 "얼마나 달라졌나".
 */
let compareWith = null;

/** 증감을 부호와 함께. 0원 차이는 부호 없이 그대로 둔다. */
function formatDiff({ diff, percent }) {
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const amount = `${sign}${formatMoney(Math.abs(diff))}원`;
  // 상대가 0원이면 몇 %인지 말할 수 없다.
  return percent === null ? amount : `${amount} (${sign}${Math.abs(percent)}%)`;
}

function paintCompare(cell, result) {
  if (!result) {
    // 없는 비교를 -100%처럼 꾸며내지 않는다.
    cell.textContent = "비교할 기록이 없어요";
    cell.classList.remove("is-up", "is-down");
    return;
  }
  cell.textContent = formatDiff(result);
  cell.classList.toggle("is-up", result.diff > 0);
  cell.classList.toggle("is-down", result.diff < 0);
}

export function paintAnalysis() {
  const monthKey = getSelectedMonth();
  const memberFilter = getMemberFilter();
  const mine = filterByMember(getExpenses(), memberFilter);

  elements.analysisMonth.textContent = formatMonth(monthKey);
  elements.analysisPrev.disabled = !isValidMonthKey(shiftMonthKey(monthKey, -1));
  elements.analysisNext.disabled = !isValidMonthKey(shiftMonthKey(monthKey, 1));
  paintMemberTabs(elements.analysisMembers, getMemberFilter());

  const compared = compareMonth(mine, monthKey);
  const who = memberFilter ? getMembers().find((m) => m.id === memberFilter)?.name : null;
  // 진행 중인 달은 며칠까지 본 숫자인지 밝혀야 한다. 안 그러면 적게 쓴 것처럼 보인다.
  const until = compared.maxDay ? ` · ${compared.maxDay}일까지` : "";
  elements.analysisScope.textContent = `${who ? `${who} 지출` : "함께 쓴 금액"}${until}`;
  elements.analysisAmount.textContent = `${formatMoney(compared.total)}원`;

  paintCompare(elements.comparePrevious, compared.previous);
  paintCompare(elements.compareLastYear, compared.lastYear);

  // 머리의 큰 숫자와 같은 범위를 본다. 범위가 다르면 분류를 다 더해도 위 숫자와 안 맞는다.
  const inMonth = (key) => sumByCategory(untilDay(getMonthlyExpenses(mine, key), compared.maxDay));
  const categories = inMonth(monthKey);

  // 견줄 기록이 없는 달은 고를 수 없다. 골라 둔 채 그런 달로 넘어오면 저절로 꺼진다.
  const against = compareWith === "previous" ? compared.previous : compareWith === "lastYear" ? compared.lastYear : null;
  paintComparePicker(compared, against);

  if (!categories.length && !against) {
    elements.analysisList.innerHTML = `<p class="analysis-empty">이 달에는 기록이 없어요.</p>`;
    return;
  }

  elements.analysisList.innerHTML = against
    ? paintCompared(categories, inMonth(against.month))
    : paintShares(categories, compared.total);
}

/** 비교 끔: 막대는 그 달 총액 대비 비중. 옆의 %와 같은 것을 가리킨다. */
function paintShares(categories, total) {
  return categories
    .map(
      (category) => `
      <div class="analysis-row">
        <span class="analysis-name">${escapeHtml(category.label)}</span>
        <span class="analysis-bar"><i style="width:${(category.total / total) * 100}%;background:${category.color}"></i></span>
        <span class="analysis-amount">${formatMoney(category.total)}원</span>
        <span class="analysis-percent">${category.percent}%</span>
      </div>`,
    )
    .join("");
}

/**
 * 비교 켬: 두 막대를 같은 자로 잰다.
 * 각자 자기 달의 비중으로 그리면, 같은 금액을 써도 총액이 다른 달의 막대가 짧아져
 * "줄였다"로 읽힌다. 두 달을 통틀어 가장 큰 금액을 기준으로 삼아야 길이 차이가 곧 금액 차이다.
 */
function paintCompared(categories, otherCategories) {
  const rows = compareCategories(categories, otherCategories);
  const scale = Math.max(...rows.flatMap((row) => [row.total, row.otherTotal]), 1);

  // 0원이면 막대를 아예 그리지 않는다. 최소 굵기 8px 이 남으면 안 썼는데 쓴 것처럼 보인다.
  const fill = (amount, color) =>
    amount ? `<i style="width:${(amount / scale) * 100}%;background:${color}"></i>` : "";

  return rows
    .map(
      (row) => `
      <div class="analysis-row is-compared">
        <span class="analysis-name">${escapeHtml(row.label)}</span>
        <span class="analysis-pair">
          <span class="analysis-bar">${fill(row.total, row.color)}</span>
          <span class="analysis-bar is-other">${fill(row.otherTotal, row.color)}</span>
        </span>
        <span class="analysis-amount">${formatMoney(row.total)}원</span>
        <span class="analysis-percent ${row.diff > 0 ? "is-up" : row.diff < 0 ? "is-down" : ""}">${
          row.diff === 0 ? "±0" : `${row.diff > 0 ? "+" : "−"}${formatMoney(Math.abs(row.diff))}`
        }</span>
      </div>`,
    )
    .join("");
}

/** 견줄 기록이 있는 달만 고를 수 있게 한다. */
function paintComparePicker(compared, active) {
  const 가능 = { previous: compared.previous, lastYear: compared.lastYear };
  let 고를수있음 = false;

  elements.compareButtons.forEach((button) => {
    const mode = button.dataset.compare;
    button.disabled = !가능[mode];
    if (가능[mode]) 고를수있음 = true;
    button.setAttribute("aria-pressed", String(Boolean(active) && compareWith === mode));
  });

  // 고를 게 있는데 아직 안 골랐을 때만 알린다. 한 번 고르고 나면 설명이 필요 없다.
  elements.compareHint.hidden = !고를수있음 || Boolean(active);
}

/** 같은 것을 다시 누르면 꺼진다. */
export function toggleCompare(mode) {
  compareWith = compareWith === mode ? null : mode;
}

export function openAnalysisPage() {
  paintAnalysis();
  showPage(elements.analysisPage);
}

/** 분석에서 옮긴 달은 본 화면에도 그대로 적용된다. 보고 있는 달은 하나뿐이다. */
export function shiftAnalysisMonth(offset) {
  const next = shiftMonthKey(getSelectedMonth(), offset);
  if (!isValidMonthKey(next)) return;
  setSelectedMonth(next);
}
