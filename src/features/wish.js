import { elements } from "../dom.js";
import { getMembers } from "../members.js";
import { formatAmountInput, isValidAmount, readAmount } from "../money.js";
import {
  achieveWish,
  addWish,
  agreeWish,
  attachWishImage,
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

/** 화면 한 번 열 때 그림을 채워 볼 최대 개수. 한꺼번에 몰아 묻지 않는다. */
const BACKFILL_LIMIT = 5;

/** 이번에 켜져 있는 동안 그림을 찾아 본 위시. 못 찾은 것을 열 때마다 다시 묻지 않는다. */
const triedImage = new Set();

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
  void 빠진그림채우기();
}

/**
 * 담을 때 못 붙은 그림을 화면 열 때 채운다.
 *
 * 그림 찾기가 생기기 전에 담은 것, 그때 상대 서버가 안 받아 준 것이 여기 걸린다.
 * 하나씩 간다 — 한꺼번에 물으면 같은 서버에 몰린다. 한 번 찾아 본 것은 다시 묻지 않는다.
 */
async function 빠진그림채우기() {
  const 빠진것 = getWishes()
    .filter((wish) => wish.url && !wish.imageUrl && !triedImage.has(wish.id))
    .slice(0, BACKFILL_LIMIT);
  if (!빠진것.length) return;

  빠진것.forEach((wish) => triedImage.add(wish.id));
  for (const wish of 빠진것) {
    const image = await attachWishImage(wish.id, wish.url);
    // 그 사이에 다른 화면으로 갔을 수 있다. 열려 있을 때만 다시 그린다.
    if (image && !elements.wishPage.hidden) paintWishPage();
  }
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

  // 주소는 통과한 것만, 그것도 정규화된 형태로 보낸다.
  const href = input.url ? safeHref(input.url) : null;

  elements.wishSubmit.disabled = true;
  let created;
  try {
    created = await addWish({
      name: input.name,
      url: href,
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

  // 그림은 남의 사이트를 읽어 와야 해서 몇 초가 걸린다. 담기를 붙잡아 두지 않고 뒤따라 붙인다.
  if (href) void 그림얹기(created.id, href);
}

/**
 * 링크에서 찾은 대표 그림을 뒤늦게 얹는다.
 *
 * 못 찾아도 아무 말도 하지 않는다 — 그림 없는 링크가 흔하고, 그때는 첫 글자 타일이
 * 그대로 남는다. 담기는 이미 끝났으므로 여기서 실패해도 되돌릴 것이 없다.
 */
async function 그림얹기(id, href) {
  const image = await attachWishImage(id, href);
  // 그 사이에 다른 화면으로 갔을 수 있다. 열려 있을 때만 다시 그린다.
  if (image && !elements.wishPage.hidden) paintWishPage();
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
