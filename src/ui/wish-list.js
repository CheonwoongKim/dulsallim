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

const 이룸표 = `<span class="wish-done" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 13 4 4L19 7"/></svg></span>`;

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
  }${wish.state === "achieved" ? 이룸표 : ""}</span>`;
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

/** `2026-03-14` → `2026.03.14`. */
export function formatAchievedOn(dateKey) {
  return String(dateKey ?? "").replaceAll("-", ".");
}

/**
 * 목록 한 칸. 그림만 있다.
 *
 * 이름도 값도 안 적는다 — 두 칸으로 늘어놓으면 글자가 들어갈 자리가 손톱만 해서
 * 읽히지도 않으면서 그림을 잘라먹는다. 자세한 것은 눌러서 시트로 본다.
 */
export function createWishTile(wish) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "wish-tile";
  tile.dataset.openWish = wish.id;
  // 그림에는 글이 없으므로 읽어 주는 이름은 여기서 낸다.
  tile.setAttribute("aria-label", `${wish.name} 자세히 보기`);
  tile.innerHTML = shotMarkup(wish);
  return 그림이깨지면걷어내기(tile);
}

/**
 * 눌렀을 때 뜨는 자세히. 목록이 그림만 남긴 만큼 여기가 다 말해야 한다.
 *
 * @param {{action: string, waiting: string, context: object}} view
 *   action 은 "agree" | "achieve" | "none"
 */
export function createWishDetail(wish, { action = "none", waiting = "", context = {} } = {}) {
  const body = document.createElement("div");
  body.className = "wish-detail";
  const href = safeHref(wish.url);

  body.innerHTML = `
    ${shotMarkup(wish)}
    <p class="wish-detail-price">${wish.estimatedPrice ? `${formatMoney(wish.estimatedPrice)}원` : "값을 안 적었어요"}</p>
    ${wish.note ? `<p class="wish-detail-note">${escapeHtml(wish.note)}</p>` : ""}
    ${progressMarkup(wish, context)}
    <p class="wish-detail-by">${escapeHtml(byLine(wish))}</p>
    ${
      href
        ? `<a class="ghost-button wish-detail-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">링크 열기</a>`
        : ""
    }
    <div class="wish-detail-actions">
      ${액션(wish, action, waiting)}
      ${
        wish.state === "achieved"
          ? ""
          : `<button class="ghost-button" type="button" data-edit-wish="${escapeHtml(wish.id)}">고치기</button>
             <button class="ghost-button danger-text" type="button" data-remove-wish="${escapeHtml(wish.id)}">지우기</button>`
      }
    </div>
  `;
  return 그림이깨지면걷어내기(body);
}

/** 누가 담았고 언제 이뤘는지. */
function byLine(wish) {
  const 담은사람 = `${getMemberName(wish.createdBy)} 올림`;
  return wish.state === "achieved"
    ? `${담은사람} · ${formatAchievedOn(wish.achievedOn)} 이룸`
    : 담은사람;
}

/** 자리마다 다른 큰 단추. */
function 액션(wish, action, waiting) {
  if (action === "agree") {
    return `<button class="submit-button" type="button" data-agree-wish="${escapeHtml(wish.id)}">나도</button>`;
  }
  if (action === "achieve") {
    return `<button class="submit-button" type="button" data-achieve-wish="${escapeHtml(wish.id)}">이뤘어요</button>`;
  }
  return waiting ? `<p class="wish-waiting">${escapeHtml(waiting)}</p>` : "";
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
