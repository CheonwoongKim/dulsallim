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

test("폰에 적힌 색도 서버에서 온 것과 같은 잣대로 거른다", async () => {
  /*
   * 이 색은 추이 범례에서 style 속성 안에 이스케이프 없이 들어간다.
   * 서버로 들어오는 문은 data/remote.js 의 toMember 가 지키는데, 폰에 적어 둔 사본은
   * 그 문을 안 지나고 곧장 화면으로 간다. 문이 둘인데 하나만 지키고 있었다.
   */
  const { PALETTE } = await import("../src/members.js");
  clearSnapshot();
  // 손으로 적어 넣은 것처럼 흉내 낸다. 정상 경로로는 이런 값이 안 들어간다.
  localStorage.setItem(
    "dulsallim:snapshot",
    JSON.stringify({
      version: 1,
      userId: "u1",
      data: {
        ...데이터(),
        members: [
          { id: "u1", name: "천웅", color: '#000" onload="alert(1)', goal: null },
          { id: "u2", name: "짝", color: "red;}</style><script>alert(1)</script>#ffffff", goal: null },
          { id: "u3", name: "셋", color: "#12ABef", goal: null },
        ],
      },
    }),
  );

  const 꺼낸것 = readSnapshot("u1");
  assert.equal(꺼낸것.members[0].color, PALETTE[0].value, "따옴표를 닫고 나가는 색이 그대로 나왔다");
  assert.equal(꺼낸것.members[1].color, PALETTE[0].value, "6자리로 끝나는 값이 그대로 나왔다");
  // 멀쩡한 색은 살리되 형식만 맞춘다. 색 하나 때문에 어제 기록을 통째로 버리지 않는다.
  assert.equal(꺼낸것.members[2].color, "#12abef");
  assert.equal(꺼낸것.expenses.length, 1, "지출은 그대로 남아야 한다");
  for (const member of 꺼낸것.members) assert.match(member.color, /^#[0-9a-f]{6}$/);
});

test("색을 거르면서 다른 것을 흘리지 않는다", () => {
  // 구성원의 이름·목표와 나머지 꾸러미가 그대로 따라와야 한다.
  clearSnapshot();
  const 원본 = 데이터();
  writeSnapshot("u1", 원본);
  const 꺼낸것 = readSnapshot("u1");
  assert.deepEqual(꺼낸것.members, 원본.members, "정상 색이면 손대지 않은 것과 같아야 한다");
  assert.deepEqual(꺼낸것.expenses, 원본.expenses);
  assert.deepEqual(꺼낸것.wishes, 원본.wishes);
  assert.deepEqual(꺼낸것.noteCounts, 원본.noteCounts);
});
