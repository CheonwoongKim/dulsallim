import { elements } from "../dom.js";
import { formatMoney } from "../expenses.js";
import { PALETTE, getMembers } from "../members.js";
import { paintMembers, render } from "../render.js";
import { updateProfile } from "../data/remote.js";
import { reloadMembers } from "../store.js";
import { hidePage, showPage } from "../ui/page.js";
import { showToast } from "../ui/toast.js";
import { getProfile, updateCurrentProfile } from "./auth.js";

const MAX_NAME = 12;
const GOAL_MAX_DIGITS = 10;

let pickedColor = null;

/** 미리보기 원형에 지금 고른 이름·색을 즉시 비춘다. 저장 전에 결과를 볼 수 있어야 한다. */
function syncPreview() {
  const name = elements.profileName.value.trim();
  elements.profilePreview.style.background = pickedColor;
  elements.profilePreview.textContent = name.slice(-1) || "?";
  elements.profilePreviewName.textContent = name || "이름을 입력해 주세요";
}

function buildPalette() {
  const swatches = PALETTE.map(({ value, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.dataset.color = value;
    button.style.background = value;
    button.setAttribute("aria-label", label);
    return button;
  });
  elements.profilePalette.replaceChildren(...swatches);
}

function markSelectedSwatch() {
  elements.profilePalette.querySelectorAll(".swatch").forEach((swatch) => {
    swatch.setAttribute("aria-pressed", String(swatch.dataset.color === pickedColor));
  });
}

/**
 * 상대의 목표를 함께 보여 준다.
 * 둘이 상의해 정하는 금액이라 서로 투명하게 보이는 편이 낫다.
 * 다만 고치는 건 각자 자기 것만 — 상대 이름을 내가 바꿀 수 없는 것과 같은 이유다.
 */
function paintPartnerGoal() {
  const partner = getMembers().find((member) => member.id !== getProfile()?.id);
  elements.partnerGoal.hidden = !partner;
  if (!partner) return;
  elements.partnerGoal.textContent = partner.goal
    ? `${partner.name} 님의 목표 ${formatMoney(partner.goal)}원`
    : `${partner.name} 님은 아직 목표를 정하지 않았어요`;
}

export function openProfilePage() {
  const profile = getProfile();
  if (!profile) return;

  if (!elements.profilePalette.children.length) buildPalette();
  pickedColor = profile.avatar_color;
  elements.profileName.value = profile.display_name;
  elements.profileGoal.value = profile.monthly_goal ? formatMoney(profile.monthly_goal) : "";
  paintPartnerGoal();
  elements.profileError.textContent = "";
  markSelectedSwatch();
  syncPreview();
  showPage(elements.profilePage);
}

export function pickColor(color) {
  pickedColor = color;
  markSelectedSwatch();
  syncPreview();
}

export function handleNameInput() {
  elements.profileError.textContent = "";
  syncPreview();
}

/** 금액은 지출 폼과 같은 방식으로 콤마를 붙여 준다. */
export function handleGoalInput(event) {
  const digits = event.target.value.replace(/\D/g, "").slice(0, GOAL_MAX_DIGITS);
  event.target.value = digits ? formatMoney(Number(digits)) : "";
  elements.profileError.textContent = "";
}

export async function handleProfileSubmit(event) {
  event.preventDefault();
  const name = elements.profileName.value.trim();

  if (!name) {
    elements.profileError.textContent = "표시 이름을 입력해 주세요.";
    elements.profileName.focus();
    return;
  }
  if (name.length > MAX_NAME) {
    elements.profileError.textContent = `표시 이름은 ${MAX_NAME}자까지 넣을 수 있어요.`;
    elements.profileName.focus();
    return;
  }

  // 비워 두면 목표를 쓰지 않는다는 뜻이다. 0원 목표는 뜻이 없어 DB도 거절한다.
  const digits = elements.profileGoal.value.replace(/\D/g, "");
  const goal = digits ? Number(digits) : null;
  if (goal !== null && goal <= 0) {
    elements.profileError.textContent = "목표는 1원 이상이어야 해요. 쓰지 않으려면 비워 주세요.";
    elements.profileGoal.focus();
    return;
  }

  elements.profileSubmit.disabled = true;
  try {
    const saved = await updateProfile(getProfile().id, { name, color: pickedColor, goal });
    // 요약 카드·목록·결제자 선택에 모두 이름이 박혀 있다. 명부를 다시 읽어 한 번에 맞춘다.
    updateCurrentProfile(saved);
    await reloadMembers();
  } catch (error) {
    elements.profileError.textContent = error.message;
    return;
  } finally {
    elements.profileSubmit.disabled = false;
  }

  paintMembers();
  render();
  hidePage();
  showToast("프로필을 바꿨어요");
}
