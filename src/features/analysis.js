import { elements } from "../dom.js";
import { compareMonth, sumByCategory } from "../analysis.js";
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

/** 전체 / 사람 각각. 요약 카드를 누르는 것과 같은 상태를 쓴다. */
function paintMemberPicker() {
  const current = getMemberFilter();
  const options = [{ id: null, name: "전체" }, ...getMembers()];

  elements.analysisMembers.replaceChildren(
    ...options.map(({ id, name }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.member = id || "";
      button.textContent = name;
      button.setAttribute("aria-pressed", String(current === id));
      return button;
    }),
  );
}

export function paintAnalysis() {
  const monthKey = getSelectedMonth();
  const memberFilter = getMemberFilter();
  const mine = filterByMember(getExpenses(), memberFilter);

  elements.analysisMonth.textContent = formatMonth(monthKey);
  elements.analysisPrev.disabled = !isValidMonthKey(shiftMonthKey(monthKey, -1));
  elements.analysisNext.disabled = !isValidMonthKey(shiftMonthKey(monthKey, 1));
  paintMemberPicker();

  const compared = compareMonth(mine, monthKey);
  const who = memberFilter ? getMembers().find((m) => m.id === memberFilter)?.name : null;
  // 진행 중인 달은 며칠까지 본 숫자인지 밝혀야 한다. 안 그러면 적게 쓴 것처럼 보인다.
  const until = compared.maxDay ? ` · ${compared.maxDay}일까지` : "";
  elements.analysisScope.textContent = `${who ? `${who} 지출` : "함께 쓴 금액"}${until}`;
  elements.analysisAmount.textContent = `${formatMoney(compared.total)}원`;

  paintCompare(elements.comparePrevious, compared.previous);
  paintCompare(elements.compareLastYear, compared.lastYear);

  const categories = sumByCategory(getMonthlyExpenses(mine, monthKey));
  if (!categories.length) {
    elements.analysisList.innerHTML = `<p class="analysis-empty">이 달에는 기록이 없어요.</p>`;
    return;
  }
  const top = categories[0].total;
  elements.analysisList.innerHTML = categories
    .map(
      (category) => `
      <div class="analysis-row">
        <span class="analysis-name">${escapeHtml(category.label)}</span>
        <span class="analysis-bar"><i style="width:${Math.max(2, (category.total / top) * 100)}%;background:${category.color}"></i></span>
        <span class="analysis-amount">${formatMoney(category.total)}원</span>
        <span class="analysis-percent">${category.percent}%</span>
      </div>`,
    )
    .join("");
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
