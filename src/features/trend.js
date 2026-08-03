import { elements } from "../dom.js";
import { formatCompactMoney } from "../calendar.js";
import { formatMonth } from "../expenses.js";
import { getMembers } from "../members.js";
import { getExpenses, getSelectedMonth, setSelectedMonth } from "../store.js";
import { availableYears, buildYearSeries } from "../trend.js";
import { drawLegend, drawTrend, monthIndexAt, moveScrubLine } from "../ui/trend-chart.js";
import { escapeHtml } from "../ui/escape.js";
import { hideSheet, showSheet } from "../ui/sheet.js";
import { paintAnalysis } from "./analysis.js";

/**
 * 한 해를 한눈에 보는 시트.
 *
 * 세로 축에 숫자를 달지 않는다. 이 화면이 답하는 질문은 "얼마"가 아니라 "어떻게 변했나"라서,
 * 숫자가 붙어 있으면 눈이 그리로 가서 정작 모양을 못 본다.
 * 정확한 금액이 필요하면 세로 점선을 그 달로 옮긴다 — 아래 줄에 숫자가 나온다.
 */

let year = null;
let scrubIndex = 0;
let data = null;
let scrubbing = false;

/** 처음 열 때 점선을 어디에 둘지. 이번 달이 있으면 거기, 없으면 마지막 기록. */
function defaultScrub(series) {
  if (series.currentIndex >= 0) return series.currentIndex;
  const last = series.recorded.lastIndexOf(true);
  return last >= 0 ? last : 0;
}

function paintReadout() {
  const monthKey = data.months[scrubIndex];
  const label = formatMonth(monthKey);

  if (!data.recorded[scrubIndex]) {
    elements.trendReadout.disabled = true;
    elements.trendReadout.innerHTML = `<b>${escapeHtml(label)}</b><span>기록이 없어요</span>`;
    return;
  }

  const 진행중 = scrubIndex === data.currentIndex;
  const amounts = data.series
    .map(
      (line) =>
        `<span class="trend-amount"><i style="background:${line.color}"></i>${escapeHtml(
          formatCompactMoney(line.points[scrubIndex]),
        )}</span>`,
    )
    .join("");

  elements.trendReadout.disabled = false;
  elements.trendReadout.innerHTML =
    `<b>${escapeHtml(label)}${진행중 ? " (아직 진행 중)" : ""}</b><span>${amounts}</span>`;
}

function paint() {
  const years = availableYears(getExpenses());
  data = buildYearSeries(getExpenses(), getMembers(), year);
  scrubIndex = Math.min(scrubIndex, data.months.length - 1);

  elements.trendYear.textContent = `${year}년`;
  elements.trendPrev.disabled = !years.includes(year - 1);
  elements.trendNext.disabled = !years.includes(year + 1);

  elements.trendChart.innerHTML = drawTrend(data, scrubIndex);
  elements.trendLegend.innerHTML = drawLegend(data.series);
  paintReadout();
}

export function openTrendSheet() {
  // 보고 있던 달의 해로 연다. 8월을 보다 열었는데 1월이 나오면 맥락이 끊긴다.
  year = Number(getSelectedMonth().slice(0, 4));
  data = buildYearSeries(getExpenses(), getMembers(), year);
  scrubIndex = defaultScrub(data);
  paint();
  showSheet(elements.trendSheet);
}

export function closeTrendSheet() {
  scrubbing = false;
  hideSheet(elements.trendSheet);
}

export function shiftTrendYear(offset) {
  if (!availableYears(getExpenses()).includes(year + offset)) return;
  year += offset;
  // 해를 옮기면 그 해에서 다시 고른다. 8월을 짚고 있다 작년으로 가면 8월이 맞는다는 보장이 없다.
  data = buildYearSeries(getExpenses(), getMembers(), year);
  scrubIndex = defaultScrub(data);
  paint();
}

/* ── 세로 점선 옮기기 ─────────────────────────────────────── */

function scrubTo(clientX) {
  const box = elements.trendChart.getBoundingClientRect();
  if (!box.width) return;
  const next = monthIndexAt((clientX - box.left) / box.width);
  if (next === scrubIndex) return;
  scrubIndex = next;
  // 선 하나만 옮긴다. 매번 다시 그리면 손가락을 따라오지 못한다.
  moveScrubLine(elements.trendChart, scrubIndex);
  paintReadout();
}

export function startScrub(event) {
  scrubbing = true;
  elements.trendChart.setPointerCapture?.(event.pointerId);
  scrubTo(event.clientX);
}

export function moveScrub(event) {
  if (!scrubbing) return;
  // 손가락으로 끄는 동안 화면이 함께 움직이면 선을 겨눌 수 없다.
  event.preventDefault();
  scrubTo(event.clientX);
}

export function endScrub() {
  scrubbing = false;
}

/** 짚은 달을 자세히 본다. 시트를 닫고 뒤에 있던 분석 페이지를 그 달로 옮긴다. */
export function openScrubbedMonth() {
  if (!data?.recorded[scrubIndex]) return;
  setSelectedMonth(data.months[scrubIndex]);
  paintAnalysis();
  closeTrendSheet();
}
