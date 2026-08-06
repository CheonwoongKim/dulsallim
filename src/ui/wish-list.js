import { CATEGORIES, formatMoney, formatShortDate } from "../expenses.js";
import { getMemberColor, getMemberName } from "../members.js";
import { escapeHtml, safeHref } from "./escape.js";

/**
 * 위시 한 줄씩 그리는 일만 한다. 무엇을 눌렀을 때 무엇을 할지는 features/wish.js 가 안다.
 *
 * 서버가 준 값은 전부 escapeHtml 을 지나간다. 주소만 예외가 아니라 한 겹 더 받는다 —
 * safeHref 가 http·https 가 아닌 것을 먼저 버린다.
 */

/** 이름 다음 줄. 어림 가격은 있을 때만 자리를 갖는다. */
function metaLine(wish) {
  return [
    wish.estimatedPrice ? `어림 ${formatMoney(wish.estimatedPrice)}원` : null,
    `${getMemberName(wish.createdBy)} 올림`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 어디로 가는 링크인지 미리 보여 준다.
 *
 * "링크 열기" 는 어느 줄에서나 같은 말이라 줄끼리 구별이 안 된다. 도메인을 쓰면
 * 누르기 전에 어디서 담아 온 것인지 읽힌다. `www.` 는 어느 주소에나 붙는 군더더기라 뗀다.
 */
export function domainOf(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    // safeHref 를 지나온 값이라 여기 올 일이 없지만, 오면 링크 구실은 하게 둔다.
    return "링크 열기";
  }
}

/** 열 수 없는 주소는 글자로도 내보내지 않는다. 눌러도 아무 일이 없으면 링크가 아니다. */
function linkMarkup(wish) {
  const href = safeHref(wish.url);
  if (!href) return "";
  return `<a class="wish-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(domainOf(href))}</a>`;
}

/**
 * 줄 왼쪽에 서는 타일. 이름 첫 글자를 담은 사람 색으로 쥔다.
 *
 * 위시는 "갖고 싶은 것" 이라 글자만 있으면 지출 목록과 구별이 안 된다. 색 한 칸이
 * 그 줄을 물건으로 만든다. 색을 따로 만들지 않고 그 사람 아바타 색을 그대로 쓴다 —
 * 누가 담았는지가 색으로 먼저 읽히고, 새 색 체계를 하나 더 들이지 않는다.
 *
 * 나중에 링크에서 그림을 가져오면 이 자리에 그림이 들어가고, 그림이 없거나 깨진
 * 줄은 이 타일로 돌아온다. 그래서 이건 임시가 아니라 바닥이다.
 */
function thumbMarkup(wish) {
  const letter = [...String(wish.name).trim()][0] ?? "";
  return `<span class="wish-thumb" style="--wish-tile: ${escapeHtml(getMemberColor(wish.createdBy))}" aria-hidden="true">${escapeHtml(letter)}</span>`;
}

/** `2026-03-14` → `2026.03.14`. 이룬 것에는 날짜만 남는다. */
export function formatAchievedOn(dateKey) {
  return String(dateKey ?? "").replaceAll("-", ".");
}

/** 맨 위에 따로 서는 한 장. 집마다 하나뿐이라 목록이 아니라 카드다. */
export function createPursuingCard(wish) {
  const card = document.createElement("article");
  card.className = "wish-card";
  card.innerHTML = `
    <p class="eyebrow">지금 향하는 것</p>
    <strong class="wish-card-name">${escapeHtml(wish.name)}</strong>
    <span class="wish-meta">${escapeHtml(metaLine(wish))}</span>
    <div class="wish-card-actions">
      ${linkMarkup(wish)}
      <button class="ghost-button" type="button" data-achieve-wish="${escapeHtml(wish.id)}">이뤘어요</button>
    </div>
  `;
  return card;
}

/**
 * 아직 향하지 않는 줄. 지출·고정비 목록과 같은 스와이프 행이다.
 * @param {{canAgree: boolean, waiting: string}} view 내가 누를 수 있는지와, 못 누를 때 대신 할 말
 */
export function createWishRow(wish, { canAgree, waiting }) {
  const row = document.createElement("article");
  row.className = "wish-item swipe-row";
  row.innerHTML = `
    <span class="swipe-actions">
      <button class="swipe-action is-delete" type="button" data-remove-wish="${escapeHtml(wish.id)}" aria-label="${escapeHtml(wish.name)} 지우기">지우기</button>
    </span>
    <div class="wish-surface swipe-surface">
      ${thumbMarkup(wish)}
      <div class="wish-copy">
        <strong>${escapeHtml(wish.name)}</strong>
        <span class="wish-meta">${escapeHtml(metaLine(wish))}</span>
        ${linkMarkup(wish)}
      </div>
      ${
        canAgree
          ? `<button class="wish-agree" type="button" data-agree-wish="${escapeHtml(wish.id)}" aria-label="${escapeHtml(wish.name)} 나도 좋아요">나도</button>`
          : `<span class="wish-waiting">${escapeHtml(waiting)}</span>`
      }
    </div>
  `;
  return row;
}

export function createAchievedRow(wish) {
  const row = document.createElement("p");
  row.className = "wish-achieved-row";
  row.innerHTML = `
    <span>${escapeHtml(wish.name)}</span>
    <time>${escapeHtml(formatAchievedOn(wish.achievedOn))}</time>
  `;
  return row;
}

/** 이룬 것으로 이을 지출 하나. 설정 메뉴와 같은 줄(.menu-row)을 쓴다. */
export function createExpenseChoice(expense) {
  const category = CATEGORIES[expense.category] || CATEGORIES.etc;
  const button = document.createElement("button");
  button.className = "menu-row";
  button.type = "button";
  button.dataset.pickExpense = expense.id;
  button.innerHTML = `
    <span>
      <strong>${escapeHtml(expense.item)}</strong>
      <small>${escapeHtml(formatShortDate(expense.date))} · ${escapeHtml(getMemberName(expense.member))} · ${category.label} · ${formatMoney(expense.amount)}원</small>
    </span>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
  `;
  return button;
}
