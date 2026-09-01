import assert from "node:assert/strict";
import test from "node:test";

import { PALETTE, getMemberColor, getMemberGoal, getMemberName, getMembers, setMembers } from "../src/members.js";

/*
 * 색을 걸러 내는 쪽(normalizeAvatarColor·toDisplayColor)은 이미 돌려 보는 검사가 있다 —
 * tests/regressions.test.mjs 의 "서버가 준 아바타 색을 그대로 화면에 끼워 넣지 않는다" 와
 * "아바타는 기본 팔레트와 직접 고른 6자리 HEX를 함께 받는다". 여기서 또 하지 않는다.
 * 여기는 명부를 뒤져 이름·목표·색을 꺼내는 쪽만 본다. 그쪽은 아무도 돌려 본 적이 없었다.
 */

const 두사람 = [
  { id: "a", name: "우리", color: "#F2674B", goal: 500000 },
  { id: "b", name: "너와", color: null, goal: null },
];

test("이름을 못 찾아도 화면이 비지 않는다", () => {
  setMembers(두사람);
  assert.equal(getMemberName("a"), "우리");
  // 지운 사람의 지출이 남아 있을 수 있다. 빈칸보다 "알 수 없음" 이 낫다.
  assert.equal(getMemberName("없는사람"), "알 수 없음");
  assert.equal(getMemberName(undefined), "알 수 없음");
});

test("목표는 안 정했으면 null 이다", () => {
  setMembers(두사람);
  assert.equal(getMemberGoal("a"), 500000);
  // 0 과 "안 정함" 은 다르다. ?? 를 || 로 바꾸면 0 이 null 로 뭉개진다.
  assert.equal(getMemberGoal("b"), null);
  assert.equal(getMemberGoal("없는사람"), null);
  setMembers([{ id: "c", name: "영", color: "#20211e", goal: 0 }]);
  assert.equal(getMemberGoal("c"), 0, "0 을 정한 것과 안 정한 것을 구분해야 한다");
});

test("명부를 비우면 앞사람 흔적이 남지 않는다", () => {
  setMembers(두사람);
  setMembers([]);
  assert.deepEqual(getMembers(), []);
  assert.equal(getMemberName("a"), "알 수 없음");
});

test("명부에 들어가는 길에서 색을 한 번 거른다", () => {
  /*
   * 이 색은 추이 범례에서 style 속성 안에 이스케이프 없이 들어간다. 문은 둘이다 —
   * 서버에서 오는 길(data/remote.js 의 toMember)과 폰에 적어 둔 사본에서 오는 길
   * (data/snapshot.js). 문마다 막으면 새 문이 생길 때 다시 터지므로 목에서 막는다.
   *
   * getMemberColor 는 이미 걸러 내주는데 getMembers 만 날것을 내주고 있었다.
   * 추이는 getMembers 를 쓴다 — 그 하나로 샜다.
   */
  setMembers([
    { id: "a", name: "우리", color: '#000" onload="alert(1)', goal: null },
    { id: "b", name: "너와", color: "red;}</style><script>alert(1)</script>#ffffff", goal: null },
    { id: "c", name: "셋", color: "#12ABef", goal: 100 },
  ]);

  for (const member of getMembers()) assert.match(member.color, /^#[0-9a-f]{6}$/, `${member.color} 가 새어 나왔다`);
  assert.equal(getMembers()[0].color, PALETTE[0].value);
  assert.equal(getMembers()[2].color, "#12abef", "멀쩡한 색은 형식만 맞춘다");
  // 색만 손대고 나머지는 그대로 따라와야 한다.
  assert.deepEqual(getMembers().map((m) => [m.id, m.name, m.goal]), [["a","우리",null],["b","너와",null],["c","셋",100]]);
});

test("이상한 색은 기본색으로 돌아간다", () => {
  setMembers(두사람);
  assert.equal(getMemberColor("a"), "#f2674b");
  // 색이 비어 있는 사람도 화면에는 색이 있어야 한다.
  assert.equal(getMemberColor("b"), PALETTE[0].value);
  assert.equal(getMemberColor("없는사람"), PALETTE[0].value);
});
