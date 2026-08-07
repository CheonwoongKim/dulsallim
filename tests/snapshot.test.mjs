import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * 폰에 적어 두는 마지막 사본.
 *
 * 앱을 열면 서버에서 여섯 가지를 읽어 올 때까지 "불러오는 중" 만 보였다. 적어 둔 것을
 * 먼저 그리고 서버에서 온 것으로 덮는다 — 잠깐 옛 숫자가 보이는 값은 치른다.
 *
 * 여기서 지키는 것은 셋이다. 남의 것을 안 보여 준다 · 로그아웃하면 지운다 · 모양이 바뀌면 버린다.
 */

/** localStorage 가 없는 곳(node)에서 돌리려고 아주 작은 것을 세운다. */
function 가짜저장소() {
  const 통 = new Map();
  return {
    통,
    getItem: (k) => (통.has(k) ? 통.get(k) : null),
    setItem: (k, v) => 통.set(k, String(v)),
    removeItem: (k) => 통.delete(k),
  };
}

globalThis.localStorage = 가짜저장소();
const { readSnapshot, writeSnapshot, clearSnapshot } = await import("../src/data/snapshot.js");

const 데이터 = () => ({
  members: [{ id: "u1", name: "천웅", color: "#20211e", goal: null }],
  expenses: [{ id: "e1", date: "2026-08-01", member: "u1", category: "etc", item: "커피", amount: 4500, createdAt: 1 }],
  fixedCosts: [],
  applied: [],
  wishes: [],
  noteCounts: {},
});

test("적어 두고 그대로 꺼낸다", () => {
  clearSnapshot();
  writeSnapshot("u1", 데이터());
  const 꺼낸것 = readSnapshot("u1");
  assert.equal(꺼낸것.expenses[0].item, "커피");
  assert.equal(꺼낸것.members[0].name, "천웅");
});

test("남의 것은 안 꺼낸다", () => {
  clearSnapshot();
  writeSnapshot("u1", 데이터());
  /*
   * 한 폰을 둘이 쓸 수 있다. 열쇠 하나에 담으므로 꺼낼 때 누구 것인지 반드시 확인한다 —
   * 남의 가계부가 한 프레임이라도 보이면 안 된다.
   */
  assert.equal(readSnapshot("u2"), null);
  assert.equal(readSnapshot(""), null);
  assert.equal(readSnapshot(undefined), null);
});

test("모양이 바뀌면 버린다", () => {
  localStorage.setItem("dulsallim:snapshot", JSON.stringify({ version: 999, userId: "u1", data: 데이터() }));
  assert.equal(readSnapshot("u1"), null, "옛 모양을 새 화면에 밀어 넣으면 어디서 터질지 모른다");

  localStorage.setItem("dulsallim:snapshot", JSON.stringify({ version: 1, userId: "u1", data: { expenses: "지출아님" } }));
  assert.equal(readSnapshot("u1"), null, "반쯤 맞는 것을 올리느니 조금 기다린다");

  localStorage.setItem("dulsallim:snapshot", "{깨진 글자");
  assert.equal(readSnapshot("u1"), null);
});

test("지우면 없다", () => {
  writeSnapshot("u1", 데이터());
  clearSnapshot();
  assert.equal(readSnapshot("u1"), null, "가계부는 폰에 남겨 둘 것이 아니다");
});

test("너무 크면 안 적고, 옛것도 안 남긴다", () => {
  /*
   * localStorage 는 5MB 안팎이고 넘치면 예외가 난다. 못 적는 것은 다음에 조금 늦게 뜬다는
   * 뜻일 뿐이다 — 다만 반만 맞는 옛것을 남기면 그게 더 나쁘다.
   */
  writeSnapshot("u1", 데이터());
  const 큰것 = 데이터();
  큰것.expenses = Array.from({ length: 40000 }, (_, i) => ({
    id: `e${i}`, date: "2026-08-01", member: "u1", category: "etc", item: "아주 긴 이름".repeat(4), amount: i, createdAt: i,
  }));
  writeSnapshot("u1", 큰것);
  assert.equal(readSnapshot("u1"), null);
});

test("저장소를 못 쓰는 곳에서도 안 터진다", () => {
  const 원래 = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error("막힘"); },
    setItem() { throw new Error("막힘"); },
    removeItem() { throw new Error("막힘"); },
  };
  // 사파리 사생활 보호 모드처럼 저장소가 막힌 곳이 있다. 거기서도 앱은 떠야 한다.
  assert.doesNotThrow(() => readSnapshot("u1"));
  assert.doesNotThrow(() => writeSnapshot("u1", 데이터()));
  assert.doesNotThrow(() => clearSnapshot());
  assert.equal(readSnapshot("u1"), null);
  globalThis.localStorage = 원래;
});

test("시작할 때 적어 둔 것부터 그리고, 로그아웃·초기화에서 지운다", async () => {
  const store = await readFile(new URL("../src/store.js", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  // 읽어 온 것을 얹는 자리는 하나다. 서버에서 왔든 폰에서 왔든 같은 곳에 앉는다.
  assert.match(store, /function 얹기\(data\)/);
  assert.match(store, /export function hydrateFromSnapshot\(profile\)/);
  assert.match(store, /writeSnapshot\(profile\.id, data\)/);
  assert.match(store, /export function clearData\(\) \{\s*clearSnapshot\(\);/);
  assert.match(store, /resetHousehold\(\)[\s\S]*?clearSnapshot\(\)/);

  // 적어 둔 것으로 열었으면 그 위에 오류 판을 덮지 않는다 — 보이던 것이 통째로 사라진다.
  assert.match(app, /const 적어둔것으로 = hydrateFromSnapshot\(profile\)/);
  assert.match(app, /if \(화면열림\) showToast\(error\.message\);\s*else showDataGate/);
  // 화면 여는 일은 두 번 불러도 한 번만 붙어야 한다(듣는 자리를 붙이는 일이 섞여 있다).
  assert.match(app, /function 화면열기\(\) \{\s*if \(화면열림\) return;/);
});
