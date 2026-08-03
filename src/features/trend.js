import { elements } from "../dom.js";
import { getMembers } from "../members.js";
import { getExpenses, getSelectedMonth, setSelectedMonth } from "../store.js";
import { availableYears, buildYearSeries } from "../trend.js";
import { drawLegend, drawTrend } from "../ui/trend-chart.js";
import { hideSheet, showSheet } from "../ui/sheet.js";
import { paintAnalysis } from "./analysis.js";

/**
 * 한 해를 한눈에 보는 시트.
 *
 * 분석 페이지는 한 달을 깊이 보는 곳이라 그대로 두고, 여기서는 열두 달의 모양만 본다.
 * 달을 하나 누르면 시트가 닫히고 분석 페이지가 그 달로 옮겨 간다 —
 * `‹ ›`로 넘겨 가며 찾던 일을, 눈에 띈 달을 짚는 일로 바꾼다.
 */

let year = null;

function paint() {
  const years = availableYears(getExpenses());
  const data = buildYearSeries(getExpenses(), getMembers(), year);

  elements.trendYear.textContent = `${year}년`;
  elements.trendPrev.disabled = !years.includes(year - 1);
  elements.trendNext.disabled = !years.includes(year + 1);

  elements.trendChart.innerHTML = drawTrend(data);
  elements.trendLegend.innerHTML = drawLegend(data.series);
}

export function openTrendSheet() {
  // 보고 있던 달의 해로 연다. 8월을 보다 열었는데 1월이 나오면 맥락이 끊긴다.
  year = Number(getSelectedMonth().slice(0, 4));
  paint();
  showSheet(elements.trendSheet);
}

export function closeTrendSheet() {
  hideSheet(elements.trendSheet);
}

export function shiftTrendYear(offset) {
  if (!availableYears(getExpenses()).includes(year + offset)) return;
  year += offset;
  paint();
}

/** 달을 짚으면 그 달로 옮겨 간다. 분석 페이지는 이미 뒤에 열려 있다. */
export function selectTrendMonth(monthKey) {
  setSelectedMonth(monthKey);
  paintAnalysis();
  closeTrendSheet();
}
