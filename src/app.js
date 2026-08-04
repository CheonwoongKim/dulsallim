import "./style.css";

/* 아래 넷은 화면과 기능을 이어 붙인다. 불러오기만 하면 스스로 붙으므로 여기서 부를 것이 없다. */
import "./wiring/shell.js";
import "./wiring/ledger.js";
import "./wiring/forms.js";
import "./wiring/pages.js";

/* 새 버전으로 갈아타는 일도 스스로 건다. */
import "./pwa.js";

import { elements } from "./dom.js";

import { paintMembers, render, resetTotalAnimation } from "./render.js";
import { clearData, loadAll } from "./store.js";

import { openForm } from "./features/expense-form.js";
import { buildMonthGrid } from "./features/month-picker.js";

import { describeApplied } from "./fixed-costs.js";

import { closePageNow } from "./ui/page.js";

import { fillCategoryOptions } from "./ui/category-options.js";
import { stopSync, watchForChanges } from "./sync.js";
import { watchHeaderSummary } from "./ui/header-summary.js";
import { watchKeyboard } from "./ui/keyboard-inset.js";
import { showToast } from "./ui/toast.js";
import {
  getProfile,
  isReady,
  rememberEmail,
  restoreSession,
  showApp,
  showConfigError,
  showLoginScreen,
  signIn,
  signOut,
} from "./features/auth.js";
import { applyDueFixedCosts } from "./features/fixed-sheet.js";

/* ── 로그인 ───────────────────────────────────────────────── */

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;

  if (!email || !password) {
    elements.loginError.textContent = "이메일과 비밀번호를 모두 입력해 주세요.";
    (email ? elements.loginPassword : elements.loginEmail).focus();
    return;
  }

  elements.loginError.textContent = "";
  elements.loginSubmit.disabled = true;
  elements.loginSubmitLabel.textContent = "확인하는 중…";

  try {
    await signIn(email, password);
    // 로그인이 된 이메일만 기억한다. 오타를 기억해 두면 다음에도 그대로 막힌다.
    rememberEmail(elements.rememberEmail.checked ? email : null);
    await startApp();
  } catch (error) {
    elements.loginError.textContent = error.message;
    elements.loginPassword.value = "";
    elements.loginPassword.focus();
  } finally {
    elements.loginSubmit.disabled = false;
    elements.loginSubmitLabel.textContent = "로그인";
  }
});

elements.signOut.addEventListener("click", async () => {
  stopSync();
  closePageNow();
  clearData();
  // 사본만 비우면 화면에는 앞사람 기록이 그대로 남는다. 지운 상태로 한 번 그려서 흔적을 없앤다.
  resetTotalAnimation();
  render();
  elements.dataGate.hidden = true;
  await signOut();
  showLoginScreen();
});

/* ── 시작 ─────────────────────────────────────────────────── */

function showDataGate(message, canRetry = false) {
  elements.dataGate.hidden = false;
  elements.authGate.hidden = true;
  elements.appShell.hidden = true;
  elements.dataStatus.textContent = message;
  elements.retryLoad.hidden = !canRetry;
}

let wired = false;

function wireOnce() {
  if (wired) return;
  wired = true;
  document.querySelectorAll("[data-open-form]").forEach((button) => {
    button.addEventListener("click", () => openForm());
  });
  buildMonthGrid();
}

async function startApp() {
  const profile = getProfile();
  showDataGate("기록을 불러오는 중…");

  try {
    await loadAll(profile);

    elements.dataGate.hidden = true;
    showApp();
    wireOnce();
    watchHeaderSummary();
    watchKeyboard();
    paintMembers();

    /*
     * 고정비를 채우기 전에 귀부터 연다.
     *
     * 뒤에 두면 그 사이 상대가 남긴 말이 어느 쪽에도 안 잡힌다 — 이미 불러온 개수에도 없고,
     * 구독은 지나간 일을 들려주지 않는다. 밀린 고정비가 많을수록 그 틈이 길어진다.
     */
    watchForChanges(profile.household_id);

    // 반영일이 지난 고정비를 채운 뒤 그린다.
    const applied = await applyDueFixedCosts();
    render();

    // 조용히 넘어가면 이번 달 고정비가 통째로 빠진 걸 모른 채 지나간다.
    const notice = describeApplied(applied);
    if (notice) showToast(notice);
  } catch (error) {
    /*
     * 불러오다 터지든 그리다 터지든 여기서 받는다.
     *
     * 예전에는 loadAll 만 감쌌다. 그 뒤에서 터지면 로그인 폼의 catch 가 대신 받아
     * 이미 숨겨진 로그인 화면의 오류 자리에 글자를 썼다 — 화면은 반쯤 뜬 채,
     * 아무 설명 없는 빈 목록만 남았다. 실제로 그렇게 한 번 놓쳤다.
     */
    showDataGate(error.message, true);
  }
}

elements.retryLoad.addEventListener("click", () => (getProfile() ? startApp() : boot()));

async function boot() {
  // 폼을 건드리는 것이 아무것도 없을 때 채운다. 비어 있는 select 에 값을 넣으면 조용히 무시된다.
  fillCategoryOptions();

  if (!isReady()) {
    showConfigError();
    return;
  }

  let profile = null;
  try {
    profile = await restoreSession();
  } catch (error) {
    // 세션은 그대로다. 로그인 화면으로 돌리지 않고 다시 시도할 기회만 준다.
    showDataGate(error.message, true);
    return;
  }

  if (profile) {
    await startApp();
    return;
  }
  showLoginScreen();
}

// 아무도 기다리지 않는 호출이다. 여기서 놓치면 화면은 "불러오는 중…" 에 멈춘 채 아무 말도 안 한다.
boot().catch((error) => showDataGate(error.message, true));
