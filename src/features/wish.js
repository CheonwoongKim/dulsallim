import { elements } from "../dom.js";
import { getMembers } from "../members.js";
import { formatAmountInput, isValidAmount, readAmount } from "../money.js";
import {
  achieveWish,
  addWish,
  agreeWish,
  getExpenses,
  getWishes,
  removeWish,
} from "../store.js";
import { safeHref } from "../ui/escape.js";
import { showPage } from "../ui/page.js";
import { hideSheet, showSheet } from "../ui/sheet.js";
import { closeOpenRow, resetSwipeState } from "../ui/swipe.js";
import { showToast } from "../ui/toast.js";
import {
  createAchievedRow,
  createExpenseChoice,
  createPursuingCard,
  createWishRow,
} from "../ui/wish-list.js";
import { getProfile } from "./auth.js";

/**
 * 사고 싶은 것을 적어 두고, 둘 다 좋다고 하면 "지금 향하는 것" 이 된다.
 *
 * 상태를 여기서 판정하지 않는다. 어떤 합의가 몇 개면 pursuing 인지는 서버가 정하고
 * (migration-wish.sql), 화면은 돌아온 state 를 그대로 읽어 세 자리에 나눠 놓을 뿐이다.
 * 두 폰이 같은 순간에 마지막 표를 던져도 어긋나지 않는 이유가 그것이다.
 */

/** 이룬 것으로 이을 지출을 고를 때, 목록에 올릴 최대 줄 수. 그보다 옛것은 시트에서 찾을 일이 없다. */
const CHOICE_LIMIT = 40;

/** 이룸 시트가 어느 위시를 위해 열렸나. 닫으면 비운다. */
let achievingWishId = null;

const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

/** 내가 이미 찬성했는지. 올린 것도 첫 찬성으로 세므로 내가 올린 것에는 "나도" 가 안 뜬다. */
const iAgreed = (wish) => wish.agreementUserIds.includes(getProfile()?.id);

/** 아직 안 누른 사람들. 부부라 보통 한 명이지만 사람 수를 굳히지 않는다. */
function waitingFor(wish) {
  const names = getMembers()
    .filter((member) => !wish.agreementUserIds.includes(member.id))
    .map((member) => member.name);
  return names.length ? `${names.join(" · ")} 기다리는 중` : "곧 향합니다";
}

function paintPursuing(wishes) {
  const pursuing = wishes.find((wish) => wish.state === "pursuing");
  elements.wishPursuing.hidden = !pursuing;
  elements.wishPursuing.replaceChildren(...(pursuing ? [createPursuingCard(pursuing)] : []));
}

function paintProposed(wishes) {
  // 올린 순으로 — 새로 담은 것이 위에 온다. 서버도 created_at 내림차순으로 준다.
  const proposed = wishes.filter((wish) => wish.state === "proposed").sort(byNewest);
  elements.wishCount.textContent = proposed.length ? `(${proposed.length})` : "";

  if (!proposed.length) {
    elements.wishList.innerHTML = `
      <p class="wish-empty">아직 담아 둔 것이 없어요.<br />둘이 사고 싶은 것을 먼저 적어 두면 아끼는 이유가 생겨요.</p>
    `;
    return;
  }

  // 다시 그리면 열려 있던 행의 DOM 이 사라진다. 참조를 먼저 버려야 다음 스와이프가 엉키지 않는다.
  resetSwipeState();
  elements.wishList.replaceChildren(
    ...proposed.map((wish) =>
      createWishRow(wish, { canAgree: !iAgreed(wish), waiting: waitingFor(wish) }),
    ),
  );
}

function paintAchieved(wishes) {
  // 이룬 순으로. 날짜가 같으면 나중에 적힌 것이 위다.
  const achieved = wishes
    .filter((wish) => wish.state === "achieved")
    .sort((a, b) => String(b.achievedOn).localeCompare(String(a.achievedOn)) || byNewest(a, b));
  elements.wishAchievedSection.hidden = !achieved.length;
  elements.wishAchieved.replaceChildren(...achieved.map(createAchievedRow));
}

/** 화면에 있는 것을 지금 사본으로 맞춘다. 상대가 바꿔도 render() 를 거쳐 여기로 온다. */
export function paintWishPage() {
  const wishes = getWishes();
  paintPursuing(wishes);
  paintProposed(wishes);
  paintAchieved(wishes);
}

export function openWishPage() {
  paintWishPage();
  showPage(elements.wishPage);
}

/* ── 담기 ─────────────────────────────────────────────────── */

export function openWishSheet() {
  elements.wishForm.reset();
  elements.wishNameError.textContent = "";
  elements.wishUrlError.textContent = "";
  elements.wishPriceError.textContent = "";
  showSheet(elements.wishSheet);
  // 시트가 다 올라온 뒤에 손이 가야 한다. 올라오는 중에 키보드가 뜨면 두 움직임이 겹친다.
  setTimeout(() => elements.wishName.focus(), 60);
}

export function closeWishSheet() {
  hideSheet(elements.wishSheet);
}

/** 금액 칸은 지출 폼과 같은 규칙을 쓴다. 콤마도 상한도 한 곳(money.js)에서 온다. */
export function handleWishPriceInput(event) {
  event.target.value = formatAmountInput(event.target.value);
  elements.wishPriceError.textContent = "";
}

/** @returns {HTMLElement|null} 처음 잘못된 칸. 없으면 null */
function validateWishInput({ name, url, price }) {
  let firstInvalidField = null;

  elements.wishNameError.textContent = "";
  elements.wishUrlError.textContent = "";
  elements.wishPriceError.textContent = "";

  if (!name) {
    elements.wishNameError.textContent = "무엇을 담을지 적어 주세요.";
    firstInvalidField = elements.wishName;
  }
  // 비워 두는 것은 괜찮다. 적었는데 열 수 없는 주소일 때만 막는다.
  if (url && !safeHref(url)) {
    elements.wishUrlError.textContent = "http:// 나 https:// 로 시작하는 주소를 넣어 주세요.";
    firstInvalidField = firstInvalidField || elements.wishUrl;
  }
  if (price && !isValidAmount(price)) {
    elements.wishPriceError.textContent = "1원 이상의 금액을 넣거나 비워 주세요.";
    firstInvalidField = firstInvalidField || elements.wishPrice;
  }
  return firstInvalidField;
}

export async function handleWishSubmit(event) {
  event.preventDefault();
  const data = new FormData(elements.wishForm);
  const input = {
    name: String(data.get("name") || "").trim(),
    url: String(data.get("url") || "").trim(),
    price: readAmount(data.get("price")),
  };

  const firstInvalidField = validateWishInput(input);
  if (firstInvalidField) {
    firstInvalidField.focus();
    return;
  }

  elements.wishSubmit.disabled = true;
  try {
    await addWish({
      name: input.name,
      // 주소는 통과한 것만, 그것도 정규화된 형태로 보낸다.
      url: input.url ? safeHref(input.url) : null,
      estimatedPrice: input.price || null,
    });
  } catch (error) {
    showToast(error.message);
    return;
  } finally {
    elements.wishSubmit.disabled = false;
  }

  closeWishSheet();
  paintWishPage();
  showToast("위시를 담았어요");
}

/* ── 합의 · 지우기 ────────────────────────────────────────── */

export async function agreeOnWish(id) {
  if (!getWishes().some((wish) => wish.id === id)) return;

  try {
    await agreeWish(id);
  } catch (error) {
    // 이미 다른 것을 향하고 있으면 서버가 요청 전체를 되돌린다. 그 까닭을 그대로 전한다.
    showToast(error.message);
    return;
  }
  paintWishPage();
}

export async function dropWish(id) {
  const wish = getWishes().find((current) => current.id === id);
  if (!wish) return;

  try {
    await removeWish(id);
  } catch (error) {
    showToast(error.message);
    return;
  }
  closeOpenRow();
  paintWishPage();
  showToast("위시를 지웠어요");
}

/* ── 이룸 ─────────────────────────────────────────────────── */

/**
 * 어느 지출로 이뤘는지 고르게 한다.
 *
 * 서버가 그 지출의 날짜를 위시에 복사해 둔다. 나중에 지출을 지워도 이룬 날짜는 남는다.
 */
export function openAchieveSheet(id) {
  const wish = getWishes().find((current) => current.id === id && current.state === "pursuing");
  if (!wish) return;

  achievingWishId = id;
  elements.wishAchieveEyebrow.textContent = wish.name;

  const choices = [...getExpenses()]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, CHOICE_LIMIT);

  if (!choices.length) {
    elements.wishExpenseList.innerHTML = `
      <p class="wish-empty">이을 지출이 아직 없어요.<br />먼저 산 것을 지출로 적어 주세요.</p>
    `;
  } else {
    elements.wishExpenseList.replaceChildren(...choices.map(createExpenseChoice));
  }
  showSheet(elements.wishAchieveSheet);
}

export function closeAchieveSheet() {
  hideSheet(elements.wishAchieveSheet, () => {
    achievingWishId = null;
  });
}

export async function pickAchievedExpense(expenseId) {
  if (!achievingWishId) return;

  const wishId = achievingWishId;
  try {
    await achieveWish(wishId, expenseId);
  } catch (error) {
    showToast(error.message);
    return;
  }
  closeAchieveSheet();
  paintWishPage();
  showToast("이룬 것으로 옮겼어요");
}
