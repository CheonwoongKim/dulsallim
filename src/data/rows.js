import { CATEGORIES } from "../expenses.js";
import { appliedKey } from "../fixed-costs.js";

/**
 * DB 행과 화면이 쓰는 객체를 서로 옮긴다.
 *
 * 두 이름 체계가 다른 이유가 있다. DB는 `spent_on`, `paid_by`처럼 SQL 관례를 따르고,
 * 화면은 `date`, `member`처럼 짧은 이름을 쓴다. 둘을 억지로 맞추는 대신
 * 경계에서 한 번만 번역하면, 어느 한쪽을 바꿔도 다른 쪽이 흔들리지 않는다.
 */

/** DB에 CHECK 제약이 있어 정상 경로로는 어긋날 수 없지만, 화면이 깨지느니 기타로 받는다. */
const safeCategory = (value) => (Object.hasOwn(CATEGORIES, value) ? value : "etc");

/** `date` 열은 `2026-08-01` 형태의 문자열로 온다. 월 키는 앞 7글자다. */
const toMonthKey = (dateText) => String(dateText).slice(0, 7);

const toDayOne = (monthKey) => `${monthKey}-01`;

export function toExpense(row) {
  return {
    id: row.id,
    date: row.spent_on,
    member: row.paid_by,
    category: safeCategory(row.category),
    item: row.item,
    amount: row.amount,
    // 같은 날 여러 건을 기록한 순서를 지키기 위한 보조 정렬 키.
    createdAt: Date.parse(row.created_at) || 0,
  };
}

export function fromExpense(expense, { householdId, userId }) {
  return {
    household_id: householdId,
    paid_by: expense.member,
    spent_on: expense.date,
    category: expense.category,
    item: expense.item,
    amount: expense.amount,
    created_by: userId,
    // 고정비에서 자동으로 생긴 건지 표시한다. 직접 적은 지출이면 비어 있다.
    fixed_cost_id: expense.fixedCostId || null,
  };
}

export function toTemplate(row) {
  return {
    id: row.id,
    member: row.paid_by,
    category: safeCategory(row.category),
    item: row.item,
    amount: row.amount,
    day: row.day_of_month,
    startMonth: toMonthKey(row.start_month),
  };
}

export function fromTemplate(template, { householdId }) {
  return {
    household_id: householdId,
    paid_by: template.member,
    category: template.category,
    item: template.item,
    amount: template.amount,
    day_of_month: template.day,
    start_month: toDayOne(template.startMonth),
  };
}

/** 반영 기록은 화면에서 `고정비id:2026-08` 한 줄짜리 문자열로 다룬다. */
export function toAppliedKey(row) {
  return appliedKey(row.fixed_cost_id, toMonthKey(row.month));
}

export function toNote(row) {
  return {
    id: row.id,
    expenseId: row.expense_id,
    author: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function fromOccurrence(occurrence) {
  return {
    fixed_cost_id: occurrence.template.id,
    month: toDayOne(toMonthKey(occurrence.date)),
  };
}
