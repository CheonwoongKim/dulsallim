import assert from "node:assert/strict";
import test from "node:test";

import { 문서세우기, 태그들 } from "./helpers/dom.mjs";

/*
 * 가계부 목록의 한 줄. 서버가 준 값이 마크업이 되는 자리인데 여태 한 번도 안 돌려 봤다 —
 * ledger.js 안에 있어서 store 와 dom.js 를 함께 끌고 왔고, 그래서 소스 문자열로만 봤다.
 *
 * 그렇게 두는 동안 두 자리가 escapeHtml 없이 지나고 있었다.
 */

문서세우기();
const { createExpenseRow } = await import("../src/ui/expense-row.js");
const { setMembers } = await import("../src/members.js");

setMembers([{ id: "u1", name: "우리", color: "#20211e", goal: null }]);

const 지출 = (덮어쓰기 = {}) => ({
  id: "e1",
  date: "2026-08-01",
  member: "u1",
  category: "food",
  item: "커피",
  amount: 4500,
  createdAt: 1,
  ...덮어쓰기,
});

test("날짜로 속성을 닫고 나오지 못한다", () => {
  /*
   * formatShortDate 는 앞을 잘라내기만 한다 — 무엇을 넣든 그대로 나온다.
   * 서버의 date 열이 1차로 막지만, 그것만이 유일한 문이면 폰에 적어 둔 사본으로 들어온다.
   */
  const 행 = createExpenseRow(지출({ date: `2026-"><img src=x onerror=alert(1)>` }));
  assert.doesNotMatch(행.innerHTML, /<img src=x/, "날짜에 태그가 살아 있다");
  assert.match(행.innerHTML, /&lt;img/);
});

test("id 로 속성을 닫고 나오지 못한다", () => {
  // id 는 세 단추의 data- 속성에 들어간다. 하나라도 빠지면 그 자리로 새 태그가 열린다.
  const 행 = createExpenseRow(지출({ id: `e1" onfocus="alert(1)` }));
  assert.doesNotMatch(행.innerHTML, /onfocus="alert/);
  for (const 속성 of ["data-copy-id", "data-edit-id", "data-delete-id"]) {
    assert.match(행.innerHTML, new RegExp(`${속성}="e1&quot;`), `${속성} 가 안 걸러진다`);
  }
});

test("항목과 사람 이름도 그대로 넣지 않는다", () => {
  setMembers([{ id: "u9", name: `<b onmouseover="x">짝</b>`, color: "#20211e", goal: null }]);
  const 행 = createExpenseRow(지출({ member: "u9", item: `<script>alert(1)</script>` }));
  assert.doesNotMatch(행.innerHTML, /<script|<b onmouseover/);
  assert.match(행.innerHTML, /&lt;script&gt;/);
  assert.match(행.innerHTML, /&lt;b onmouseover/);
  setMembers([{ id: "u1", name: "우리", color: "#20211e", goal: null }]);
});

test("읽어 주는 이름에 필요한 것이 다 담긴다", () => {
  /*
   * 내용면은 단추다. 눈으로 보는 사람은 줄 전체를 한눈에 읽지만, 읽어 주는 사람에게는
   * 이 한 줄이 전부다. 날짜·사람·분류·항목·금액과 무엇을 하는 자리인지가 있어야 한다.
   */
  const 면 = 태그들(createExpenseRow(지출({ item: "커피" })).innerHTML, "button").at(-1);
  for (const 조각 of ["08.01", "우리", "커피", "4,500원", "대화 열기"]) {
    assert.ok(면["aria-label"].includes(조각), `읽어 주는 이름에 ${조각} 이 없다`);
  }
  // 읽어 주는 이름도 걸러진다 — 항목이 그대로 들어가는 자리다.
  const 못된것 = 태그들(createExpenseRow(지출({ item: `<b>x` })).innerHTML, "button").at(-1);
  assert.doesNotMatch(못된것["aria-label"], /<b>/);
});

test("대화가 있으면 개수를 보이고, 없으면 자리를 안 만든다", () => {
  // 상대가 남긴 말이 있다는 걸 목록에서 알아야 열어 볼 생각을 한다.
  const 있음 = createExpenseRow(지출(), { notes: 3 });
  assert.match(있음.innerHTML, /<span class="note-count">대화 3<\/span>/);
  assert.ok(있음.innerHTML.includes("대화 3개"), "읽어 주는 이름에도 있어야 한다");

  const 없음 = createExpenseRow(지출(), { notes: 0 });
  assert.doesNotMatch(없음.innerHTML, /note-count/);
  assert.doesNotMatch(없음.innerHTML, /대화 0/);
});

test("방금 넣은 것만 표를 단다", () => {
  assert.ok(createExpenseRow(지출(), { highlighted: true }).classList.contains("is-new"));
  assert.ok(!createExpenseRow(지출(), { highlighted: false }).classList.contains("is-new"));
  // 곁들임을 안 넘겨도 터지지 않는다. 부르는 쪽이 둘이다.
  assert.ok(!createExpenseRow(지출()).classList.contains("is-new"));
});

test("내용면은 단추다", () => {
  /*
   * div 였을 때는 클릭 위임으로만 대화가 열려, 키보드·스위치 사용자는 대화를 못 열었다.
   */
  const 면 = 태그들(createExpenseRow(지출()).innerHTML, "button").at(-1);
  assert.equal(면.type, "button");
  assert.ok(면.class.split(/\s+/).includes("expense-surface"));
});

test("행을 id 로 다시 찾을 수 있다", () => {
  // repaintExpenseRow 가 이 값으로 그 줄을 찾는다.
  assert.equal(createExpenseRow(지출({ id: "e7" })).dataset.id, "e7");
});

test("모르는 분류는 기타로 받는다", () => {
  // DB 에 check 제약이 있어 정상 경로로는 안 어긋나지만, 화면이 깨지느니 기타로 받는다.
  const 행 = createExpenseRow(지출({ category: "없는분류" }));
  assert.match(행.innerHTML, /기타/);
});
