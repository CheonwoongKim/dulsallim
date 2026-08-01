import { elements } from "../dom.js";
import { PALETTE } from "../members.js";
import { paintMembers, render } from "../render.js";
import { updateProfile } from "../data/remote.js";
import { reloadMembers } from "../store.js";
import { hidePage, showPage } from "../ui/page.js";
import { showToast } from "../ui/toast.js";
import { getProfile, updateCurrentProfile } from "./auth.js";

const MAX_NAME = 12;

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

export function openProfilePage() {
  const profile = getProfile();
  if (!profile) return;

  if (!elements.profilePalette.children.length) buildPalette();
  pickedColor = profile.avatar_color;
  elements.profileName.value = profile.display_name;
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

  elements.profileSubmit.disabled = true;
  try {
    const saved = await updateProfile(getProfile().id, { name, color: pickedColor });
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
