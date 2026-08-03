import { elements } from "../dom.js";
import { WEEKDAYS, buildCalendar, formatCompactMoney, sumByDate } from "../calendar.js";
import { toDateKey } from "../expenses.js";

/**
 * 그 달을 격자로 그린다.
 *
 * @param {object} input
 * @param {string} input.monthKey 보고 있는 달
 * @param {Array} input.monthly 그 달 지출. 사람 필터는 적용된 것, 날짜 필터는 적용되지 않은 것을 넘긴다
 *   — 날짜까지 걸러 넘기면 고른 날 하나만 숫자가 남고 나머지가 빈다.
 * @param {string|null} input.selected 지금 고른 날
 */
export function renderCalendar({ monthKey, monthly, selected }) {
  const totals = sumByDate(monthly);
  const today = toDateKey(new Date());

  const head = WEEKDAYS.map((name) => {
    const cell = document.createElement("span");
    cell.className = "calendar-weekday";
    cell.textContent = name;
    return cell;
  });

  const days = buildCalendar(monthKey).map(({ date, day }) => {
    // 그 달이 아닌 칸은 자리만 차지한다. 옆 달 날짜를 흐리게 보여주면 잘못 누르기 쉽다.
    if (!date) {
      const blank = document.createElement("span");
      blank.className = "calendar-cell is-blank";
      return blank;
    }

    const amount = totals[date] || 0;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-cell";
    cell.dataset.date = date;
    if (date === today) cell.classList.add("is-today");
    cell.setAttribute("aria-pressed", String(date === selected));
    cell.setAttribute(
      "aria-label",
      amount ? `${day}일 ${amount.toLocaleString("ko-KR")}원` : `${day}일 기록 없음`,
    );
    cell.innerHTML = `
      <span class="calendar-day">${day}</span>
      <span class="calendar-amount">${amount ? formatCompactMoney(amount) : ""}</span>
    `;
    return cell;
  });

  elements.calendar.replaceChildren(...head, ...days);
}
