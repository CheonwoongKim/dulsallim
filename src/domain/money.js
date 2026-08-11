import { formatMoney } from "./expenses.js";

/**
 * 금액 입력을 한 곳에서 다룬다.
 *
 * 지출·고정비·월 목표가 저마다 자릿수를 잘라 쓰다 12자리와 10자리로 갈라졌고,
 * 둘 다 DB 가 받을 수 있는 크기보다 컸다.
 */

/**
 * amount 와 monthly_goal 은 postgres integer 다. 이보다 큰 값은 저장할 수 없다.
 *
 * 화면에서 더 받아 두면 30억 원이 검증을 통과한 뒤 "저장에 실패했어요" 로만 끝나,
 * 사용자는 무엇이 잘못됐는지 알 방법이 없다. 받는 자리에서 막는다.
 */
export const MAX_AMOUNT = 2147483647;

/** 입력칸에 찍힌 글자에서 금액을 읽는다. 콤마도 글자도 버린다. */
export function readAmount(text) {
  return Number(String(text ?? "").replace(/\D/g, ""));
}

/** 입력하는 동안 콤마를 붙인다. 넣을 수 없는 크기는 애초에 들어가지 않는다. */
export function formatAmountInput(text) {
  const amount = Math.min(readAmount(text), MAX_AMOUNT);
  return amount ? formatMoney(amount) : "";
}

/** 저장할 수 있는 금액인가. */
export function isValidAmount(amount) {
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_AMOUNT;
}
