import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml, safeHref } from "../src/ui/escape.js";

/*
 * 이 둘은 innerHTML 과 href 앞을 지키는 자리다. 그런데 여태 "소스에 escapeHtml( 이라고
 * 적혀 있나" 만 보고 있었다 — 부르는 자리는 봤지만 정말 막히는지는 아무도 안 봤다.
 * 여기서는 실제로 돌려서 막히는 것을 확인한다.
 */

test("innerHTML 을 깨는 글자를 전부 바꾼다", () => {
  assert.equal(escapeHtml("<"), "&lt;");
  assert.equal(escapeHtml(">"), "&gt;");
  assert.equal(escapeHtml("&"), "&amp;");
  assert.equal(escapeHtml('"'), "&quot;");
  assert.equal(escapeHtml("'"), "&#039;");
});

test("앰퍼샌드를 먼저 바꾼다", () => {
  /*
   * 순서가 뒤집히면 `<` 가 `&lt;` 가 됐다가 그 앰퍼샌드가 다시 바뀌어 `&amp;lt;` 가 된다.
   * 태그는 안 열리니 터지진 않지만 사람 이름에 &가 있으면 화면에 &amp; 가 그대로 보인다.
   */
  assert.equal(escapeHtml("<"), "&lt;", "&lt; 가 다시 escape 되면 안 된다");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
  assert.equal(escapeHtml("&lt;"), "&amp;lt;", "이미 escape 된 글자는 한 번 더 바뀐다");
});

test("태그를 열려는 시도가 글자로 남는다", () => {
  const 공격 = `<img src=x onerror="alert(1)">`;
  const 결과 = escapeHtml(공격);
  assert.doesNotMatch(결과, /</, "여는 꺾쇠가 남았다");
  assert.doesNotMatch(결과, />/, "닫는 꺾쇠가 남았다");
  assert.equal(결과, "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

test("속성 안에서 따옴표를 닫고 나오지 못한다", () => {
  // data-item="${escapeHtml(값)}" 자리다. 따옴표가 살아 있으면 속성을 닫고 onerror 를 붙인다.
  const 결과 = escapeHtml(`" onerror="alert(1)`);
  assert.doesNotMatch(결과, /"/, "쌍따옴표가 남았다");
  // 홑따옴표로 감싼 속성도 있다.
  assert.doesNotMatch(escapeHtml("' onerror='alert(1)"), /'/, "홑따옴표가 남았다");
});

test("글자가 아닌 것을 받아도 터지지 않는다", () => {
  // 서버에서 온 값이 늘 문자열이라는 보장이 없다. 여기서 터지면 목록이 통째로 안 그려진다.
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(null), "null");
  assert.equal(escapeHtml(undefined), "undefined");
  assert.equal(escapeHtml(1234), "1234");
  // toString 이 꺾쇠를 내놓아도 막는다.
  assert.equal(escapeHtml({ toString: () => "<b>" }), "&lt;b&gt;");
});

test("사람이 여는 주소만 링크가 된다", () => {
  assert.equal(safeHref("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(safeHref("http://example.com"), "http://example.com/");
});

test("누르면 코드가 도는 주소를 막는다", () => {
  /*
   * escapeHtml 로는 못 막는다 — javascript:alert(1) 에는 바꿀 글자가 하나도 없어
   * 그대로 href 에 들어가고, 누르는 순간 그 코드가 우리 페이지 안에서 돈다.
   */
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("JavaScript:alert(1)"), null, "대문자로 섞어도 막아야 한다");
  assert.equal(safeHref("  javascript:alert(1)"), null, "앞의 공백으로 넘어가면 안 된다");
  assert.equal(safeHref("java\tscript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeHref("vbscript:msgbox(1)"), null);
  assert.equal(safeHref("file:///etc/passwd"), null);
});

test("주소가 아니면 링크로 만들지 않는다", () => {
  // 상대 주소는 기준이 없어 URL 이 던진다. 우리는 절대 주소만 링크로 받는다.
  assert.equal(safeHref("/내폴더/파일"), null);
  assert.equal(safeHref("example.com"), null, "규약이 없으면 주소가 아니다");
  assert.equal(safeHref(""), null);
  assert.equal(safeHref(null), null);
  assert.equal(safeHref(undefined), null);
  assert.equal(safeHref(123), null);
});
