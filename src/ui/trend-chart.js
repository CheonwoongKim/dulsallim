import { formatCompactMoney } from "../calendar.js";
import { escapeHtml } from "./escape.js";

/**
 * 한 해 추이를 SVG 한 장으로 그린다. 계산은 trend.js가 끝내 두고 여기서는 좌표만 만든다.
 *
 * 라이브러리를 쓰지 않는 이유는 캘린더·분류 막대와 같다. 우리가 그리는 그림이
 * 선 몇 개와 점 열두 개뿐이라, 들여올 코드가 그릴 그림보다 훨씬 크다.
 */

/* 좌표계. 실제 크기는 CSS가 정하고, 이 안에서는 언제나 이 눈금으로 계산한다. */
const VIEW = { width: 320, height: 180 };
/*
 * 좌우 여백을 같게 둔다.
 * 세로 축 숫자를 왼쪽에 세우면 그 자리만큼(38 남짓) 격자가 오른쪽으로 밀려,
 * 왼쪽만 휑하게 비어 그림이 가운데에 있지 않은 것처럼 보인다.
 * 위쪽도 마찬가지다 — 축 숫자를 없앤 뒤로는 띄울 이유가 없어, 꼭대기 점이
 * 잘리지 않을 만큼만 남긴다.
 */
const PAD = { left: 6, right: 6, top: 6, bottom: 22 };
const PLOT = {
  width: VIEW.width - PAD.left - PAD.right,
  height: VIEW.height - PAD.top - PAD.bottom,
};
const LAST_MONTH_INDEX = 11;
/** 점 반지름. 진행 중인 달은 속을 비우고 조금 키워 "아직 안 끝났다"고 알린다. */
const DOT_R = 2.6;
const DOT_R_PROVISIONAL = 3.4;

const x = (index) => PAD.left + (index / LAST_MONTH_INDEX) * PLOT.width;
const y = (value, max) => PAD.top + (1 - value / max) * PLOT.height;
const round = (value) => Math.round(value * 10) / 10;

/** 값이 있는 구간만 이어 붙인다. 비어 있는 달에서 선이 끊겨야 "모른다"가 보인다. */
function toSegments(points) {
  const segments = [];
  let current = [];
  points.forEach((point, index) => {
    if (point === null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push(index);
  });
  if (current.length) segments.push(current);
  return segments;
}

function polyline(indices, line, max, extra = "") {
  // 점 하나뿐인 구간은 polyline이 아무것도 그리지 않는다. 점은 아래에서 따로 찍는다.
  if (indices.length < 2) return "";
  const coords = indices.map((i) => `${round(x(i))},${round(y(line.points[i], max))}`).join(" ");
  return `<polyline class="trend-line${extra}" points="${coords}" stroke="${line.color}" />`;
}

/**
 * 진행 중인 달로 들어가는 마지막 구간은 점선으로 긋는다.
 *
 * 3일까지 쓴 금액이 한 달치 옆에 실선으로 이어지면 절벽처럼 떨어져 "이번 달 안 썼다"로 읽힌다.
 * 속 빈 점만으로는 약하다 — 눈에 먼저 들어오는 건 점이 아니라 선의 모양이다.
 */
function drawLine(line, max, currentIndex) {
  return toSegments(line.points)
    .map((segment) => {
      const endsAtCurrent = segment[segment.length - 1] === currentIndex && segment.length > 1;
      if (!endsAtCurrent) return polyline(segment, line, max);
      return (
        polyline(segment.slice(0, -1), line, max) +
        polyline(segment.slice(-2), line, max, " is-provisional")
      );
    })
    .join("");
}

function drawDots(line, max, currentIndex) {
  return line.points
    .map((point, index) => {
      if (point === null) return "";
      // 진행 중인 달은 아직 한 달치가 아니다. 속을 비워 다른 점과 구분한다.
      const provisional = index === currentIndex;
      return `<circle class="trend-dot${provisional ? " is-provisional" : ""}" cx="${round(x(index))}" cy="${round(
        y(point, max),
      )}" r="${provisional ? DOT_R_PROVISIONAL : DOT_R}" stroke="${line.color}" fill="${
        provisional ? "var(--white)" : line.color
      }" />`;
    })
    .join("");
}

function drawGoal(line, max) {
  if (!line.goal || line.goal > max) return "";
  const at = round(y(line.goal, max));
  return `<line class="trend-goal" x1="${PAD.left}" y1="${at}" x2="${PAD.left + PLOT.width}" y2="${at}" stroke="${line.color}" />`;
}

/**
 * 0·절반·꼭대기 세 줄. 숫자는 붙이지 않는다.
 *
 * 이 그래프가 답하는 질문은 "얼마"가 아니라 "어떻게 변했나"다. 축에 숫자를 달면
 * 눈이 자꾸 그리로 가서 정작 모양을 못 본다. 정확한 금액은 세로 점선을 짚으면 나온다.
 * 선은 남긴다 — 숫자가 없어도 높이를 가늠할 자는 있어야 한다.
 */
function drawGrid(max) {
  return [0, max / 2, max]
    .map((value) => {
      const at = round(y(value, max));
      return `<line class="trend-grid" x1="${PAD.left}" y1="${at}" x2="${PAD.left + PLOT.width}" y2="${at}" />`;
    })
    .join("");
}

/** 열두 달을 다 적는다. 세로 축 숫자를 뺀 만큼 가로에 쓸 자리가 넉넉해졌다. */
function drawMonthLabels(scrubIndex) {
  return Array.from({ length: 12 }, (_, index) => {
    const here = index === scrubIndex ? " is-active" : "";
    return `<text class="trend-axis${here}" x="${round(x(index))}" y="${VIEW.height - 6}" text-anchor="middle">${index + 1}</text>`;
  }).join("");
}

/** 짚고 있는 달을 가리키는 세로 점선. 끌면 이 선이 따라온다. */
function drawScrub(scrubIndex) {
  const at = round(x(scrubIndex));
  return `<line class="trend-scrub" id="trend-scrub" x1="${at}" y1="${PAD.top}" x2="${at}" y2="${PAD.top + PLOT.height}" />`;
}

/** 화면에서 어디를 짚었는지를 몇 월인지로 바꾼다. @param ratio 0(왼쪽 끝)~1(오른쪽 끝) */
export function monthIndexAt(ratio) {
  const unit = ratio * VIEW.width;
  const step = PLOT.width / LAST_MONTH_INDEX;
  return Math.min(LAST_MONTH_INDEX, Math.max(0, Math.round((unit - PAD.left) / step)));
}

export function drawTrend({ currentIndex, max, series }, scrubIndex) {
  const body = series
    .map((line) => drawGoal(line, max) + drawLine(line, max, currentIndex) + drawDots(line, max, currentIndex))
    .join("");

  return (
    `<svg viewBox="0 0 ${VIEW.width} ${VIEW.height}" role="img" aria-label="달마다 쓴 금액 추이">` +
    drawGrid(max) +
    drawScrub(scrubIndex) +
    drawMonthLabels(scrubIndex) +
    body +
    `</svg>`
  );
}

/** 점선을 옮길 때 SVG 를 통째로 다시 만들지 않는다. 선 하나만 옮기면 된다. */
export function moveScrubLine(root, scrubIndex) {
  const line = root.querySelector("#trend-scrub");
  if (!line) return;
  const at = round(x(scrubIndex));
  line.setAttribute("x1", at);
  line.setAttribute("x2", at);
  root.querySelectorAll(".trend-axis").forEach((label, index) => {
    label.classList.toggle("is-active", index === scrubIndex);
  });
}

/**
 * 세로 축에서 숫자를 뺀 대신, 기준이 되는 숫자는 여기에 둔다.
 * 목표 금액은 이 그래프에서 가장 자주 쓰이는 자라서 늘 보이는 편이 낫다.
 */
export function drawLegend(series) {
  return series
    .map(
      (line) =>
        `<span class="trend-row">` +
        `<span class="trend-key"><i style="background:${line.color}"></i>${escapeHtml(line.name)}</span>` +
        (line.goal
          ? `<span class="trend-key"><i class="is-goal" style="background:repeating-linear-gradient(90deg,${line.color} 0 4px,transparent 4px 7px)"></i>목표 ${escapeHtml(
              formatCompactMoney(line.goal),
            )}</span>`
          : `<span class="trend-key is-muted">목표 없음</span>`) +
        `</span>`,
    )
    .join("");
}
