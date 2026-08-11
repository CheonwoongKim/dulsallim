import { elements } from "../dom.js";
import { formatCompactMoney } from "../domain/calendar.js";
import { formatMonth } from "../domain/expenses.js";
import { getMembers } from "../members.js";
import { getExpenses, getSelectedMonth, setSelectedMonth } from "../store.js";
import { availableYears, buildYearSeries } from "../domain/trend.js";
import { drawLegend, drawTrend, monthIndexAt, moveScrubLine } from "../ui/trend-chart.js";
import { escapeHtml } from "../ui/escape.js";
import { hideSheet, showSheet } from "../ui/sheet.js";

/**
 * 한 해를 한눈에 보는 시트.
 *
 * 세로 축에 숫자를 달지 않는다. 이 화면이 답하는 질문은 "얼마"가 아니라 "어떻게 변했나"라서,
 * 숫자가 붙어 있으면 눈이 그리로 가서 정작 모양을 못 본다.
 * 정확한 금액이 필요하면 세로 점선을 그 달로 옮긴다 — 아래 줄에 숫자가 나온다.
 *
 * 그리기만 한다. 달을 옮긴 뒤 다른 화면을 고쳐 그리는 일은 render()가 맡는다.
 */

const LAST_MONTH_INDEX = 11;

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
  const label = formatMonth(data.months[scrubIndex]);
  // 화면을 못 보는 사람에게는 이 값이 그래프를 대신한다.
  elements.trendChart.setAttribute("aria-valuenow", String(scrubIndex + 1));
  elements.trendChart.setAttribute("aria-valuetext", label);

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
  elements.trendYear.textContent = `${year}년`;
  elements.trendPrev.disabled = !years.includes(year - 1);
  elements.trendNext.disabled = !years.includes(year + 1);

  elements.trendChart.innerHTML = drawTrend(data, scrubIndex);
  elements.trendLegend.innerHTML = drawLegend(data.series);
  paintReadout();
}

/** @param {boolean} resetScrub 해가 바뀌었으면 점선도 그 해에서 다시 고른다. */
function rebuild(resetScrub) {
  data = buildYearSeries(getExpenses(), getMembers(), year);
  if (resetScrub) scrubIndex = defaultScrub(data);
  paint();
}

export function openTrendSheet() {
  // 보고 있던 달의 해로 연다. 8월을 보다 열었는데 1월이 나오면 맥락이 끊긴다.
  year = Number(getSelectedMonth().slice(0, 4));
  rebuild(true);
  showSheet(elements.trendSheet);
}

export function closeTrendSheet() {
  scrubbing = false;
  hideSheet(elements.trendSheet);
}

/** 열어 둔 사이에 상대가 기록했을 때. 짚고 있던 달은 그대로 둔다. */
export function refreshTrend() {
  if (!data) return;
  rebuild(false);
}

export function shiftTrendYear(offset) {
  if (!availableYears(getExpenses()).includes(year + offset)) return;
  year += offset;
  // 8월을 짚고 있다 작년으로 가면 그 해에도 8월이 맞는다는 보장이 없다.
  rebuild(true);
}

/* ── 세로 점선 옮기기 ─────────────────────────────────────── */

function setScrub(next) {
  const clamped = Math.min(LAST_MONTH_INDEX, Math.max(0, next));
  if (clamped === scrubIndex) return;
  scrubIndex = clamped;
  // 선 하나만 옮긴다. 매번 다시 그리면 손가락을 따라오지 못한다.
  moveScrubLine(elements.trendChart, scrubIndex);
  paintReadout();
}

function scrubTo(clientX) {
  const box = elements.trendChart.getBoundingClientRect();
  if (!box.width) return;
  setScrub(monthIndexAt((clientX - box.left) / box.width));
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

/** 손가락이 없어도 달을 고를 수 있어야 한다. */
export function scrubByKey(event) {
  const 이동 = { ArrowLeft: -1, ArrowRight: 1, Home: -LAST_MONTH_INDEX, End: LAST_MONTH_INDEX };
  const step = 이동[event.key];
  if (step === undefined) return;
  event.preventDefault();
  setScrub(event.key === "Home" ? 0 : event.key === "End" ? LAST_MONTH_INDEX : scrubIndex + step);
}

/**
 * 짚은 달을 자세히 본다. 시트를 닫고 그 달로 옮긴다.
 * 다시 그리는 일은 부르는 쪽이 render()로 한다 — 보고 있는 달은 본 화면과 나눠 쓰는 상태다.
 * @returns {boolean} 달을 옮겼으면 true
 */
export function openScrubbedMonth() {
  if (!data?.recorded[scrubIndex]) return false;
  setSelectedMonth(data.months[scrubIndex]);
  closeTrendSheet();
  return true;
}
