import { elements } from "./dom.js";
import {
  filterByDate,
  filterByMember,
  formatDayLabel,
  formatMonth,
  formatMoney,
  getMonthlyExpenses,
  summarize,
  summarizeGoal,
  toMonthKey,
} from "./expenses.js";
import { getMemberGoal, getMemberName, getMembers } from "./members.js";
import { renderCalendar } from "./ui/calendar-grid.js";
import { paintAnalysis } from "./features/analysis.js";
import { refreshTrend } from "./features/trend.js";
import {
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
export function resetTotalAnimation() {
  previousTotal = 0;
}

function animateNumber(from, to) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    elements.total.textContent = formatMoney(to);
    return;
  }

  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - startedAt) / COUNT_UP_MS, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    elements.total.textContent = formatMoney(Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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

export function render() {
  // 상단 요약은 항상 그 달 전체 기준. 사람 필터는 아래 목록에만 적용한다.
  const monthly = getMonthlyExpenses(getExpenses(), getSelectedMonth());
  const stats = summarize(monthly, getMembers());
  const memberFilter = getMemberFilter();
  // 캘린더 숫자는 사람 필터까지만 반영한다. 날짜까지 걸러 넘기면 고른 날 하나만 남고 나머지가 빈다.
  const byMember = filterByMember(monthly, memberFilter);
  const dateFilter = getDateFilter();
  const visible = filterByDate(byMember, dateFilter);

  elements.monthTitle.textContent = formatMonth(getSelectedMonth());
  animateNumber(previousTotal, stats.total);
  previousTotal = stats.total;

  // 목표는 값이 하나뿐이라 지난 달을 "지금의 목표"로 판정하게 된다. 이번 달에만 말한다.
  const isThisMonth = getSelectedMonth() === toMonthKey(new Date());

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

  const calendarMode = getViewMode() === "calendar";
  elements.calendar.hidden = !calendarMode;
  elements.viewToggle.forEach((button) => {
    button.setAttribute("aria-pressed", String((button.dataset.view === "calendar") === calendarMode));
  });
  if (calendarMode) {
    renderCalendar({ monthKey: getSelectedMonth(), monthly: byMember, selected: dateFilter });
  }

  elements.count.textContent = `(${visible.length})`;

  // 사람과 날짜를 함께 걸 수 있다. 걸린 것만 이어 붙인다.
  const labels = [
    memberFilter ? getMemberName(memberFilter) : null,
    dateFilter ? formatDayLabel(dateFilter) : null,
  ].filter(Boolean);
  elements.ledgerFilter.textContent = labels.length ? ` · ${labels.join(" · ")}` : "";
  elements.ledgerFilter.hidden = !labels.length;

  // 캘린더만 보고 있을 때는 아래 목록을 접어 둔다. 날을 고르면 그날 것만 펼친다.
  elements.list.hidden = calendarMode && !dateFilter;
  if (!elements.list.hidden) renderList(visible);

  // 분석을 열어 둔 채 달이나 사람을 바꿀 수 있다. 같은 자리에서 함께 맞춘다.
  if (!elements.analysisPage.hidden) paintAnalysis();
  if (!elements.trendSheet.hidden) refreshTrend();
}
