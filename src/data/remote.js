import { supabase } from "../supabase.js";
import {
  fromExpense,
  fromOccurrence,
  fromTemplate,
  toAppliedKey,
  toExpense,
  toNote,
  toTemplate,
} from "./rows.js";

/** 같은 달을 두 번 반영하려 할 때 DB가 돌려주는 코드. 오류가 아니라 "이미 됐다"는 뜻이다. */
const DUPLICATE = "23505";

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
    color: row.avatar_color,
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
      .select("id, display_name, avatar_color, monthly_goal, nag_enabled, household_id")
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
      .select("id, display_name, avatar_color, monthly_goal, nag_enabled, household_id")
      .single(),
  );
  return row;
}

/**
 * 가구의 모든 기록을 지운다. 되돌릴 수 없다.
 * 고정비를 먼저 지우면 반영 기록이 함께 사라지고, 그 뒤 지출을 지운다.
 * 순서가 반대면 "반영했다"는 기록만 남아 초기화 직후 지난 달 고정비가 되살아나지 않는다.
 */
export async function resetHousehold(householdId) {
  unwrap(
    "고정비 삭제",
    await supabase.from("fixed_costs").delete().eq("household_id", householdId),
  );
  unwrap(
    "지출 삭제",
    await supabase.from("expenses").delete().eq("household_id", householdId),
  );
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

async function fetchFixedCosts(householdId) {
  const rows = unwrap(
    "고정비 불러오기",
    await supabase.from("fixed_costs").select("*").eq("household_id", householdId),
  );
  return rows.map(toTemplate);
}

/** 시작에 필요한 것을 한꺼번에 읽는다. 순서대로 기다리면 첫 화면이 그만큼 느려진다. */
export async function fetchAll(householdId) {
  const [members, expenses, fixedCosts, applied, noteCounts] = await Promise.all([
    fetchMembers(householdId),
    fetchExpenses(householdId),
    fetchFixedCosts(householdId),
    fetchApplied(),
    fetchNoteCounts(),
  ]);
  return { members, expenses, fixedCosts, applied, noteCounts };
}

/**
 * 어느 지출에 말이 몇 개 달렸는지.
 * 목록에 표시만 할 것이라 본문은 필요 없다. 지출 id만 받아 세면 전송량이 훨씬 적다.
 * @returns {Promise<Record<string, number>>} 지출 id별 개수
 */
export async function fetchNoteCounts() {
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

/* ── 고정비 반영 ──────────────────────────────────────────── */

/**
 * 고정비 한 건을 그 달의 지출로 만든다.
 *
 * 순서가 중요하다. 반영 기록을 **먼저** 남기는데, 이 표는 (고정비, 달)이 기본키라
 * 두 사람이 같은 순간에 앱을 열어도 DB가 둘 중 하나만 통과시킨다.
 * 지출을 먼저 만들면 그 사이에 상대 폰이 같은 지출을 또 만들어 두 번 기록된다.
 *
 * @returns {Promise<object|null>} 만들어진 지출. 이미 반영된 달이면 null.
 */
export async function applyOccurrence(occurrence, context) {
  const claim = fromOccurrence(occurrence);
  const { error: claimError } = await supabase.from("fixed_cost_applications").insert(claim);
  if (claimError?.code === DUPLICATE) return null;
  if (claimError) throw fail("고정비 반영", claimError);

  const { template, date } = occurrence;
  // 지출과 반영 기록을 서로 이어 둬야 나중에 어느 지출이 고정비에서 왔는지 알 수 있다.
  const draft = { ...template, date, fixedCostId: template.id };

  try {
    const created = await insertExpense(draft, context);
    await supabase
      .from("fixed_cost_applications")
      .update({ expense_id: created.id })
      .eq("fixed_cost_id", claim.fixed_cost_id)
      .eq("month", claim.month);
    return created;
  } catch (error) {
    // 지출을 못 만들었는데 "반영했다"는 기록만 남으면 그 달을 영영 건너뛴다. 표시를 되돌린다.
    await supabase
      .from("fixed_cost_applications")
      .delete()
      .eq("fixed_cost_id", claim.fixed_cost_id)
      .eq("month", claim.month);
    throw error;
  }
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

/* ── 실시간 ───────────────────────────────────────────────── */

/**
 * 상대가 폰에서 기록하면 내 화면도 따라 바뀌게 한다.
 * 둘이 함께 쓰는 가계부인데 새로고침해야 보인다면 "함께"가 아니다.
 * @returns {object} 해지에 쓰는 채널
 */
export function subscribeExpenses(householdId, onChange) {
  return supabase
    .channel(`expenses-${householdId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "expenses",
        filter: `household_id=eq.${householdId}`,
      },
      onChange,
    )
    .subscribe();
}

export function unsubscribe(channel) {
  if (channel) supabase.removeChannel(channel);
}
