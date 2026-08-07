import { elements } from "../dom.js";
import { getMembers } from "../members.js";
import { formatAmountInput, isValidAmount, readAmount } from "../money.js";
import {
  achieveWish,
  addWish,
  agreeWish,
  attachWishImage,
  editWish,
  getExpenses,
  getWishes,
  moveWish,
  removeWish,
} from "../store.js";
import { safeHref } from "../ui/escape.js";
import { showPage } from "../ui/page.js";
import { hideSheet, showSheet } from "../ui/sheet.js";
import { showToast } from "../ui/toast.js";
import { paintMemberTabs } from "../ui/member-tabs.js";
import { createExpenseChoice, createWishDetail, createWishTile } from "../ui/wish-list.js";
import { getProfile } from "./auth.js";

/**
 * 사고 싶은 것을 적어 두고, 상대도 "나도" 를 누르면 "함께 바라는 것" 이 된다.
 *
 * 상태를 여기서 판정하지 않는다. 어떤 합의가 몇 개면 pursuing 인지는 서버가 정하고
 * (migration-wish.sql), 화면은 돌아온 state 를 그대로 읽어 세 자리에 나눠 놓을 뿐이다.
 * 두 폰이 같은 순간에 마지막 표를 던져도 어긋나지 않는 이유가 그것이다.
 */

/** 이룬 것으로 이을 지출을 고를 때, 목록에 올릴 최대 줄 수. 그보다 옛것은 시트에서 찾을 일이 없다. */
const CHOICE_LIMIT = 40;

/** 메뉴를 닫고 다음 시트를 올리기까지 기다리는 시간. 시트 닫히는 연출과 맞춘다. */
const MENU_HANDOFF_MS = 220;

/** 한마디에 적을 수 있는 길이. DB 의 check 와 시트 칸의 maxlength 가 같은 값을 쓴다. */
const NOTE_LIMIT = 100;

/** 화면 한 번 열 때 그림을 채워 볼 최대 개수. 한꺼번에 몰아 묻지 않는다. */
const BACKFILL_LIMIT = 5;

/** 이번에 켜져 있는 동안 그림을 찾아 본 위시. 못 찾은 것을 열 때마다 다시 묻지 않는다. */
const triedImage = new Set();

/** 이룸 시트가 어느 위시를 위해 열렸나. 닫으면 비운다. */
let achievingWishId = null;

/** 지우기를 묻는 시트가 어느 위시를 위해 열렸나. 닫으면 비운다. */
let droppingWishId = null;

/** 자세히 시트가 어느 위시를 열고 있나. 닫으면 비운다. */
let detailWishId = null;

/** 담기 시트가 고치는 중이면 그 위시. 새로 담는 중이면 null. */
let editingWishId = null;

const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

/**
 * 지금 누구의 목록을 보는 중인가. null 이면 아직 안 정한 것이고, 처음 그릴 때 나로 잡는다.
 *
 * 달성 여부로 가르던 탭을 사람으로 바꿨다. 위시는 각자가 담는 것이고, 둘이 서로 무엇을
 * 바라는지 보는 것이 이 화면의 일이다. 이룬 것은 목록에서 뺀다 — 바라는 자리다.
 */
let wishTab = null;

export function setWishTab(memberId) {
  wishTab = memberId || null;
  paintWishPage();
}

/** 내가 이미 찬성했는지. 올린 것도 첫 찬성으로 세므로 내가 올린 것에는 "나도" 가 안 뜬다. */
const iAgreed = (wish) => wish.agreementUserIds.includes(getProfile()?.id);

/** 아직 안 누른 사람들. 부부라 보통 한 명이지만 사람 수를 굳히지 않는다. */
function waitingFor(wish) {
  const names = getMembers()
    .filter((member) => !wish.agreementUserIds.includes(member.id))
    .map((member) => member.name);
  return names.length ? `${names.join(" · ")} 기다리는 중` : "곧 함께 바랍니다";
}

/**
 * 사람 하나의 목록을 그린다. 우선순위가 높은 것이 위다.
 *
 * 이룬 것은 안 그린다. 여기는 앞으로 바라는 자리고, 이룬 것은 그 지출에 이미 남아 있다.
 * 둘 다 "나도" 를 누른 것(pursuing)은 담은 사람 자리에 그대로 두고 표시만 얹는다 —
 * 누구의 바람이었는지가 지워지면 각자의 목록이라는 뜻이 흐려진다.
 */
export function paintWishPage() {
  // 열려 있는 자세히도 같은 사본을 봐야 한다. 상대가 바꾼 것이 여기서 들어온다.
  if (!elements.wishDetailSheet.hidden) paintWishDetail();

  const 사람들 = getMembers();
  // 처음 열면 내 목록부터. 명부가 아직 안 왔으면 첫 사람으로 버틴다.
  if (!wishTab || !사람들.some((member) => member.id === wishTab)) {
    wishTab = getProfile()?.id ?? 사람들[0]?.id ?? null;
  }

  paintMemberTabs(elements.wishTabs, wishTab, { 전체: false });

  const 목록 = getWishes()
    .filter((wish) => wish.createdBy === wishTab && wish.state !== "achieved")
    .sort(byPriority);

  elements.wishCount.textContent = 목록.length ? `(${목록.length})` : "";
  if (목록.length) {
    elements.wishList.replaceChildren(...목록.map(createWishTile));
  } else {
    const 나인가 = wishTab === getProfile()?.id;
    elements.wishList.innerHTML = 나인가
      ? `<p class="wish-empty">아직 담아 둔 것이 없어요.<br />사고 싶은 것을 적어 두면 아끼는 이유가 생겨요.</p>`
      : `<p class="wish-empty">아직 담아 둔 것이 없어요.</p>`;
  }
}

/**
 * 우선순위가 높은(작은) 것이 위. 같으면 나중에 담은 것이 위다.
 *
 * 자리 값이 같을 수 있어서 두 번째 잣대가 있어야 차례가 흔들리지 않는다.
 * 서버의 move_wish 도 (sort_order, id) 로 이웃을 찾는다 — 두 곳이 같은 규칙을 쓴다.
 */
const byPriority = (a, b) => a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id));

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

/**
 * 담기 시트를 고치기에도 쓴다.
 *
 * 적는 칸이 똑같아서 시트를 하나 더 만들 이유가 없다. 말만 바꾸고 값을 채워 둔다.
 * 무엇을 고치는 중인지는 editingWishId 하나로 안다 — 닫을 때 반드시 비운다.
 */
export function openWishEditSheet(id) {
  const wish = getWishes().find((current) => current.id === id);
  if (!wish) return;

  openWishSheet();
  editingWishId = id;
  elements.wishSheetTitle.textContent = "무엇을 고칠까요?";
  elements.wishSubmitLabel.textContent = "저장";
  elements.wishName.value = wish.name;
  elements.wishUrl.value = wish.url ?? "";
  elements.wishPrice.value = wish.estimatedPrice ? formatAmountInput(String(wish.estimatedPrice)) : "";
  elements.wishNote.value = wish.note ?? "";
}

/** 네 칸의 잘못 표시를 한꺼번에 지운다. 시트를 열 때와 다시 볼 때가 같은 곳을 쓴다. */
function 잘못표시지우기() {
  elements.wishNameError.textContent = "";
  elements.wishUrlError.textContent = "";
  elements.wishPriceError.textContent = "";
  elements.wishNoteError.textContent = "";
}

export function openWishSheet() {
  editingWishId = null;
  elements.wishSheetTitle.textContent = "무엇을 담을까요?";
  elements.wishSubmitLabel.textContent = "담기";
  elements.wishForm.reset();
  잘못표시지우기();
  showSheet(elements.wishSheet);
  // 시트가 다 올라온 뒤에 손이 가야 한다. 올라오는 중에 키보드가 뜨면 두 움직임이 겹친다.
  setTimeout(() => elements.wishName.focus(), 60);
}

export function closeWishSheet() {
  hideSheet(elements.wishSheet, () => {
    editingWishId = null;
  });
}

/** 금액 칸은 지출 폼과 같은 규칙을 쓴다. 콤마도 상한도 한 곳(money.js)에서 온다. */
export function handleWishPriceInput(event) {
  event.target.value = formatAmountInput(event.target.value);
  elements.wishPriceError.textContent = "";
}

/** @returns {HTMLElement|null} 처음 잘못된 칸. 없으면 null */
function validateWishInput({ name, url, price, note }) {
  let firstInvalidField = null;
  잘못표시지우기();

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
  /*
   * 칸의 maxlength 로도 막히지만 여기서 다시 센다. 붙여넣기는 그 제한을 넘길 수 있고,
   * DB 의 check 에 걸리면 "위시 저장에 실패했어요" 라는 말만 남아 무엇이 문제인지 모른다.
   */
  if (note.length > NOTE_LIMIT) {
    elements.wishNoteError.textContent = `${NOTE_LIMIT}자까지 적을 수 있어요.`;
    firstInvalidField = firstInvalidField || elements.wishNote;
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
    note: String(data.get("note") || "").trim(),
  };

  const firstInvalidField = validateWishInput(input);
  if (firstInvalidField) {
    firstInvalidField.focus();
    return;
  }

  // 주소는 통과한 것만, 그것도 정규화된 형태로 보낸다.
  const href = input.url ? safeHref(input.url) : null;

  const 고치는중 = editingWishId;
  const 값 = {
    name: input.name,
    url: href,
    estimatedPrice: input.price || null,
    note: input.note || null,
  };

  elements.wishSubmit.disabled = true;
  let saved;
  try {
    saved = 고치는중 ? await editWish(고치는중, 값) : await addWish(값);
  } catch (error) {
    showToast(error.message);
    return;
  } finally {
    elements.wishSubmit.disabled = false;
  }

  closeWishSheet();
  paintWishPage();
  showToast(고치는중 ? "고쳤어요" : "위시를 담았어요");

  /*
   * 그림은 남의 사이트를 읽어 와야 해서 몇 초가 걸린다. 담기를 붙잡아 두지 않고 뒤따라 붙인다.
   * 고칠 때는 링크가 그대로면 서버가 그림도 그대로 두므로, 비어 있을 때만 찾는다.
   *
   * 붙고 나면 다시 그린다. 목록은 담자마자 한 번 그려졌으니, 그때 없던 그림은 여기서
   * 다시 그리지 않으면 화면을 나갔다 들어와야 보인다 — 빠진그림채우기 도 같은 줄을 쓴다.
   */
  if (href && !saved.imageUrl) {
    void attachWishImage(saved.id, href).then((image) => {
      if (image && !elements.wishPage.hidden) paintWishPage();
    });
  }
}

/* ── 자세히 ───────────────────────────────────────────────── */

/**
 * 목록이 그림만 남긴 만큼 여기가 다 말한다.
 *
 * 열려 있는 동안 상대가 바꾸면 다시 그린다 — 진척은 지출이 들어올 때마다 달라지고,
 * 상대가 "나도" 를 누르면 단추도 바뀌어야 한다.
 */
export function openWishDetail(id) {
  detailWishId = id;
  paintWishDetail();
  showSheet(elements.wishDetailSheet);
}

function paintWishDetail() {
  const wish = getWishes().find((current) => current.id === detailWishId);
  if (!wish) {
    closeWishDetail();
    return;
  }

  elements.wishDetailState.textContent = 자리이름(wish);
  elements.wishDetailName.textContent = wish.name;
  elements.wishDetailBody.replaceChildren(
    createWishDetail(wish, {
      action: 무엇을할수있나(wish),
      waiting: wish.state === "proposed" ? waitingFor(wish) : "",
    }),
  );
}

/** 세 자리 가운데 어디에 있는지. 목록에서는 이름표가 말해 주지만 시트에는 그것이 없다. */
function 자리이름(wish) {
  if (wish.state === "achieved") return "이룬 것";
  return wish.state === "pursuing" ? "함께 바라는 것" : "담아 둔 것";
}

function 무엇을할수있나(wish) {
  /*
   * 이룸은 안 이룬 것이면 언제든 누를 수 있다(서버도 state <> 'achieved' 로 본다).
   * 상대의 "나도" 는 함께 바라는 것으로 올라가는 조건이지, 내가 산 것을 산 것으로
   * 적는 조건이 아니다 — 혼자 담아 둔 것을 사고도 이룸으로 넘길 길이 없었다.
   *
   * 그래서 여기서 정하는 것은 "나도" 를 곁들일지뿐이다.
   */
  return wish.state === "proposed" && !iAgreed(wish) ? "agree" : "none";
}

export function closeWishDetail() {
  hideSheet(elements.wishDetailSheet, () => {
    detailWishId = null;
  });
}

/* ── 칸의 ⋯ 메뉴 ──────────────────────────────────────────── */

/** ⋯ 메뉴가 어느 위시를 위해 열렸나. 닫으면 비운다. */
let menuWishId = null;

/**
 * 칸 오른쪽 위 ⋯ 가 여는 메뉴.
 *
 * 고치기·지우기를 자세히 시트에서 여기로 옮겼다. 자세히는 무엇을 담았는지 보고 이룸을
 * 누르는 자리고, 손보는 일은 목록에서 바로 하는 편이 걸음이 짧다.
 *
 * 이룬 것에는 ⋯ 를 안 붙이므로 여기도 안 이룬 것만 받는다.
 */
export function openWishMenu(id) {
  const wish = getWishes().find((current) => current.id === id && current.state !== "achieved");
  if (!wish) return;

  menuWishId = id;
  elements.wishMenuName.textContent = wish.name;
  /*
   * 자리 옮기기는 내가 담은 것에만 낸다. 남의 목록 순서는 그 사람이 정한다 —
   * 서버도 created_by 로 막으므로 안 감추면 눌러 놓고 잘못만 보게 된다.
   */
  const 내것 = wish.createdBy === getProfile()?.id;
  for (const 줄 of [elements.wishMenuTop, elements.wishMenuUp, elements.wishMenuDown]) {
    줄.hidden = !내것;
  }
  맨끝인가맞추기();
  showSheet(elements.wishMenuSheet);
}

/** 맨 위면 위로·맨 위로가, 맨 아래면 아래로가 할 일이 없다. 눌리지 않게 둔다. */
function 맨끝인가맞추기() {
  const 목록 = getWishes()
    .filter((wish) => wish.createdBy === getProfile()?.id && wish.state !== "achieved")
    .sort(byPriority);
  const 자리 = 목록.findIndex((wish) => wish.id === menuWishId);
  if (자리 < 0) return;
  elements.wishMenuTop.disabled = 자리 === 0;
  elements.wishMenuUp.disabled = 자리 === 0;
  elements.wishMenuDown.disabled = 자리 === 목록.length - 1;
}

export function closeWishMenu() {
  hideSheet(elements.wishMenuSheet, () => {
    menuWishId = null;
  });
}

/*
 * 메뉴를 먼저 닫고 다음 시트를 올린다. 겹쳐 뜨면 뒤엣것이 먼저 잡혀 끌어 닫기가 엉킨다.
 * 무엇을 고르는지는 닫기 전에 붙잡아 둔다 — 닫는 사이에 menuWishId 가 비워진다.
 */
/**
 * 자리를 옮긴다. 메뉴는 열어 둔 채로 둔다 — 여러 칸 올릴 때 매번 다시 열게 하지 않는다.
 *
 * 내가 담은 것만 옮길 수 있다. 서버도 created_by 로 막는다 — 각자의 목록이고
 * 순서는 담은 사람이 정한다.
 */
export async function moveFromMenu(어디로) {
  if (!menuWishId) return;
  try {
    await moveWish(menuWishId, 어디로);
  } catch (error) {
    showToast(error.message);
    return;
  }
  paintWishPage();
  맨끝인가맞추기();
}

export function editFromMenu() {
  const id = menuWishId;
  closeWishMenu();
  if (id) setTimeout(() => openWishEditSheet(id), MENU_HANDOFF_MS);
}

export function dropFromMenu() {
  const id = menuWishId;
  closeWishMenu();
  if (id) setTimeout(() => askDropWish(id), MENU_HANDOFF_MS);
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

/**
 * 지우기 전에 한 번 묻는다.
 *
 * ⋯ 메뉴에서 고르는 것만으로는 부족하다. 메뉴는 그림 위 작은 단추에서 열리고 두 줄이
 * 나란히 있어 손이 미끄러질 수 있는데, 지운 위시는 되돌릴 길이 없다.
 */
export function askDropWish(id) {
  const wish = getWishes().find((current) => current.id === id);
  if (!wish) return;

  droppingWishId = id;
  elements.wishDropName.textContent = wish.name;
  showSheet(elements.wishDropSheet);
}

export function closeDropSheet() {
  hideSheet(elements.wishDropSheet, () => {
    droppingWishId = null;
  });
}

export async function dropWish() {
  if (!droppingWishId) return;

  const id = droppingWishId;
  try {
    await removeWish(id);
  } catch (error) {
    showToast(error.message);
    return;
  }
  closeDropSheet();
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
  // 아직 안 이룬 것이면 된다. 서버도 같은 조건으로 본다(migration-wish-achieve-alone.sql).
  const wish = getWishes().find((current) => current.id === id && current.state !== "achieved");
  if (!wish) return;

  /*
   * 자세히를 먼저 닫는다. 그대로 두면 시트가 두 장 열린 채가 되는데, 닫는 길
   * (closeActiveSheet)은 열린 것을 모두 닫는다 — 지출을 고르다 뒤로 가면 자세히까지
   * 함께 닫혀 목록으로 튕겼다. 시트는 한 번에 한 장이라는 약속을 지킨다.
   */
  closeWishDetail();
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
  // 자세히가 닫히는 연출과 겹치지 않게 한 박자 뒤에 올린다. 고치기·지우기와 같은 줄이다.
  setTimeout(() => showSheet(elements.wishAchieveSheet), MENU_HANDOFF_MS);
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
