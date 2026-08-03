import { elements } from "../dom.js";
import { formatMoney } from "../expenses.js";
import { getMembers } from "../members.js";
import { deleteNag, fetchNags, insertNag, setNagEnabled, updateNag } from "../data/remote.js";
import { getContext } from "../store.js";
import { escapeHtml } from "../ui/escape.js";
import { hidePage, showPage } from "../ui/page.js";
import { showToast } from "../ui/toast.js";
import { getProfile, updateCurrentProfile } from "./auth.js";

/** 다섯 개면 충분하다. 더 많으면 고르는 것도 일이고, 한 달에 다섯 번이면 이미 잔소리가 많다. */
const MAX_NAGS = 5;
const MIN_PERCENT = 1;
const MAX_PERCENT = 200;

let nags = [];
let editingId = null;

/** 잔소리는 상대에게 보내는 것이다. 나에게 심을 수는 없다. */
function getTarget() {
  return getMembers().find((member) => member.id !== getProfile()?.id) || null;
}

function paintTarget(target) {
  if (!target) {
    elements.nagTarget.textContent = "함께 쓰는 사람이 없어요.";
    return;
  }
  elements.nagTarget.textContent = target.goal
    ? `${target.name} 님의 월 목표 ${formatMoney(target.goal)}원`
    : `${target.name} 님이 아직 월 목표를 정하지 않아 잔소리가 울리지 않아요.`;
}

function paintList() {
  if (!nags.length) {
    elements.nagList.innerHTML = `<p class="nag-empty">아직 심어 둔 말이 없어요.</p>`;
    return;
  }
  elements.nagList.innerHTML = nags
    .map(
      (nag) => `
      <div class="nag-item">
        <span class="nag-percent">${nag.percent}%</span>
        <span class="nag-body">${escapeHtml(nag.body)}</span>
        <span class="nag-actions">
          <button type="button" data-edit-nag="${nag.id}" aria-label="${escapeHtml(nag.body)} 수정">수정</button>
          <button type="button" data-remove-nag="${nag.id}" aria-label="${escapeHtml(nag.body)} 삭제">삭제</button>
        </span>
      </div>`,
    )
    .join("");
}

function showAddForm() {
  editingId = null;
  elements.nagForm.reset();
  elements.nagFormMode.textContent = "새 잔소리";
  elements.nagSubmitLabel.textContent = "추가";
  elements.nagCancel.hidden = true;
  elements.nagError.textContent = "";
  // 다 채웠으면 더 넣을 자리가 없다.
  elements.nagForm.hidden = nags.length >= MAX_NAGS;
}

export function editNag(id) {
  const nag = nags.find((current) => current.id === id);
  if (!nag) return;
  editingId = id;
  elements.nagForm.hidden = false;
  elements.nagFormMode.textContent = "잔소리 수정";
  elements.nagSubmitLabel.textContent = "변경사항 저장";
  elements.nagCancel.hidden = false;
  elements.nagPercent.value = String(nag.percent);
  elements.nagBody.value = nag.body;
  elements.nagError.textContent = "";
  elements.nagBody.focus();
}

export function cancelEdit() {
  showAddForm();
}

/** 설정 메뉴에 몇 개를 심어 뒀는지 알려 준다. */
function paintSummary(target) {
  elements.nagSummary.textContent = nags.length
    ? `${target ? `${target.name} 님에게 ` : ""}보낼 말 ${nags.length}개`
    : "상대가 목표를 넘길 때 남길 말";
}

export async function openNagPage() {
  const target = getTarget();
  paintTarget(target);
  elements.nagEnabled.checked = getProfile()?.nag_enabled !== false;
  elements.nagList.innerHTML = `<p class="nag-empty">불러오는 중…</p>`;
  showPage(elements.nagPage);

  try {
    nags = await fetchNags();
  } catch (error) {
    elements.nagList.innerHTML = `<p class="nag-empty">${escapeHtml(error.message)}</p>`;
    return;
  }
  paintList();
  paintSummary(target);
  showAddForm();
}

export async function toggleNagEnabled(enabled) {
  try {
    updateCurrentProfile(await setNagEnabled(getProfile().id, enabled));
  } catch (error) {
    // 저장하지 못했으면 스위치도 되돌린다. 켠 줄 알았는데 안 켜져 있으면 안 된다.
    elements.nagEnabled.checked = !enabled;
    showToast(error.message);
  }
}

function validate(percent, body) {
  if (!Number.isInteger(percent) || percent < MIN_PERCENT || percent > MAX_PERCENT) {
    return `구간은 ${MIN_PERCENT}~${MAX_PERCENT} 사이로 적어 주세요.`;
  }
  if (!body) return "무슨 말을 남길지 적어 주세요.";
  // 같은 구간에 둘을 두면 어느 것이 울릴지 알 수 없다. DB도 막지만 여기서 먼저 알린다.
  const taken = nags.some((nag) => nag.percent === percent && nag.id !== editingId);
  if (taken) return `${percent}% 에는 이미 심어 둔 말이 있어요.`;
  return null;
}

export async function handleNagSubmit(event) {
  event.preventDefault();
  const target = getTarget();
  if (!target) return;

  const percent = Number(elements.nagPercent.value.replace(/\D/g, ""));
  const body = elements.nagBody.value.trim();
  const problem = validate(percent, body);
  if (problem) {
    elements.nagError.textContent = problem;
    return;
  }

  elements.nagSubmit.disabled = true;
  try {
    if (editingId) await updateNag(editingId, { percent, body });
    else await insertNag({ percent, body, targetId: target.id }, getContext());
    nags = await fetchNags();
  } catch (error) {
    elements.nagError.textContent = error.message;
    return;
  } finally {
    elements.nagSubmit.disabled = false;
  }

  paintList();
  paintSummary(target);
  showAddForm();
}

export async function removeNag(id) {
  try {
    await deleteNag(id);
    nags = await fetchNags();
  } catch (error) {
    showToast(error.message);
    return;
  }
  paintList();
  paintSummary(getTarget());
  showAddForm();
}

export { hidePage as closeNagPage };
