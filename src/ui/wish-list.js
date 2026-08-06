import { CATEGORIES, formatMoney, formatShortDate } from "../expenses.js";
import { getMemberColor, getMemberName } from "../members.js";
import { wishProgress } from "../wish-progress.js";
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

const 이룸표 = `<span class="wish-done" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 13 4 4L19 7"/></svg></span>`;

/**
 * 카드 왼쪽 절반을 차지하는 그림.
 *
 * 위시는 "갖고 싶은 것" 이라 그림이 먼저 보여야 이 화면을 들여다보게 된다. 그림이 없으면
 * 이름 첫 글자를 담은 사람 아바타 색으로 쥔다 — 새 색 체계를 들이지 않고, 누가 담았는지가
 * 색으로 먼저 읽힌다. 글자는 그림이 있어도 지우지 않고 밑에 깔아 둔다. 남의 서버 그림이라
 * 언제든 사라지는데, 그때 이 자리가 그대로 드러나야 한다.
 *
 * 링크가 있으면 이 자리가 곧 링크다. 주소를 글자로 또 적지 않는다 — 카드 오른쪽이 좁아
 * 도메인 한 줄이 이름이나 한마디를 밀어낸다.
 */
function shotMarkup(wish) {
  const letter = [...String(wish.name).trim()][0] ?? "";
  const image = safeHref(wish.imageUrl);
  const href = safeHref(wish.url);
  const 속 = `${escapeHtml(letter)}${
    image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""
  }${wish.state === "achieved" ? 이룸표 : ""}`;
  const 색 = `style="--wish-tile: ${escapeHtml(getMemberColor(wish.createdBy))}"`;

  return href
    ? `<a class="wish-shot" ${색} href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(wish.name)} 링크 열기">${속}</a>`
    : `<span class="wish-shot" ${색} aria-hidden="true">${속}</span>`;
}

/**
 * 그림이 안 오면 조용히 걷어 낸다.
 *
 * 남의 서버에 있는 그림이라 언제든 사라진다. 그대로 두면 브라우저가 깨진 그림 표시를
 * 그려 넣어 첫 글자보다 못한 자리가 된다. 지우면 밑에 깔린 글자가 그대로 드러난다.
 */
function 그림이깨지면걷어내기(card) {
  const image = card.querySelector(".wish-shot img");
  if (image) image.addEventListener("error", () => image.remove(), { once: true });
  return card;
}

/**
 * 얼마나 다가갔나. 값을 안 적었거나 이미 이룬 것에는 안 그린다.
 *
 * 아낀 돈은 목표를 넘겨도 그대로 알려 주고(모은 건 모은 것이다) 막대만 가득에서 멈춘다.
 * 목표를 안 정한 사람이 끼어 있으면 그 몫이 통째로 빠지므로 그 까닭을 함께 적는다.
 */
function progressMarkup(wish, context) {
  if (wish.state === "achieved") return "";
  const { saved, target, ratio, missingGoal } = wishProgress(wish, context);
  if (!target) return "";

  const percent = Math.round(ratio * 100);
  return `
    <div class="wish-progress">
      <div class="wish-progress-bar"><i style="width: ${percent}%"></i></div>
      <span class="wish-progress-text">
        <b>${formatMoney(saved)}원</b> 모음 · ${percent}%${missingGoal ? " · 월 지출 목표를 정하면 더 정확해요" : ""}
      </span>
    </div>
  `;
}

/** 있을 때만 자리를 갖는다. 없다고 빈 줄을 남기면 카드 높이가 들쭉날쭉해진다. */
function noteMarkup(wish) {
  const note = String(wish.note ?? "").trim();
  return note ? `<span class="wish-note">${escapeHtml(note)}</span>` : "";
}

/** `2026-03-14` → `2026.03.14`. 이룬 것에는 날짜가 남는다. */
export function formatAchievedOn(dateKey) {
  return String(dateKey ?? "").replaceAll("-", ".");
}

/**
 * 위시 한 칸. 왼쪽 절반이 그림, 오른쪽이 글이다.
 *
 * 세 자리(함께 바라는 것 · 담아 둔 것 · 이룬 것)가 같은 카드를 쓴다. 무엇인지는 바깥
 * 이름표가 이미 말하므로 카드 안에서 또 말하지 않고, 자리마다 다른 것은 맨 아래 단추뿐이다.
 *
 * @param {{action: string, waiting: string, context: object}} view
 *   action 은 "agree" | "achieve" | "none"
 */
export function createWishCard(wish, { action = "none", waiting = "", context = {} } = {}) {
  const card = document.createElement("article");
  card.className = "wish-item";
  card.innerHTML = `
    ${shotMarkup(wish)}
    <div class="wish-copy">
      <div class="wish-head">
        <strong>${escapeHtml(wish.name)}</strong>
        ${
          wish.state === "achieved"
            ? ""
            : `<button class="wish-more" type="button" data-wish-menu="${escapeHtml(wish.id)}" aria-label="${escapeHtml(wish.name)} 더 보기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
        </button>`
        }
      </div>
      <span class="wish-meta">${escapeHtml(metaLine(wish))}</span>
      ${noteMarkup(wish)}
      ${progressMarkup(wish, context)}
      ${
        wish.state === "achieved"
          ? `<span class="wish-meta">${escapeHtml(formatAchievedOn(wish.achievedOn))} 이룸</span>`
          : ""
      }
      ${액션(wish, action, waiting)}
    </div>
  `;
  return 그림이깨지면걷어내기(card);
}

/** 자리마다 다른 맨 아래 한 줄. */
function 액션(wish, action, waiting) {
  if (action === "agree") {
    return `<button class="wish-agree" type="button" data-agree-wish="${escapeHtml(wish.id)}" aria-label="${escapeHtml(wish.name)} 나도 좋아요">나도</button>`;
  }
  if (action === "achieve") {
    return `<button class="wish-agree is-quiet" type="button" data-achieve-wish="${escapeHtml(wish.id)}">이뤘어요</button>`;
  }
  return waiting ? `<span class="wish-waiting">${escapeHtml(waiting)}</span>` : "";
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
