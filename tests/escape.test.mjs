import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml } from "../src/ui/escape.js";

/*
 * escapeHtml 은 innerHTML 앞을 지키는 자리다. 그런데 여태 "소스에 escapeHtml( 이라고
 * 적혀 있나" 만 보고 있었다 — 부르는 자리는 봤지만 정말 막히는지는 아무도 안 봤다.
 * 여기서는 실제로 돌려서 막히는 것을 확인한다.
 *
 * 같은 파일의 safeHref 는 tests/wish-ui.test.mjs 가 이미 돌려 보고 있어 여기서 또 하지 않는다.
 */

test("innerHTML 을 깨는 글자를 전부 바꾼다", () => {
  assert.equal(escapeHtml("<"), "&lt;");
  assert.equal(escapeHtml(">"), "&gt;");
  assert.equal(escapeHtml("&"), "&amp;");
  assert.equal(escapeHtml('"'), "&quot;");
  assert.equal(escapeHtml("'"), "&#039;");
});

test("여러 번 나와도 하나도 안 남긴다", () => {
  /*
   * 여기가 이 파일에서 제일 중요한 줄이다.
   *
   * replaceAll 을 replace 로 한 글자만 바꾸면 첫 번째만 바뀌고 나머지는 그대로 나간다.
   * 그런데 공격 문자열에 그 글자가 하나씩만 있으면 그 잘못이 통째로 숨는다 —
   * 실제로 그렇게 짰다가 리뷰에서 잡혔다. 그래서 일부러 여러 번 넣는다.
   */
  assert.equal(escapeHtml("<b>a</b><i>"), "&lt;b&gt;a&lt;/b&gt;&lt;i&gt;");
  assert.equal(escapeHtml("a&b&c&d"), "a&amp;b&amp;c&amp;d");
  assert.equal(escapeHtml(`"a" "b"`), "&quot;a&quot; &quot;b&quot;");
  assert.equal(escapeHtml("'a' 'b'"), "&#039;a&#039; &#039;b&#039;");
  // 다섯 글자가 뒤섞여 여러 번 나와도 위험한 글자는 하나도 안 남는다.
  // (&는 남는다 — &lt; 의 그 앰퍼샌드다. 그래서 글자표로 따로 견준다.)
  const 뒤섞인것 = escapeHtml(`<a href="x">&'</a><b>`);
  assert.doesNotMatch(뒤섞인것, /[<>"']/);
  assert.equal(뒤섞인것, "&lt;a href=&quot;x&quot;&gt;&amp;&#039;&lt;/a&gt;&lt;b&gt;");
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
  // 태그가 둘이다. 하나만 막으면 뒤엣것이 살아서 나간다.
  const 결과 = escapeHtml(`<img src=x onerror="alert(1)"><script>alert(2)</script>`);
  assert.doesNotMatch(결과, /</, "여는 꺾쇠가 남았다");
  assert.doesNotMatch(결과, />/, "닫는 꺾쇠가 남았다");
  assert.equal(
    결과,
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;",
  );
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
