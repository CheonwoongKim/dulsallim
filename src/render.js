import { elements } from "./dom.js";
import {
  CATEGORIES,
  filterByCategory,
  filterByDate,
  filterByMember,
  formatDayLabel,
  formatMonth,
  formatMoney,
  getMonthlyExpenses,
  summarize,
  summarizeGoal,
  toMonthKey,
} from "./domain/expenses.js";
import { getMemberGoal, getMemberName, getMembers } from "./members.js";
import { renderCalendar } from "./ui/calendar-grid.js";
import { paintAnalysis } from "./features/analysis-page.js";
import { refreshTrend } from "./features/trend-sheet.js";
import { paintWishPage } from "./features/wish.js";
import {
  getCategoryFilter,
  getDateFilter,
  getExpenses,
  getMemberFilter,
  getSelectedMonth,
  getViewMode,
} from "./store.js";
import { renderList } from "./ui/ledger.js";

const COUNT_UP_MS = 520;

let previousTotal = 0;

/** 월을 바꾸면 이전 달 금액에서 이어지는 애니메이션이 어색하므로 0에서 다시 센다. */
let totalFrame = 0;

export function resetTotalAnimation() {
  previousTotal = 0;
}

/**
 * 제목 글자가 바뀌었으면 한 번 강제로 다시 그린다.
 *
 * 제목은 붙어 있어(sticky) iOS 가 따로 떼어 그리는데, 안의 글자가 바뀌어도 그 그림이
 * 갱신되지 않는 일이 있다. "(9)" 가 "(13)" 이 되면 넓어진 만큼이 네모나게 잘려
 * 닫는 괄호가 반쯤 사라져 보였다. 스크롤하면 멀쩡해지는 것도 그래서다.
 * display 를 껐다 켜면 브라우저가 다시 그릴 수밖에 없다.
 *
 * 건수만 보면 모자란다. 제목에는 고른 사람 이름도 함께 붙어서, 건수가 그대로여도
 * 필터를 바꾸면 글자 폭이 달라진다. 제목 전체를 보고 판단한다.
 */
let paintedTitle = "";

function repaintLedgerTitle() {
  const title = elements.ledgerTitle?.textContent || "";
  if (title === paintedTitle) return;
  paintedTitle = title;

  const heading = elements.sectionHeading;
  if (!heading) return;
  heading.style.display = "none";
  void heading.offsetHeight;
  heading.style.display = "";
}

function animateNumber(from, to) {
  /*
   * 앞의 애니메이션을 세우지 않으면 둘이 같은 자리에 번갈아 쓴다.
   * 늦게 시작한 쪽이 먼저 끝나면, 남은 쪽이 새 값 위에 옛 중간값을 도로 적는다.
   */
  cancelAnimationFrame(totalFrame);

  // 사람 필터·날짜 선택·보기 전환처럼 총액이 그대로인 렌더가 더 많다. 그때는 셀 것이 없다.
  if (from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    elements.total.textContent = formatMoney(to);
    return;
  }

  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - startedAt) / COUNT_UP_MS, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    elements.total.textContent = formatMoney(Math.round(from + (to - from) * eased));
    if (progress < 1) totalFrame = requestAnimationFrame(tick);
  };
  totalFrame = requestAnimationFrame(tick);
}

/**
 * 사람 이름을 화면 곳곳에 한 번 새긴다. 로그인 직후, 명부를 읽은 뒤에만 부르면 된다.
 * 이름은 서버에 있으므로 DB에서 고치면 다음 접속부터 그대로 따라온다.
 */
export function paintMembers() {
  const members = getMembers();

  elements.memberSlots.forEach((slot, index) => {
    const member = members[index];
    slot.row.hidden = !member;
    if (!member) return;
    slot.row.dataset.member = member.id;
    slot.avatar.textContent = member.name.slice(-1);
    slot.avatar.style.background = member.color;
    // 비중 막대도 같은 색을 쓴다. 따로 놀면 어느 칸이 누구 몫인지 알 수 없다.
    slot.bar.style.background = member.color;
    slot.name.textContent = `${member.name} 지출`;
  });

  // 입력 폼의 결제자 선택도 같은 명부를 따른다.
  ["member", "fixed-member"].forEach((group) => {
    document.querySelectorAll(`input[name="${group}"]`).forEach((radio, index) => {
      const member = members[index];
      const label = radio.closest("label");
      if (!member) {
        if (label) label.hidden = true;
        return;
      }
      if (label) label.hidden = false;
      radio.value = member.id;
      radio.nextElementSibling.textContent = member.name;
    });
  });
}

/** 사람별 합계·비중·목표. 한 사람치 계산이 길어 render 에서 떼어 둔다. */
function paintMemberShares(stats, monthly, memberFilter, isThisMonth) {
  elements.memberSlots.forEach((slot, index) => {
    const share = stats.perMember[index];
    if (!share) return;
    slot.count.textContent = `(${share.count})`;
    slot.total.textContent = `${formatMoney(share.total)}원`;
    slot.ratio.textContent = `${share.percent}%`;
    slot.bar.style.width = `${share.percent}%`;
    slot.row.setAttribute("aria-pressed", String(memberFilter === share.id));

    const goal = isThisMonth
      ? summarizeGoal({ monthly, memberId: share.id, goal: getMemberGoal(share.id) })
      : null;
    slot.goal.hidden = !goal;
    if (!goal) return;
    slot.goal.classList.toggle("is-over", goal.over);
    slot.goal.textContent = goal.over
      ? `${formatMoney(-goal.remaining)}원 초과`
      : `${formatMoney(goal.remaining)}원 남음 · ${goal.percent}%`;
  });
}

/** 지출 내역 제목 — 건수와 걸린 필터. 둘을 적은 뒤 한 번만 다시 그린다. */
function paintLedgerHeading(visible, memberFilter, dateFilter, categoryFilter) {
  elements.count.textContent = `(${visible.length})`;

  // 사람·날짜·분류를 함께 걸 수 있다. 걸린 것만 이어 붙인다.
  const labels = [
    memberFilter ? getMemberName(memberFilter) : null,
    categoryFilter ? (CATEGORIES[categoryFilter] || CATEGORIES.etc).label : null,
    dateFilter ? formatDayLabel(dateFilter) : null,
  ].filter(Boolean);
  elements.ledgerFilter.textContent = labels.length ? ` · ${labels.join(" · ")}` : "";
  elements.ledgerFilter.hidden = !labels.length;
  repaintLedgerTitle();
}

export function render() {
  // 상단 요약은 항상 그 달 전체 기준. 사람 필터는 아래 목록에만 적용한다.
  const monthly = getMonthlyExpenses(getExpenses(), getSelectedMonth());
  const stats = summarize(monthly, getMembers());
  const memberFilter = getMemberFilter();
  // 캘린더 숫자는 사람 필터까지만 반영한다. 날짜까지 걸러 넘기면 고른 날 하나만 남고 나머지가 빈다.
  const byMember = filterByMember(monthly, memberFilter);
  const dateFilter = getDateFilter();
  /*
   * 캘린더 숫자에는 분류를 걸지 않는다. 걸면 그 분류가 없는 날이 통째로 비어,
   * 달력이 "그날은 안 썼다"로 읽힌다. 분류는 아래 목록에만 적용한다.
   */
  const categoryFilter = getCategoryFilter();
  const visible = filterByCategory(filterByDate(byMember, dateFilter), categoryFilter);

  elements.monthTitle.textContent = formatMonth(getSelectedMonth());
  animateNumber(previousTotal, stats.total);
  // 큰 금액이 위로 사라지면 머리에 이 값이 대신 뜬다. 세는 연출은 큰 쪽만 한다.
  if (elements.compactTotal) elements.compactTotal.textContent = `${formatMoney(stats.total)}원`;
  previousTotal = stats.total;

  // 목표는 값이 하나뿐이라 지난 달을 "지금의 목표"로 판정하게 된다. 이번 달에만 말한다.
  const isThisMonth = getSelectedMonth() === toMonthKey(new Date());

  paintMemberShares(stats, monthly, memberFilter, isThisMonth);

  const calendarMode = getViewMode() === "calendar";
  elements.calendar.hidden = !calendarMode;
  elements.viewToggle.forEach((button) => {
    button.setAttribute("aria-pressed", String((button.dataset.view === "calendar") === calendarMode));
  });
  if (calendarMode) {
    renderCalendar({ monthKey: getSelectedMonth(), monthly: byMember, selected: dateFilter });
  }

  paintLedgerHeading(visible, memberFilter, dateFilter, categoryFilter);

  // 캘린더만 보고 있을 때는 아래 목록을 접어 둔다. 날을 고르면 그날 것만 펼친다.
  elements.list.hidden = calendarMode && !dateFilter;
  if (!elements.list.hidden) renderList(visible);

  // 분석을 열어 둔 채 달이나 사람을 바꿀 수 있다. 같은 자리에서 함께 맞춘다.
  if (!elements.analysisPage.hidden) paintAnalysis();
  if (!elements.trendSheet.hidden) refreshTrend();
  // 상대가 위시를 담거나 "나도" 를 누르면 구독이 여기까지 데려온다(sync.js → render).
  if (!elements.wishPage.hidden) paintWishPage();
}
