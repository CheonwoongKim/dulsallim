import { CATEGORIES, formatMoney, formatShortDate } from "../expenses.js";
import { getMemberColor, getMemberName } from "../members.js";
import { escapeHtml, safeHref } from "./escape.js";

/**
 * 위시 한 줄씩 그리는 일만 한다. 무엇을 눌렀을 때 무엇을 할지는 features/wish.js 가 안다.
 *
 * 서버가 준 값은 전부 escapeHtml 을 지나간다. 주소만 예외가 아니라 한 겹 더 받는다 —
 * safeHref 가 http·https 가 아닌 것을 먼저 버린다.
 */

const 이룸표 = `<span class="wish-done" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 13 4 4L19 7"/></svg></span>`;

/**
 * 둘 다 바라는 것에 얹는 표시.
 *
 * 목록은 담은 사람으로 갈리므로 이 칸은 담은 사람 자리에 그대로 있다. 다만 상대도 "나도" 를
 * 눌렀다는 것은 보여야 한다 — 그걸 모르면 왜 "이뤘어요" 를 서로 미루는지 알 수 없다.
 */
const 함께표 = `<span class="wish-together" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z"/></svg></span>`;

/**
 * 그림 한 칸.
 *
 * 그림이 없으면 이름 첫 글자를 담은 사람 아바타 색으로 쥔다 — 새 색 체계를 들이지 않고,
 * 누가 담았는지가 색으로 먼저 읽힌다. 글자는 그림이 있어도 지우지 않고 밑에 깔아 둔다.
 * 남의 서버 그림이라 언제든 사라지는데, 그때 이 자리가 그대로 드러나야 한다.
 */
function shotMarkup(wish) {
  const letter = [...String(wish.name).trim()][0] ?? "";
  const image = safeHref(wish.imageUrl);
  return `<span class="wish-shot" style="--wish-tile: ${escapeHtml(getMemberColor(wish.createdBy))}" aria-hidden="true">${escapeHtml(letter)}${
    image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""
  }${wish.state === "achieved" ? 이룸표 : ""}${wish.state === "pursuing" ? 함께표 : ""}</span>`;
}

/**
 * 그림이 안 오면 조용히 걷어 낸다.
 *
 * 남의 서버에 있는 그림이라 언제든 사라진다. 그대로 두면 브라우저가 깨진 그림 표시를
 * 그려 넣어 첫 글자보다 못한 자리가 된다. 지우면 밑에 깔린 글자가 그대로 드러난다.
 */
function 그림이깨지면걷어내기(요소) {
  const image = 요소.querySelector(".wish-shot img");
  if (image) image.addEventListener("error", () => image.remove(), { once: true });
  return 요소;
}

/** `2026-03-14` → `2026.03.14`. */
export function formatAchievedOn(dateKey) {
  return String(dateKey ?? "").replaceAll("-", ".");
}

/**
 * 목록 한 칸. 그림과 오른쪽 위 ⋯ 뿐이다.
 *
 * 이름도 값도 안 적는다 — 두 칸으로 늘어놓으면 글자가 들어갈 자리가 손톱만 해서
 * 읽히지도 않으면서 그림을 잘라먹는다. 자세한 것은 눌러서 시트로 본다.
 *
 * 칸을 단추 하나로 두지 않는다. 단추 안에 단추를 넣으면 안 되므로 감싸는 자리를 두고
 * 그림 단추와 ⋯ 단추를 나란히 놓는다. 이룬 것에는 ⋯ 를 안 붙인다 — 끝난 줄이다.
 */
export function createWishTile(wish) {
  const tile = document.createElement("div");
  tile.className = "wish-tile";
  tile.innerHTML = `
    <button class="wish-open" type="button" data-open-wish="${escapeHtml(wish.id)}">${shotMarkup(wish)}</button>
    ${
      wish.state === "achieved"
        ? ""
        : `<button class="wish-more" type="button" data-menu-wish="${escapeHtml(wish.id)}" aria-haspopup="dialog">${도구(도구그림.more)}</button>`
    }
  `;
  /*
   * 이름은 글자로 엮지 않고 넣는다. innerHTML 을 지나면 태그가 될 수 있는데,
   * setAttribute 로 넘기면 브라우저가 글자로만 다룬다.
   */
  tile.querySelector(".wish-open").setAttribute(
    "aria-label",
    `${wish.name}${wish.state === "pursuing" ? " · 함께 바라는 것" : ""} 자세히 보기`,
  );
  tile.querySelector(".wish-more")?.setAttribute("aria-label", `${wish.name} 더 보기`);
  return 그림이깨지면걷어내기(tile);
}

/**
 * 글자 없이 그림만 두는 자리들. 이름은 aria-label 로 낸다.
 *
 * 큰 단추가 하나뿐이라야 무엇을 하러 연 시트인지가 흐려지지 않는다 — 글자 단추가 넷이면
 * 다 같은 무게로 읽힌다.
 */
const 도구그림 = {
  link: `<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>`,
  // 점 셋. 이 앱은 점을 h.01 로 찍는다(목록 아이콘과 같은 방식).
  more: `<path d="M6 12h.01M12 12h.01M18 12h.01"/>`,
};

const 도구 = (그림) => `<svg viewBox="0 0 24 24" aria-hidden="true">${그림}</svg>`;

/**
 * 값 한 줄. 이름 바로 밑에 붙는다 — 얼마짜리인지가 무엇인지 다음으로 궁금하다.
 *
 * 시트 머리에 들어가므로 여기서는 글월만 만들고 넣는 것은 화면이 한다(textContent).
 * 글자로 엮지 않으니 태그가 될 일이 없다.
 */
export function wishPriceLine(wish) {
  return wish.estimatedPrice ? `${formatMoney(wish.estimatedPrice)}원` : "값을 안 적었어요";
}

/**
 * 링크. 이뤘어요 왼쪽에 작은 단추로 선다.
 *
 * 글자를 안 적는다 — "링크 열기" 라고 쓰면 옆의 이뤘어요와 같은 무게가 되어 무엇이 이 시트의
 * 일인지 흐려진다. 모양은 큰 단추와 같은 것에서 오고 색만 물러난다(.submit-button.quiet).
 * 이룬 것에는 이뤘어요가 없으니 이 단추가 줄을 다 쓴다.
 */
function 링크단추(href) {
  if (!href) return "";
  return `<a class="submit-button quiet wish-detail-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="링크 열기">${도구(도구그림.link)}</a>`;
}

/**
 * 눌렀을 때 뜨는 자세히. 목록이 그림만 남긴 만큼 여기가 다 말해야 한다.
 *
 * @param {{action: string, waiting: string}} view
 *   action 은 "agree" | "achieve" | "none"
 */
export function createWishDetail(wish, { action = "none" } = {}) {
  const body = document.createElement("div");
  body.className = "wish-detail";
  const href = safeHref(wish.url);
  const 이룸 = wish.state === "achieved";

  body.innerHTML = `
    ${shotMarkup(wish)}
    ${wish.note ? `<p class="wish-detail-note">${escapeHtml(wish.note)}</p>` : ""}
    ${이룸 ? `<p class="wish-detail-by">${escapeHtml(`${formatAchievedOn(wish.achievedOn)} 이룸`)}</p>` : ""}
    ${
      이룸
        ? 링크단추(href)
        : `<div class="wish-detail-do">
             ${링크단추(href)}
             <button class="submit-button" type="button" data-achieve-wish="${escapeHtml(wish.id)}">이뤘어요</button>
           </div>`
    }
    ${
      action === "agree"
        ? `<button class="submit-button quiet" type="button" data-agree-wish="${escapeHtml(wish.id)}">나도</button>`
        : ""
    }
  `;
  return 그림이깨지면걷어내기(body);
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
