import assert from "node:assert/strict";
import test from "node:test";

import { 문서세우기 } from "./helpers/dom.mjs";

/*
 * 위시를 그리는 자리다. 서버가 준 글자가 마크업이 되는 자리가 이 저장소에서 가장 많다 —
 * 이름·주소·메모·지출 항목이 전부 여기를 지난다.
 *
 * 그런데 여태 이 파일을 readFile 로 읽어 `그리기.includes("escapeHtml(wish.note)")` 로
 * 봤다. 정규식보다도 못한 글자 대조라, 공백 하나만 들어가도 무너지고 반대로 죽은 코드
 * 안에 그 글자만 있어도 통과했다. 여기서는 실제로 그려서 나온 것을 본다.
 */

문서세우기();
const { createExpenseChoice, createWishDetail, createWishTile, formatAchievedOn, wishPriceLine } =
  await import("../src/ui/wish-list.js");
const { setMembers } = await import("../src/members.js");

setMembers([{ id: "u1", name: "우리", color: "#f2674b", goal: null }]);

const 위시 = (덮어쓰기 = {}) => ({
  id: "w1",
  name: "의자",
  url: null,
  note: null,
  estimatedPrice: 120000,
  imageUrl: null,
  createdBy: "u1",
  state: "idle",
  isGoal: false,
  achievedOn: null,
  ...덮어쓰기,
});

/* ── 서버가 준 글자 ────────────────────────────────────────── */

test("메모의 태그가 살아서 들어가지 않는다", () => {
  const 자세히 = createWishDetail(위시({ note: `<img src=x onerror="alert(1)"><b>둘</b>` }));
  assert.doesNotMatch(자세히.innerHTML, /<img|<b>/, "태그가 그대로 들어갔다");
  assert.match(자세히.innerHTML, /&lt;img/);
  // 두 번 나와도 하나도 안 남는다.
  assert.equal((자세히.innerHTML.match(/&lt;/g) || []).length >= 3, true);
});

test("이름은 글자로 엮지 않고 속성으로 넘긴다", () => {
  /*
   * innerHTML 을 지나면 태그가 되지만 setAttribute 로 넘기면 브라우저가 글자로만 다룬다.
   * 그래서 이름은 escapeHtml 을 안 거치는 대신 그린 글자에 아예 안 들어가야 한다.
   */
  const 칸 = createWishTile(위시({ name: `<img src=x onerror=alert(1)>` }));
  assert.doesNotMatch(칸.innerHTML, /<img src=x/, "이름이 그린 글자로 들어갔다");
  assert.match(칸.getAttribute("aria-label"), /<img src=x onerror=alert\(1\)>/);
});

test("이름 첫 글자만 따로 걸러 넣는다", () => {
  // 그림이 없으면 첫 글자를 쥔다. 그 글자도 태그가 될 수 있다.
  const 칸 = createWishTile(위시({ name: "<b>ㄱ" }));
  assert.match(칸.innerHTML, /&lt;/);
  assert.doesNotMatch(칸.innerHTML, /<b>/);
});

test("지출 고르기 줄도 서버 값을 그대로 넣지 않는다", () => {
  const 줄 = createExpenseChoice({
    id: "e1",
    item: `<script>alert(1)</script>`,
    date: "2026-08-01",
    member: "u1",
    category: "etc",
    amount: 4500,
  });
  assert.doesNotMatch(줄.innerHTML, /<script/);
  assert.match(줄.innerHTML, /&lt;script&gt;/);
  assert.equal(줄.dataset.pickExpense, "e1");
});

test("사람 이름도 그대로 넣지 않는다", () => {
  // 이름은 마이페이지에서 사람이 적는다. 서버가 글자를 막지 않는다.
  setMembers([{ id: "u9", name: `<b onmouseover="alert(1)">짝</b>`, color: "#20211e", goal: null }]);
  const 줄 = createExpenseChoice({ id: "e2", item: "커피", date: "2026-08-01", member: "u9", category: "etc", amount: 4500 });
  assert.doesNotMatch(줄.innerHTML, /<b onmouseover/);
  assert.match(줄.innerHTML, /&lt;b onmouseover/);
  setMembers([{ id: "u1", name: "우리", color: "#f2674b", goal: null }]);
});

test("날짜도 그대로 넣지 않는다", () => {
  /*
   * formatShortDate 는 앞을 잘라내기만 한다 — 무엇을 넣든 그대로 나온다.
   * 서버의 date 열이 1차로 막지만, 그것만이 유일한 문이면 폰에 적어 둔 사본으로 들어온다.
   */
  const 줄 = createExpenseChoice({
    id: "e3",
    item: "커피",
    date: `2026-<img src=x onerror=alert(1)>`,
    member: "u1",
    category: "etc",
    amount: 4500,
  });
  assert.doesNotMatch(줄.innerHTML, /<img src=x/);
  assert.match(줄.innerHTML, /&lt;img/);
});

test("id 로 속성을 닫고 나오지 못한다", () => {
  /*
   * id 는 data- 속성 안에 들어간다. 서버가 주는 uuid 라 정상 경로로는 이런 값이 없지만,
   * 속성 안에 넣는 자리는 모두 같은 잣대를 지나야 한다.
   */
  const 못된id = `w1" onfocus="alert(1)`;
  const 자세히 = createWishDetail(위시({ id: 못된id }), { action: "agree" });
  assert.doesNotMatch(자세히.innerHTML, /onfocus="alert/);
  assert.match(자세히.innerHTML, /&quot;/);
});

/* ── 주소 ─────────────────────────────────────────────────── */

test("누르면 코드가 도는 주소는 링크가 되지 않는다", () => {
  const 못된것 = createWishDetail(위시({ url: "javascript:alert(1)" }));
  assert.doesNotMatch(못된것.innerHTML, /<a /, "링크를 만들었다");
  assert.doesNotMatch(못된것.innerHTML, /javascript:/);

  const 멀쩡한것 = createWishDetail(위시({ url: "https://example.com/a?b=1" }));
  assert.match(멀쩡한것.innerHTML, /<a class="wish-detail-shot" href="https:\/\/example\.com\/a\?b=1"/);
  // 새 창으로 열되 원래 창을 넘겨주지 않는다.
  assert.match(멀쩡한것.innerHTML, /rel="noopener noreferrer"/);
});

test("그림 주소도 같은 잣대를 지난다", () => {
  assert.doesNotMatch(createWishTile(위시({ imageUrl: "javascript:alert(1)" })).innerHTML, /<img/);
  assert.match(createWishTile(위시({ imageUrl: "https://example.com/a.png" })).innerHTML, /<img src="https:\/\/example\.com\/a\.png"/);
  // 남의 서버로 우리 주소를 흘리지 않는다.
  assert.match(createWishTile(위시({ imageUrl: "https://example.com/a.png" })).innerHTML, /referrerpolicy="no-referrer"/);
});

test("그림이 안 오면 걷어내고 첫 글자를 드러낸다", () => {
  const 칸 = createWishTile(위시({ imageUrl: "https://example.com/a.png" }));
  const 그림 = 칸.querySelector(".wish-shot img");
  assert.equal(그림.지워졌나, false);
  그림.깨뜨리기();
  assert.equal(그림.지워졌나, true, "깨진 그림을 그대로 두면 첫 글자보다 못한 자리가 된다");
});

/* ── 상태 표시 ────────────────────────────────────────────── */

test("이룬 것·함께 바라는 것·지금 목표를 가려 붙인다", () => {
  const 있나 = (칸, 표) => 칸.innerHTML.includes(표);
  assert.ok(있나(createWishTile(위시({ state: "achieved" })), "wish-done"));
  assert.ok(있나(createWishTile(위시({ state: "pursuing" })), "wish-together"));
  assert.ok(있나(createWishTile(위시({ isGoal: true })), "wish-goal-tag"));
  // 이미 이룬 것에는 "지금 목표" 를 안 붙인다 — 향할 것이 남아 있지 않다.
  assert.ok(!있나(createWishTile(위시({ isGoal: true, state: "achieved" })), "wish-goal-tag"));
  // 자세히에는 안 붙인다. 그 하나만 보는 자리라 "여럿 가운데 이것" 이라고 말할 까닭이 없다.
  assert.ok(!있나(createWishDetail(위시({ isGoal: true })), "wish-goal-tag"));
});

test("이룬 것에는 손댈 단추를 두지 않는다", () => {
  const 이룬것 = createWishDetail(위시({ state: "achieved", achievedOn: "2026-03-14" }), { action: "goal" });
  for (const 단추 of ["data-achieve-wish", "data-edit-wish", "data-goal-wish"]) {
    assert.doesNotMatch(이룬것.innerHTML, new RegExp(단추), `${단추} 가 남아 있다`);
  }
  assert.match(이룬것.innerHTML, /2026\.03\.14 이룸/);
});

test("무엇을 할 수 있는지에 따라 단추가 갈린다", () => {
  assert.match(createWishDetail(위시(), { action: "agree" }).innerHTML, /data-agree-wish="w1"/);
  assert.doesNotMatch(createWishDetail(위시(), { action: "none" }).innerHTML, /data-agree-wish/);

  // 지금 목표 단추는 눌린 상태를 읽어 줄 수 있어야 한다.
  const 목표아님 = createWishDetail(위시({ isGoal: false }), { action: "goal" });
  assert.match(목표아님.innerHTML, /data-goal-wish="w1"[^>]*aria-pressed="false"/);
  const 목표임 = createWishDetail(위시({ isGoal: true }), { action: "goal" });
  assert.match(목표임.innerHTML, /aria-pressed="true"/);
});

/* ── 글월 ─────────────────────────────────────────────────── */

test("값을 안 적었으면 안 적었다고 한다", () => {
  assert.equal(wishPriceLine(위시({ estimatedPrice: 120000 })), "120,000원");
  assert.equal(wishPriceLine(위시({ estimatedPrice: null })), "값을 안 적었어요");
  // 0 원짜리 위시는 값을 적은 것으로 치지 않는다.
  assert.equal(wishPriceLine(위시({ estimatedPrice: 0 })), "값을 안 적었어요");
});

test("이룬 날은 점으로 잇는다", () => {
  assert.equal(formatAchievedOn("2026-03-14"), "2026.03.14");
  // 날이 없어도 터지지 않는다. 옛 기록에는 빈 것이 있다.
  assert.equal(formatAchievedOn(null), "");
  assert.equal(formatAchievedOn(undefined), "");
});
