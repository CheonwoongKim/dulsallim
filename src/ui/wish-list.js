import { CATEGORIES, formatMoney, formatShortDate } from "../expenses.js";
import { getMemberColor, getMemberName } from "../members.js";
import { escapeHtml, safeHref } from "./escape.js";

/**
 * 위시 한 줄씩 그리는 일만 한다. 무엇을 눌렀을 때 무엇을 할지는 features/wish.js 가 안다.
 *
 * 서버가 준 값은 전부 escapeHtml 을 지나간다. 주소만 예외가 아니라 한 겹 더 받는다 —
 * safeHref 가 http·https 가 아닌 것을 먼저 버린다.
 */

/**
 * 이름 다음 줄. 어림 가격은 있을 때만 자리를 갖는다.
 *
 * "어림" 도 "올림" 도 붙이지 않는다. 금액 뒤의 원과 가운뎃점 하나로 이미 갈리고,
 * 이 화면에서 사람 이름이 놓일 자리는 담은 사람뿐이라 굳이 말로 설명할 것이 없다.
 */
function metaLine(wish) {
  return [
    wish.estimatedPrice ? `${formatMoney(wish.estimatedPrice)}원` : null,
    getMemberName(wish.createdBy),
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
 * 카드 위쪽의 그림 자리.
 *
 * 위시는 "갖고 싶은 것" 이라 글자만 있으면 지출 목록과 구별이 안 된다. 그림이 먼저
 * 보여야 이 화면을 들여다보게 된다. 그림이 없으면 이름 첫 글자를 담은 사람 아바타
 * 색으로 쥔다 — 새 색 체계를 들이지 않고, 누가 담았는지가 색으로 먼저 읽힌다.
 *
 * 글자는 그림이 있어도 지우지 않고 밑에 깔아 둔다. 남의 서버 그림이라 언제든
 * 사라지는데, 그때 이 자리가 그대로 드러나야 한다.
 *
 * @param {string} 모양 정사각(카드)인지 가로로 넓은 띠(향하는 것)인지
 */
function shotMarkup(wish, 모양) {
  const letter = [...String(wish.name).trim()][0] ?? "";
  const image = safeHref(wish.imageUrl);
  return `<span class="wish-shot is-${모양}" style="--wish-tile: ${escapeHtml(getMemberColor(wish.createdBy))}" aria-hidden="true">${escapeHtml(letter)}${
    image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""
  }</span>`;
}

/** 있을 때만 자리를 갖는다. 없다고 빈 줄을 남기면 카드 높이가 들쭉날쭉해진다. */
function noteMarkup(wish) {
  const note = String(wish.note ?? "").trim();
  return note ? `<span class="wish-note">${escapeHtml(note)}</span>` : "";
}

/**
 * 그림이 안 오면 조용히 걷어 낸다.
 *
 * 남의 서버에 있는 그림이라 언제든 사라진다. 그대로 두면 브라우저가 깨진 그림 표시를
 * 그려 넣어 첫 글자보다 못한 자리가 된다. 지우면 밑에 깔린 글자가 그대로 드러난다.
 */
function 그림이깨지면걷어내기(row) {
  const image = row.querySelector(".wish-shot img");
  if (image) image.addEventListener("error", () => image.remove(), { once: true });
  return row;
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
    ${shotMarkup(wish, "wide")}
    <div class="wish-card-body">
      <p class="eyebrow">지금 향하는 것</p>
      <strong class="wish-card-name">${escapeHtml(wish.name)}</strong>
      <span class="wish-meta">${escapeHtml(metaLine(wish))}</span>
      ${noteMarkup(wish)}
      <div class="wish-card-actions">
        ${linkMarkup(wish)}
        <button class="ghost-button" type="button" data-achieve-wish="${escapeHtml(wish.id)}">이뤘어요</button>
      </div>
    </div>
  `;
  return 그림이깨지면걷어내기(card);
}

/**
 * 담아 둔 것 한 칸. 두 칸 격자에 놓인다.
 *
 * 한 줄에 하나씩. 그림이 먼저 보이고 글이 그 아래 붙는다.
 *
 * 지우기는 그림 위에 늘 떠 있던 × 에서 이름 옆 ⋯ 로 옮겼다. 지우기가 이 화면에서
 * 가장 눈에 띄는 것이 될 이유가 없다 — 여기는 갖고 싶은 것을 보는 곳이다.
 *
 * @param {{canAgree: boolean, waiting: string}} view 내가 누를 수 있는지와, 못 누를 때 대신 할 말
 */
export function createWishRow(wish, { canAgree, waiting }) {
  const card = document.createElement("article");
  card.className = "wish-item";
  card.innerHTML = `
    ${shotMarkup(wish, "photo")}
    <div class="wish-copy">
      <div class="wish-head">
        <strong>${escapeHtml(wish.name)}</strong>
        <button class="wish-more" type="button" data-wish-menu="${escapeHtml(wish.id)}" aria-label="${escapeHtml(wish.name)} 더 보기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
        </button>
      </div>
      <span class="wish-meta">${escapeHtml(metaLine(wish))}</span>
      ${noteMarkup(wish)}
      ${linkMarkup(wish)}
    </div>
    ${
      canAgree
        ? `<button class="wish-agree" type="button" data-agree-wish="${escapeHtml(wish.id)}" aria-label="${escapeHtml(wish.name)} 나도 좋아요">나도</button>`
        : `<span class="wish-waiting">${escapeHtml(waiting)}</span>`
    }
  `;
  return 그림이깨지면걷어내기(card);
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
