import { toDisplayColor } from "../members.js";
import { supabase } from "../supabase.js";
import {
  fromExpense,
  fromOccurrence,
  fromTemplate,
  toAppliedKey,
  toExpense,
  toNote,
  toTemplate,
  toWish,
} from "./rows.js";

/**
 * PostgREST 오류를 그대로 보여주면 무슨 일인지 알 수 없다.
 * 어떤 동작이 실패했는지 우리말로 붙이고, 원문은 콘솔에 남겨 원인 추적이 가능하게 한다.
 */
function fail(action, error) {
  console.error(`${action} 실패:`, error);
  const message = error?.message || "";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return new Error("서버에 연결하지 못했어요. 네트워크를 확인해 주세요.");
  }
  return new Error(`${action}에 실패했어요.`);
}

function unwrap(action, { data, error }) {
  if (error) throw fail(action, error);
  return data;
}

/**
 * 내 프로필을 읽어 올 때 가져오는 열.
 *
 * 세 곳(로그인, 잔소리 켜기, 프로필 수정)이 같은 목록을 따로 적고 있었다.
 * 열을 하나 더하면 셋을 다 고쳐야 하고, 한 곳을 빠뜨리면 그 경로로 들어온 프로필에만
 * 그 값이 비어 화면이 조용히 어긋난다(avatar_color 를 더할 때 실제로 셋을 고쳐야 했다).
 */
export const MY_PROFILE_COLUMNS = "id, display_name, avatar_color, monthly_goal, nag_enabled, household_id";

/** 위시 읽기와 RPC 응답이 같은 모양을 쓰도록 열 목록을 한 곳에 둔다. */
export const WISH_COLUMNS =
  "id, household_id, name, url, note, estimated_price, image_url, created_by, created_at, state, pursuing_at, expense_id, achieved_on, achieved_at";
export const WISH_AGREEMENT_COLUMNS = "wish_id, user_id, agreed_at";
const WISH_RESULT_COLUMNS = `${WISH_COLUMNS}, agreement_user_ids`;

/* ── 읽기 ─────────────────────────────────────────────────── */

/** 가구 구성원. 가입 순서가 화면의 좌우 배치 순서가 된다. */
export async function fetchMembers(householdId) {
  const rows = unwrap(
    "구성원 불러오기",
    await supabase
      .from("profiles")
      .select("id, display_name, avatar_color, monthly_goal, created_at")
      .eq("household_id", householdId)
      .order("created_at"),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.display_name,
    color: toDisplayColor(row.avatar_color),
    goal: row.monthly_goal,
  }));
}

/** 잔소리를 잠시 멈추거나 다시 켠다. 심어 둔 문구는 그대로 남는다. */
export async function setNagEnabled(userId, enabled) {
  const row = unwrap(
    "설정 저장",
    await supabase
      .from("profiles")
      .update({ nag_enabled: enabled })
      .eq("id", userId)
      .select(MY_PROFILE_COLUMNS)
      .single(),
  );
  return row;
}

/**
 * 내 표시 이름·색·목표를 바꾼다.
 * 어느 행을 고치든 DB는 본인 행만, 그것도 정해진 열만 허용한다(migration-profile.sql).
 */
export async function updateProfile(userId, { name, color, goal }) {
  const row = unwrap(
    "프로필 수정",
    await supabase
      .from("profiles")
      .update({ display_name: name, avatar_color: color, monthly_goal: goal })
      .eq("id", userId)
      .select(MY_PROFILE_COLUMNS)
      .single(),
  );
  return row;
}

/**
 * 가구의 모든 기록을 지운다. 되돌릴 수 없다.
 *
 * 서버 함수 하나로 부르는 이유는 트랜잭션 때문이다. 고정비와 지출을 두 요청으로 나누면
 * 두 번째가 실패했을 때 고정비만 사라진 절반 상태가 남는다. 함수 안이면 전부 되거나 전부 안 된다.
 * (지우는 순서 자체는 서버가 지킨다 — schema.sql 의 reset_household)
 */
export async function resetHousehold() {
  unwrap("데이터 초기화", await supabase.rpc("reset_household"));
}

export async function fetchExpenses(householdId) {
  const rows = unwrap(
    "지출 불러오기",
    await supabase.from("expenses").select("*").eq("household_id", householdId),
  );
  return rows.map(toExpense);
}

/** 반영 기록에는 household_id가 없다. 어느 가구 것인지는 RLS가 고정비를 통해 판단한다. */
export async function fetchApplied() {
  const rows = unwrap(
    "고정비 반영 기록 불러오기",
    await supabase.from("fixed_cost_applications").select("fixed_cost_id, month"),
  );
  return rows.map(toAppliedKey);
}

export async function fetchFixedCosts(householdId) {
  const rows = unwrap(
    "고정비 불러오기",
    await supabase.from("fixed_costs").select("*").eq("household_id", householdId),
  );
  return rows.map(toTemplate);
}

/** 위시와 합의는 정규화해 저장하고, 읽을 때 화면용 객체 하나로 합친다. */
export async function fetchWishes(householdId) {
  const [rows, agreements] = await Promise.all([
    unwrap(
      "위시 불러오기",
      await supabase
        .from("wish_items")
        .select(WISH_COLUMNS)
        .eq("household_id", householdId)
        .order("created_at", { ascending: false }),
    ),
    unwrap(
      "위시 합의 불러오기",
      await supabase.from("wish_agreements").select(WISH_AGREEMENT_COLUMNS).order("agreed_at"),
    ),
  ]);
  const agreedByWish = agreements.reduce((byWish, agreement) => {
    (byWish[agreement.wish_id] ||= []).push(agreement.user_id);
    return byWish;
  }, {});
  return rows.map((row) => toWish(row, agreedByWish[row.id] || []));
}

/** 시작에 필요한 것을 한꺼번에 읽는다. 순서대로 기다리면 첫 화면이 그만큼 느려진다. */
export async function fetchAll(householdId) {
  const [members, expenses, fixedCosts, applied, noteCounts, wishes] = await Promise.all([
    fetchMembers(householdId),
    fetchExpenses(householdId),
    fetchFixedCosts(householdId),
    fetchApplied(),
    fetchNoteCounts(),
    fetchWishes(householdId),
  ]);
  return { members, expenses, fixedCosts, applied, noteCounts, wishes };
}

/**
 * 어느 지출에 말이 몇 개 달렸는지.
 * 목록에 표시만 할 것이라 본문은 필요 없다. 지출 id만 받아 세면 전송량이 훨씬 적다.
 * @returns {Promise<Record<string, number>>} 지출 id별 개수
 */
async function fetchNoteCounts() {
  const rows = unwrap(
    "대화 개수 불러오기",
    await supabase.from("expense_notes").select("expense_id"),
  );
  return rows.reduce((counts, row) => {
    counts[row.expense_id] = (counts[row.expense_id] || 0) + 1;
    return counts;
  }, {});
}

/** 한 지출의 대화 전체. 오래된 것부터 읽어야 위에서 아래로 자연스럽다. */
export async function fetchNotes(expenseId) {
  const rows = unwrap(
    "대화 불러오기",
    await supabase
      .from("expense_notes")
      .select("*")
      .eq("expense_id", expenseId)
      .order("created_at"),
  );
  return rows.map(toNote);
}

export async function insertNote(expenseId, body, { userId }) {
  const row = unwrap(
    "메시지 보내기",
    await supabase
      .from("expense_notes")
      .insert({ expense_id: expenseId, author_id: userId, body })
      .select()
      .single(),
  );
  return toNote(row);
}

/**
 * 상대가 남긴 메시지를 바로 받는다.
 * expense_notes 에는 household_id 가 없어 서버 필터를 걸 수 없지만,
 * RLS 가 같은 가구의 행만 흘려보내므로 남의 대화는 애초에 오지 않는다.
 */
export function subscribeNotes(onInsert) {
  return supabase
    .channel("expense-notes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "expense_notes" },
      (payload) => onInsert(toNote(payload.new)),
    )
    .subscribe();
}

/* ── 지출 쓰기 ────────────────────────────────────────────── */

export async function insertExpense(expense, context) {
  const row = unwrap(
    "지출 저장",
    await supabase.from("expenses").insert(fromExpense(expense, context)).select().single(),
  );
  return toExpense(row);
}

/** 만든 사람·가구·고정비 연결은 수정 대상이 아니다. 함께 보내면 이력이 지워진다. */
export async function updateExpense(id, expense, context) {
  const { household_id, created_by, fixed_cost_id, ...changes } = fromExpense(expense, context);
  const row = unwrap(
    "지출 수정",
    await supabase.from("expenses").update(changes).eq("id", id).select().single(),
  );
  return toExpense(row);
}

export async function deleteExpenseRow(id) {
  unwrap("지출 삭제", await supabase.from("expenses").delete().eq("id", id));
}

/* ── 고정비 쓰기 ──────────────────────────────────────────── */

export async function insertTemplate(template, context) {
  const row = unwrap(
    "고정비 저장",
    await supabase.from("fixed_costs").insert(fromTemplate(template, context)).select().single(),
  );
  return toTemplate(row);
}

export async function updateTemplate(id, template, context) {
  const { household_id, ...changes } = fromTemplate(template, context);
  const row = unwrap(
    "고정비 수정",
    await supabase.from("fixed_costs").update(changes).eq("id", id).select().single(),
  );
  return toTemplate(row);
}

export async function deleteTemplate(id) {
  unwrap("고정비 삭제", await supabase.from("fixed_costs").delete().eq("id", id));
}

/* ── 위시리스트 쓰기 ──────────────────────────────────────── */

/** 항목과 올린 사람의 첫 합의를 서버 트랜잭션 하나로 만든다. */
export async function insertWish({ name, url, estimatedPrice, note }) {
  const row = unwrap(
    "위시 저장",
    await supabase
      .rpc("create_wish", {
        p_name: name,
        p_url: url || null,
        p_estimated_price: estimatedPrice ?? null,
        p_note: note || null,
      })
      .select(WISH_RESULT_COLUMNS)
      .single(),
  );
  return toWish(row);
}

/** 합의 기록과 필요하다면 pursuing 전환까지 서버가 원자적으로 처리한다. */
export async function agreeWish(id) {
  const row = unwrap(
    "위시 합의",
    await supabase
      .rpc("agree_wish", { p_wish_id: id })
      .select(WISH_RESULT_COLUMNS)
      .single(),
  );
  return toWish(row);
}

/** 지출 날짜 복사와 achieved 전환을 한 요청 안에서 끝낸다. */
export async function achieveWish(id, expenseId) {
  const row = unwrap(
    "위시 이루기",
    await supabase
      .rpc("achieve_wish", { p_wish_id: id, p_expense_id: expenseId })
      .select(WISH_RESULT_COLUMNS)
      .single(),
  );
  return toWish(row);
}

export async function deleteWish(id) {
  unwrap("위시 삭제", await supabase.rpc("delete_wish", { p_wish_id: id }));
}

/**
 * 링크의 대표 그림 주소를 서버에게 물어본다.
 *
 * 못 찾아도 그것은 실패가 아니다 — 그림 없는 링크가 흔하다. 그래서 던지지 않고
 * null 을 돌려준다. 부르는 쪽이 이것 때문에 담기를 되돌리는 일이 없어야 한다.
 */
export async function fetchLinkImage(url) {
  try {
    const { data, error } = await supabase.functions.invoke("link-preview", { body: { url } });
    if (error) return null;
    const image = data?.image;
    return typeof image === "string" && /^https?:\/\//.test(image) ? image : null;
  } catch {
    return null;
  }
}

/** 담긴 뒤에 그림 주소만 따로 붙인다. */
export async function setWishImage(id, imageUrl) {
  unwrap(
    "위시 그림 붙이기",
    await supabase.rpc("set_wish_image", { p_wish_id: id, p_image_url: imageUrl }),
  );
}

/* ── 고정비 반영 ──────────────────────────────────────────── */

/**
 * 고정비 한 건을 그 달의 지출로 만든다.
 *
 * 반영 표시와 지출 생성이 한 트랜잭션이어야 한다. 요청을 나누면 지출이 저장된 뒤
 * 응답만 유실됐을 때 표시를 되돌리고 재시도해 같은 지출이 두 번 생긴다.
 * 서버 함수 안에서는 커밋된 표시가 그대로 남아 재시도해도 중복이 생기지 않는다.
 *
 * 날짜 계산은 여기서 한다. 말일 보정 규칙이 화면 쪽에 있고 이미 검증돼 있다.
 *
 * @returns {Promise<object|null>} 만들어진 지출. 이미 반영된 달이면 null.
 */
export async function applyOccurrence(occurrence) {
  const { fixed_cost_id, month } = fromOccurrence(occurrence);
  const rows = unwrap(
    "고정비 반영",
    await supabase.rpc("apply_fixed_cost", {
      p_fixed_cost_id: fixed_cost_id,
      p_month: month,
      p_spent_on: occurrence.date,
    }),
  );
  // 빈 결과는 상대 폰이 먼저 넣었다는 뜻이다. 오류가 아니다.
  return rows?.length ? toExpense(rows[0]) : null;
}

/* ── 소비 잔소리 ──────────────────────────────────────────── */

/** 내가 쓴 것만 온다. 대상이 미리 읽지 못하도록 DB가 막는다. */
export async function fetchNags() {
  const rows = unwrap(
    "잔소리 불러오기",
    await supabase.from("nags").select("*").order("percent"),
  );
  return rows.map((row) => ({ id: row.id, percent: row.percent, body: row.body }));
}

export async function insertNag({ percent, body, targetId }, { householdId, userId }) {
  unwrap(
    "잔소리 저장",
    await supabase
      .from("nags")
      .insert({ household_id: householdId, author_id: userId, target_id: targetId, percent, body }),
  );
}

export async function updateNag(id, { percent, body }) {
  unwrap("잔소리 수정", await supabase.from("nags").update({ percent, body }).eq("id", id));
}

export async function deleteNag(id) {
  unwrap("잔소리 삭제", await supabase.from("nags").delete().eq("id", id));
}

/**
 * 방금 기록한 지출이 목표 구간을 넘겼는지 서버가 판단하고, 넘겼으면 서버가 말을 적는다.
 *
 * 화면에서 계산하지 않는 이유가 둘 있다.
 *   · 문구는 쓴 사람만 읽을 수 있다. 대상의 폰이 미리 가져올 수 없어야 한다
 *   · 두 폰이 같은 순간에 계산해도 한 번만 울려야 한다
 */
export async function fireNags(expenseId) {
  const { error } = await supabase.rpc("fire_nags", { p_expense_id: expenseId });
  // 울리지 못해도 지출은 이미 저장됐다. 기록만 남기고 넘어간다.
  if (error) console.error("잔소리 확인 실패:", error);
}

/* ── 알림 ─────────────────────────────────────────────────── */

/**
 * 알림 받을 곳을 저장한다.
 *
 * 같은 사람이 폰을 바꾸거나 다시 설치하면 새 endpoint 가 생긴다. endpoint 를 열쇠로
 * 덮어써서, 옛 것이 남아 보내는 쪽이 헛수고하지 않게 한다.
 */
export async function savePushSubscription(userId, subscription) {
  unwrap(
    "알림 등록",
    await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: "endpoint" },
    ),
  );
}

export async function removePushSubscription(endpoint) {
  unwrap("알림 해제", await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint));
}

/* ── 실시간 ───────────────────────────────────────────────── */

/**
 * 상대가 폰에서 기록하면 내 화면도 따라 바뀌게 한다. 가구 공유 자료를 한 채널에서 함께 듣는다.
 * 둘이 함께 쓰는 가계부인데 새로고침해야 보인다면 "함께"가 아니다.
 *
 * 고정비가 빠져 있으면 한쪽이 데이터를 초기화해도 상대 화면에는 지운 고정비가 남는다.
 * 그 목록으로 반영을 시도하면 "고정비를 찾을 수 없습니다"만 돌아온다.
 *
 * 삭제 이벤트에는 filter 도 RLS 도 걸리지 않는다 — Postgres 가 지워진 행의 권한을
 * 확인할 수 없기 때문이다. 그래서 남의 가구 삭제도 여기로 들어올 수 있지만,
 * 페이로드에는 기본 키만 담기고 우리는 그 값을 쓰지 않는다. 받으면 그저 다시 읽을 뿐이고,
 * 다시 읽는 길은 RLS 가 지킨다.
 * @returns {object} 해지에 쓰는 채널
 */
export function subscribeHousehold(householdId, onChange) {
  const scope = { event: "*", schema: "public", filter: `household_id=eq.${householdId}` };
  return supabase
    .channel(`household-${householdId}`)
    .on("postgres_changes", { ...scope, table: "expenses" }, onChange)
    .on("postgres_changes", { ...scope, table: "fixed_costs" }, onChange)
    .on("postgres_changes", { ...scope, table: "wish_items" }, onChange)
    // 합의 표에는 household_id 가 없다. RLS 가 같은 집의 이벤트만 흘려보낸다.
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "wish_agreements" },
      onChange,
    )
    .subscribe();
}

export function unsubscribe(channel) {
  if (channel) supabase.removeChannel(channel);
}
