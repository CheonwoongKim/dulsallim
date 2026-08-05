import assert from "node:assert/strict";
import test from "node:test";

import { css구조읽기 } from "./helpers/css-model.mjs";

/**
 * CSS 가드 검사들이 딛고 선 읽기 자체를 잰다.
 *
 * 여기가 선언 하나를 놓치면 그 자리의 날것 값은 검사를 통째로 지나간다 —
 * 검사는 초록인데 안전망에는 구멍이 난다. 그래서 손수 만든 읽기가 놓쳤던 자리들을
 * 그대로 재현해 둔다.
 */

const 찾기 = (source, property) => css구조읽기(source, "시험").선언들
  .filter((declaration) => declaration.property === property);

test("블록의 마지막 선언은 세미콜론이 없어도 읽는다", () => {
  // 옛 읽기는 세미콜론에서만 선언을 기록해서, 마지막 하나를 빼면 통째로 못 봤다.
  const 선언 = 찾기(".a {\n  color: red;\n  padding: 18px\n}\n", "padding");
  assert.deepEqual(선언.map((d) => [d.selector, d.value]), [[".a", "18px"]]);
});

test("중첩 CSS 안쪽도 제 선택자를 달고 읽힌다", () => {
  const [선언] = 찾기(".a {\n  & span { padding: 18px }\n}\n", "padding");
  assert.equal(선언.selector, "& span");
  assert.deepEqual(선언.contexts, [".a", "& span"]);
});

test("선택자 속 이스케이프 괄호가 그 뒤를 가리지 않는다", () => {
  /*
   * 옛 읽기는 괄호 깊이가 0 보다 크면 중괄호도 세미콜론도 건너뛰었다.
   * 짝 없는 `\(` 하나면 깊이가 영영 안 내려와, 합친 CSS 의 선언 1456 건 중
   * 1304 건만 남고 뒤쪽 세 파일이 통째로 사라졌다(계측).
   */
  const 선언 = 찾기(".w-\\( { color: red; }\n.b { padding: 18px; }\n", "padding");
  assert.deepEqual(선언.map((d) => d.selector), [".b"]);
});

test("url() 와 문자열 속 특수문자는 구조가 아니다", () => {
  // 세미콜론·중괄호가 값 안에 있다고 블록이 끊기면 그 뒤 선언을 잘못 읽는다.
  const source = `.a {\n  background: url("x;y{z}.png");\n  padding: 18px;\n}\n`;
  assert.deepEqual(찾기(source, "padding").map((d) => [d.selector, d.value]), [[".a", "18px"]]);
});

test("at-규칙은 감싼 것으로 남고 몸통 없는 것은 블록이 아니다", () => {
  const source = `@import "x.css";\n@media (prefers-reduced-motion: reduce) {\n  .a { transition-duration: 0.01ms; }\n}\n`;
  const { 블록들, 선언들 } = css구조읽기(source, "시험");
  assert.deepEqual(블록들.map((b) => b.selector), ["@media (prefers-reduced-motion: reduce)", ".a"]);
  assert.deepEqual(선언들[0].contexts, ["@media (prefers-reduced-motion: reduce)", ".a"]);
});

test("!important 는 값에 붙여 둔다", () => {
  // 떼어 두면 `z-index: var(--layer-sheet) !important` 가 단일 토큰으로 보여 검사를 지나간다.
  const [선언] = 찾기(".a { padding: var(--space-2) !important; }", "padding");
  assert.equal(선언.value, "var(--space-2) !important");
});

test("이유 주석은 같은 블록 안 앞자리와 선택자에 붙은 것만 센다", () => {
  const 이유 = (source) => 찾기(source, "padding")[0].이유주석;
  assert.equal(이유(".a { padding: 18px; }"), false);
  assert.equal(이유("/* 이유 */\n.a { padding: 18px; }"), true, "선택자에 붙은 주석은 이유다");
  assert.equal(이유(".a {\n  /* 이유 */\n  color: red;\n  padding: 18px;\n}"), true, "앞선 형제의 주석도 이유다");
  assert.equal(이유("/* 이유 */\n.b { color: red; }\n.a { padding: 18px; }"), false, "남의 블록 주석은 이유가 아니다");
  assert.equal(이유(".a {\n  /*  */\n  padding: 18px;\n}"), false, "빈 주석은 아무것도 설명하지 않는다");
});

test("블록 자리는 실제 중괄호를 가리킨다", () => {
  // :root 를 잘라 읽는 문서 대조 검사가 이 자리를 믿는다. 한 칸만 밀려도 조용히 헛돈다.
  const source = "/* 머리 */\n:root /* 사이 */ {\n  --a: 1px;\n}\n";
  const [블록] = css구조읽기(source, "시험").블록들;
  assert.equal(블록.selector, ":root");
  assert.equal(source[블록.open], "{");
  assert.equal(source[블록.close], "}");
  assert.match(source.slice(블록.open + 1, 블록.close), /--a: 1px;/);
});
