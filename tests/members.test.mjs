import assert from "node:assert/strict";
import test from "node:test";

import {
  PALETTE,
  getMemberColor,
  getMemberGoal,
  getMemberName,
  getMembers,
  normalizeAvatarColor,
  setMembers,
  toDisplayColor,
} from "../src/members.js";

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

test("색은 소문자 여섯 자리 HEX 로 맞춘다", () => {
  // 브라우저와 서버에 늘 같은 형식으로 보내야 같은 색을 두 가지로 저장하지 않는다.
  assert.equal(normalizeAvatarColor("#F2674B"), "#f2674b");
  assert.equal(normalizeAvatarColor("#f2674b"), "#f2674b");
  // 세 자리 축약형은 안 받는다. 서버 제약도 여섯 자리만 받는다.
  assert.equal(normalizeAvatarColor("#fff"), null);
  assert.equal(normalizeAvatarColor("red"), null);
  assert.equal(normalizeAvatarColor("#12345g"), null);
  assert.equal(normalizeAvatarColor(""), null);
  assert.equal(normalizeAvatarColor(null), null);
  assert.equal(normalizeAvatarColor(0x123456), null, "숫자는 색이 아니다");
});

test("색으로 style 속성을 빠져나가지 못한다", () => {
  /*
   * 이 색은 추이 범례에서 style="background:${color}" 안에 그대로 끼워 넣어진다.
   * HEX 가 아닌 값이 통과하면 따옴표를 닫고 나가 태그를 새로 만들 수 있다.
   * 서버의 check 제약이 1차로 막지만, 마이그레이션을 안 돌리면 언제든 느슨해진다.
   */
  for (const 공격 of [
    '#000" onload="alert(1)',
    "red;background:url(javascript:alert(1))",
    "#000;}</style><script>alert(1)</script>",
    "expression(alert(1))",
    "#00000000",
  ]) {
    const 결과 = toDisplayColor(공격);
    assert.equal(결과, PALETTE[0].value, `${공격} 이 그대로 나왔다`);
    assert.match(결과, /^#[0-9a-f]{6}$/);
  }
});

test("이상한 색은 기본색으로 돌아간다", () => {
  setMembers(두사람);
  assert.equal(getMemberColor("a"), "#f2674b");
  // 색이 비어 있는 사람도 화면에는 색이 있어야 한다.
  assert.equal(getMemberColor("b"), PALETTE[0].value);
  assert.equal(getMemberColor("없는사람"), PALETTE[0].value);
});

test("기본 색들은 모두 쓸 수 있는 값이다", () => {
  // 고르라고 내놓은 색이 정규화에서 걸리면 고르는 순간 기본색으로 튕긴다.
  for (const { value, label } of PALETTE) {
    assert.equal(normalizeAvatarColor(value), value, `${label} 이 규칙에 안 맞는다`);
  }
  assert.equal(new Set(PALETTE.map((c) => c.value)).size, PALETTE.length, "같은 색이 둘 있다");
});
