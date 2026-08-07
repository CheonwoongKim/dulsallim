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
 * 지금 향하는 것. 그림 아래에 글로 얹는다.
 *
 * 그림만으로는 "하나뿐인 지금 목표" 라는 뜻이 안 산다 — 하트도 체크도 이미 그림이다.
 * 사람마다 하나뿐이라 한 화면에 한 번만 나오고, 그래서 글이 자리를 차지해도 된다.
 *
 * 목록에만 붙인다. 자세히는 그 하나만 보는 자리라 "여럿 가운데 이것" 이라고 말할 까닭이
 * 없고, 얹으면 사진 아래가 가려지기만 한다.
 */
const 목표표 = `<span class="wish-goal-tag" aria-hidden="true">지금 목표</span>`;

/**
 * 그림 한 칸.
 *
 * 그림이 없으면 이름 첫 글자를 담은 사람 아바타 색으로 쥔다 — 새 색 체계를 들이지 않고,
 * 누가 담았는지가 색으로 먼저 읽힌다. 글자는 그림이 있어도 지우지 않고 밑에 깔아 둔다.
 * 남의 서버 그림이라 언제든 사라지는데, 그때 이 자리가 그대로 드러나야 한다.
 */
function shotMarkup(wish, { 목표 = false } = {}) {
  const letter = [...String(wish.name).trim()][0] ?? "";
  const image = safeHref(wish.imageUrl);
  return `<span class="wish-shot" style="--wish-tile: ${escapeHtml(getMemberColor(wish.createdBy))}" aria-hidden="true">${escapeHtml(letter)}${
    image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""
  }${wish.state === "achieved" ? 이룸표 : ""}${wish.state === "pursuing" ? 함께표 : ""}${
    목표 && wish.isGoal && wish.state !== "achieved" ? 목표표 : ""
  }</span>`;
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
 * 목록 한 칸. 그림뿐이다.
 *
 * 이름도 값도 안 적는다 — 두 칸으로 늘어놓으면 글자가 들어갈 자리가 손톱만 해서
 * 읽히지도 않으면서 그림을 잘라먹는다. 자세한 것은 눌러서 시트로 본다.
 *
 * 한동안 오른쪽 위에 ⋯ 를 얹었는데, 사진 위에 무엇을 얹으려면 대비를 위해 어두운 판을
 * 깔아야 하고 그 판이 격자에서 먼저 읽혔다. 손보는 일은 모두 자세히 시트로 내렸다.
 */
export function createWishTile(wish) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "wish-tile";
  tile.dataset.openWish = wish.id;
  tile.innerHTML = shotMarkup(wish, { 목표: true });
  /*
   * 이름은 글자로 엮지 않고 넣는다. innerHTML 을 지나면 태그가 될 수 있는데,
   * setAttribute 로 넘기면 브라우저가 글자로만 다룬다.
   */
  tile.setAttribute(
    "aria-label",
    `${wish.name}${wish.isGoal ? " · 지금 목표" : ""}${
      wish.state === "pursuing" ? " · 함께 바라는 것" : ""
    } 자세히 보기`,
  );
  return 그림이깨지면걷어내기(tile);
}

/**
 * 글자 없이 그림만 두는 자리들. 이름은 aria-label 로 낸다.
 *
 * 큰 단추가 하나뿐이라야 무엇을 하러 연 시트인지가 흐려지지 않는다 — 글자 단추가 넷이면
 * 다 같은 무게로 읽힌다.
 */
const 도구그림 = {
  edit: `<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Zm10-13 4 4"/>`,
  // 책갈피. 지금 목표면 안이 채워지고, 아니면 테두리만 남는다.
  mark: `<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z"/>`,
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

  /*
   * 그림이 곧 링크다. 옆에 작은 단추를 세워 두던 때는 그 단추가 무엇으로 가는 문인지 그림과
   * 떨어져 있었다. 물건 사진을 누르면 그 물건을 파는 곳으로 — 짐작대로 움직인다.
   *
   * 주소가 없으면 누를 것이 아니므로 <a> 를 안 만든다. 읽어 주는 이름은 "링크 열기" 뿐이다 —
   * 무엇의 링크인지는 시트 제목이 이미 말한다.
   */
  body.innerHTML = `
    ${
      href
        ? `<a class="wish-detail-shot" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="링크 열기">${shotMarkup(wish)}</a>`
        : `<div class="wish-detail-shot">${shotMarkup(wish)}</div>`
    }
    <p class="wish-detail-note">${wish.note ? escapeHtml(wish.note) : ""}</p>
    ${이룸 ? `<p class="wish-detail-by">${escapeHtml(`${formatAchievedOn(wish.achievedOn)} 이룸`)}</p>` : ""}
    ${
      이룸
        ? ""
        : `<div class="wish-detail-do">
             ${
               action === "goal"
                 ? `<button class="submit-button quiet wish-detail-square${wish.isGoal ? " is-on" : ""}" type="button" data-goal-wish="${escapeHtml(wish.id)}" aria-pressed="${wish.isGoal ? "true" : "false"}" aria-label="지금 목표">${도구(도구그림.mark)}</button>`
                 : ""
             }
             <button class="submit-button quiet wish-detail-square" type="button" data-edit-wish="${escapeHtml(wish.id)}" aria-label="고치기">${도구(도구그림.edit)}</button>
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
