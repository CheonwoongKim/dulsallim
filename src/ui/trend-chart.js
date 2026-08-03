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
 * 숫자는 격자 "위"에 얹고 선은 폭을 다 쓰게 한다.
 */
const PAD = { left: 6, right: 6, top: 16, bottom: 22 };
const PLOT = {
  width: VIEW.width - PAD.left - PAD.right,
  height: VIEW.height - PAD.top - PAD.bottom,
};
const LAST_MONTH_INDEX = 11;
/** 점 반지름. 진행 중인 달은 속을 비우고 조금 키워 "아직 안 끝났다"고 알린다. */
const DOT_R = 2.6;
const DOT_R_PROVISIONAL = 3.4;
/** 눈금 숫자를 그 선에서 얼마나 띄울지. */
const AXIS_GAP = 3;

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
        provisional ? "var(--surface)" : line.color
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
 * 0·절반·꼭대기 세 줄만 긋는다. 폰에서 그 이상은 선이 글자를 덮는다.
 * 숫자는 각 줄 바로 위에 왼쪽 맞춤으로 얹는다. 이 함수를 맨 먼저 그려
 * 선과 점이 숫자 위를 지나가게 한다 — 가려야 할 것은 숫자 쪽이다.
 */
function drawGrid(max) {
  return [0, max / 2, max]
    .map((value) => {
      const at = round(y(value, max));
      return (
        `<line class="trend-grid" x1="${PAD.left}" y1="${at}" x2="${PAD.left + PLOT.width}" y2="${at}" />` +
        `<text class="trend-axis" x="${PAD.left}" y="${round(at - AXIS_GAP)}" text-anchor="start">${
          value ? escapeHtml(formatCompactMoney(value)) : "0"
        }</text>`
      );
    })
    .join("");
}

/** 열두 달을 다 적으면 글자가 겹친다. 홀수 달만 적어도 위치는 읽힌다. */
function drawMonthLabels() {
  return Array.from({ length: 12 }, (_, index) => {
    if (index % 2 !== 0) return "";
    return `<text class="trend-axis" x="${round(x(index))}" y="${VIEW.height - 6}" text-anchor="middle">${index + 1}</text>`;
  }).join("");
}

/** 손가락으로 점을 정확히 누르기는 어렵다. 달마다 세로 띠를 통째로 눌리게 둔다. */
function drawTapTargets(months, recorded) {
  const band = PLOT.width / LAST_MONTH_INDEX;
  return months
    .map((monthKey, index) => {
      if (!recorded[index]) return "";
      const left = round(Math.max(PAD.left, x(index) - band / 2));
      const width = round(Math.min(band, PAD.left + PLOT.width - left));
      return `<rect class="trend-hit" data-trend-month="${monthKey}" x="${left}" y="${PAD.top}" width="${width}" height="${PLOT.height}" />`;
    })
    .join("");
}

export function drawTrend({ months, recorded, currentIndex, max, series }) {
  const body = series
    .map((line) => drawGoal(line, max) + drawLine(line, max, currentIndex) + drawDots(line, max, currentIndex))
    .join("");

  return (
    `<svg viewBox="0 0 ${VIEW.width} ${VIEW.height}" role="img" aria-label="달마다 쓴 금액 추이">` +
    drawGrid(max) +
    drawMonthLabels() +
    body +
    drawTapTargets(months, recorded) +
    `</svg>`
  );
}

/** 색이 사람을 뜻한다는 것과, 점선이 목표라는 것만 알려 주면 된다. */
export function drawLegend(series) {
  return series
    .map(
      (line) =>
        `<span class="trend-key"><i style="background:${line.color}"></i>${escapeHtml(line.name)}</span>`,
    )
    .join("");
}
