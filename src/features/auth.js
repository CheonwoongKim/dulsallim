import { elements } from "../dom.js";
import { CONFIG_ERROR, isConfigured, supabase } from "../supabase.js";

let profile = null;

/** 로그인한 사람의 프로필(표시 이름 등). 로그인 전에는 null. */
export function getProfile() {
  return profile;
}

/**
 * Supabase가 주는 영문 메시지를 그대로 보여주면 무슨 일인지 알기 어렵다.
 * 자주 나오는 것만 우리말로 바꾸고, 나머지는 원문을 남겨 원인 추적이 가능하게 한다.
 */
function toKoreanMessage(error) {
  const raw = error?.message || "";
  if (/invalid login credentials/i.test(raw)) return "이메일 또는 비밀번호가 맞지 않아요.";
  if (/email not confirmed/i.test(raw)) return "이메일 인증이 끝나지 않은 계정이에요.";
  if (/rate limit|too many/i.test(raw)) return "시도가 너무 잦아요. 잠시 뒤에 다시 해주세요.";
  if (/failed to fetch|network/i.test(raw)) return "서버에 연결하지 못했어요. 네트워크를 확인해 주세요.";
  return raw || "로그인하지 못했어요.";
}

/**
 * 로그인한 계정에 연결된 프로필을 읽는다.
 * 계정은 있는데 프로필이 없으면 가구에 속하지 않은 것이라 아무 데이터도 볼 수 없다.
 * 빈 화면을 보여주느니 여기서 막고 이유를 알린다.
 */
async function loadProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_color, household_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`프로필을 읽지 못했어요: ${error.message}`);
  if (!data) throw new Error("이 계정은 가구에 연결되어 있지 않아요. seed.sql 을 확인해 주세요.");
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(toKoreanMessage(error));
  profile = await loadProfile(data.user.id);
  return profile;
}

export async function signOut() {
  profile = null;
  await supabase.auth.signOut();
}

/**
 * 저장된 세션이 있으면 조용히 복구한다.
 * @returns {Promise<object|null>} 복구된 프로필. 없으면 null.
 */
export async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  try {
    profile = await loadProfile(data.session.user.id);
    return profile;
  } catch {
    // 세션은 살아 있는데 프로필을 못 읽으면 로그인 화면으로 되돌린다.
    await supabase.auth.signOut();
    return null;
  }
}

export function showLoginScreen(message = "") {
  elements.authGate.hidden = false;
  elements.appShell.hidden = true;
  elements.loginError.textContent = message;
  elements.loginForm.reset();
  setTimeout(() => elements.loginEmail.focus(), 60);
}

export function showApp() {
  elements.authGate.hidden = true;
  elements.appShell.hidden = false;
}

/**
 * 마이페이지에서 저장한 내용을 여기에도 반영한다.
 * 이 값이 낡으면 마이페이지를 다시 열었을 때 예전 이름이 뜬다.
 */
export function updateCurrentProfile(currentProfile) {
  profile = { ...profile, ...currentProfile };
}

/** 설정 자체가 안 된 경우. 로그인 폼 대신 이유를 보여준다. */
export function showConfigError() {
  elements.authGate.hidden = false;
  elements.appShell.hidden = true;
  elements.loginForm.hidden = true;
  elements.loginError.textContent = CONFIG_ERROR;
}

export function isReady() {
  return isConfigured;
}
