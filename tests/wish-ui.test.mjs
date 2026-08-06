import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { css, fn, html, source as app } from "./helpers/source.mjs";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migration-wish.sql", import.meta.url), "utf8");
const editMigration = await readFile(new URL("../supabase/migration-wish-edit.sql", import.meta.url), "utf8");

/**
 * 위시리스트 화면이 지켜야 하는 것들.
 *
 * 데이터 계층은 앞 갈래가 넣었고 wish-data.test.mjs 가 지킨다. 여기서는 화면만 본다 —
 * 홈의 세로 자리를 건드리지 않았는지, 서버가 준 값을 그대로 끼워 넣지 않는지,
 * 있는 부품을 다시 쓰는지.
 */

/** 홈(app-shell)만 잘라 낸다. 덮는 화면들은 그 뒤에 따로 선다. */
const 홈 = html.slice(
  html.indexOf('<div class="app-shell"'),
  html.indexOf('<section class="page" id="profile-page"'),
);

const 설정본문 = html.slice(
  html.indexOf('<section class="page" id="settings-page"'),
  html.indexOf("<dialog class=\"sheet\" id=\"entry-sheet\""),
);

test("머리 줄은 마이페이지로 되돌아갔고 위시는 설정 안에 있다", () => {
  /*
   * 한동안 위시를 머리 줄에 뒀다가 되돌렸다. 아직 다듬는 중인 것이 하루에도 몇 번 누르는
   * 자리를 차지할 이유가 없다. 마이페이지가 그 자리로 돌아오고 위시는 설정 안으로 들어갔다.
   */
  assert.match(html, /id="open-profile" aria-label="마이페이지"/);
  assert.doesNotMatch(html, /id="open-wish" aria-label="위시리스트"/, "위시가 아직 머리 줄에 있다");
  // 이름은 두 곳이 같아야 한다 — 설정의 줄과 화면 제목.
  assert.match(설정본문, /<strong>위시리스트<em class="beta">베타<\/em><\/strong>/);
  assert.match(html, /<h2 id="wish-page-title">위시리스트<\/h2>/);

  const 사람 = html.match(/id="open-profile" aria-label="마이페이지"[\s\S]*?<\/button>/)[0];
  assert.match(사람, /viewBox="0 0 24 24"/, "다른 아이콘과 같은 24 상자여야 한다");
  assert.doesNotMatch(사람, /fill="/, "선으로만 그린다 — 칠은 .icon-button svg 가 none 으로 정한다");
  assert.doesNotMatch(사람, /stroke="/, "색도 .icon-button svg 의 currentColor 를 따른다");
});

test("홈 화면의 세로 자리는 한 픽셀도 쓰지 않는다", () => {
  /*
   * 지출 목록이 393×852 에서 5줄, 430×932 에서 6줄 보이는 것이 이 화면의 약속이다.
   * 홈에 무엇이든 한 줄 얹으면 그만큼 목록이 밀린다. 위시는 홈에 흔적이 없어야 한다.
   */
  assert.equal([...홈.matchAll(/wish/gi)].length, 0, "홈에 위시가 끼어 있다");

  // 위시 화면은 가계부를 덮는 .page 다. 홈 안에 끼어 있으면 문서 길이가 늘어난다.
  assert.match(html, /<section class="page" id="wish-page"/);
  assert.ok(
    html.indexOf('id="wish-page"') > html.indexOf('<section class="page" id="profile-page"'),
    "위시 화면이 홈 안에 들어 있다",
  );
});

test("설정에서 위시가 열리고 로그아웃은 설정 맨 아래에 있다", () => {
  const 줄들 = [...설정본문.matchAll(/id="(open-fixed-sheet|open-wish|open-nag|push-row|open-reset-sheet|sign-out)"/g)]
    .map((m) => m[1]);
  // 위시는 아직 베타라 자주 쓰는 고정비보다 아래에 둔다.
  assert.ok(줄들.indexOf("open-wish") > 줄들.indexOf("open-fixed-sheet"), "위시가 고정비보다 위에 있다");
  assert.equal(줄들.at(-1), "sign-out", "로그아웃이 설정 맨 아래가 아니다");
  // 마이페이지가 머리 줄로 돌아갔으니 설정 안에 또 있으면 입구가 둘이 된다.
  assert.doesNotMatch(설정본문, /id="open-profile"/, "마이페이지 입구가 둘이다");
  assert.doesNotMatch(설정본문, /id="settings-avatar"/);

  const 마이페이지 = html.slice(
    html.indexOf('<section class="page" id="profile-page"'),
    html.indexOf('<section class="page" id="wish-page"'),
  );
  assert.doesNotMatch(마이페이지, /id="sign-out"/, "로그아웃이 마이페이지에 남아 있다");
  assert.match(마이페이지, /id="profile-form"/);
  assert.match(app, /elements\.openProfile\.addEventListener\("click", openProfilePage\)/);
  assert.match(app, /elements\.openWish\.addEventListener\("click", openWishPage\)/);

  /*
   * 베타 표는 이름 옆에 붙는다. 줄 하나를 더 쓰지 않고 "새것" 이라는 것만 알린다 —
   * 경고가 아니므로 붉은 계열을 그대로 쓰지 않고 옅게 푼다.
   */
  assert.match(css, /\.beta \{[\s\S]*?color-mix\(in srgb, var\(--accent\) 14%, var\(--white\)\)/);
  assert.match(css, /\.beta \{[\s\S]*?font-size: var\(--text-11\)/);
});

test("링크로 쓸 수 있는 주소만 통과한다", async () => {
  /*
   * escapeHtml 만으로는 못 막는다. `javascript:alert(1)` 에는 바꿀 글자가 하나도 없어
   * 그대로 href 에 들어가고, 누르면 그 코드가 우리 페이지에서 돈다.
   */
  const { safeHref } = await import("../src/ui/escape.js");
  for (const 못된값 of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "example.com",
    "",
    null,
  ]) {
    assert.equal(safeHref(못된값), null, `${못된값} 을 링크로 통과시켰다`);
  }
  assert.equal(safeHref("https://example.com/a"), "https://example.com/a");
  assert.equal(safeHref("http://example.com/a"), "http://example.com/a");
});

test("위시 화면은 서버가 준 값을 그대로 끼워 넣지 않는다", async () => {
  const 그리기 = await readFile(new URL("../src/ui/wish-list.js", import.meta.url), "utf8");

  // 서버에서 온 글자가 화면에 들어가는 자리는 하나도 빠짐없이 escapeHtml 을 지난다.
  for (const 값 of [
    "wish.id",
    // 기다리는 사람 이름도 여기로 들어간다 — byLine 이 담은 사람 옆에 붙여 한 줄로 낸다.
    "byLine(wish, waiting)",
    "wish.note",
    "href",
    "expense.item",
    "formatShortDate(expense.date)",
    "getMemberName(expense.member)",
  ]) {
    assert.ok(그리기.includes(`escapeHtml(${값})`), `${값} 을 그대로 화면에 넣고 있다`);
  }

  /*
   * 위시 이름은 innerHTML 을 아예 안 지난다 — 칸의 읽어 주는 이름과 시트 제목 둘 다
   * setAttribute·textContent 로 넣는다. 글자로 들어가지 않으니 태그가 될 일이 없다.
   */
  assert.match(그리기, /\.setAttribute\("aria-label", `\$\{wish\.name\} 자세히 보기`\)/);
  assert.match(그리기, /\.setAttribute\("aria-label", `\$\{wish\.name\} 더 보기`\)/);
  assert.doesNotMatch(그리기, /\$\{escapeHtml\(wish\.name\)\}/);
  assert.match(app, /elements\.wishDetailName\.textContent = wish\.name;/);

  /*
   * 서버 값을 통째로 끼워 넣은 자리가 없어야 한다.
   *
   * innerHTML 로 들어가는 자리만 본다. setAttribute·textContent 로 넘기는 값은 브라우저가
   * 글자로만 다뤄 태그가 될 수 없다 — 거기까지 막으면 안전한 코드를 못 쓰게 된다.
   */
  const 글자로짓는곳 = (그리기.match(/innerHTML = `[\s\S]*?`;/g) || []).join("\n");
  assert.ok(글자로짓는곳.length > 200, "innerHTML 자리를 못 찾았다 — 검사가 헛돈다");
  assert.doesNotMatch(글자로짓는곳, /\$\{wish\.[\w.]+\}/, "위시 값이 escapeHtml 없이 들어간다");
  assert.doesNotMatch(글자로짓는곳, /\$\{expense\.[\w.]+\}/, "지출 값이 escapeHtml 없이 들어간다");

  // 고를 지출의 id 는 글자로 엮지 않고 dataset 으로 건넨다 — 브라우저가 값으로만 다룬다.
  assert.match(그리기, /button\.dataset\.pickExpense = expense\.id;/);

  // 주소는 한 겹 더 받는다 — safeHref 가 먼저 http·https 가 아닌 것을 버린다.
  assert.match(그리기, /const href = safeHref\(wish\.url\);/);
  assert.match(그리기, /const image = safeHref\(wish\.imageUrl\);/, "그림 주소도 한 겹 더 받는다");
  assert.match(그리기, /rel="noopener noreferrer"/);

  /*
   * 담을 때도 통과한 것만 보낸다. 화면에서만 거르면 나중에 다른 화면이 그 값을 믿는다.
   *
   * 그 주소는 담긴 뒤 그림을 찾는 데도 다시 쓰인다. 두 곳이 같은 값을 봐야 하므로
   * 한 번만 걸러 이름을 붙여 둔다 — 서버로 가는 것과 그림을 찾는 것이 갈리면 안 된다.
   */
  assert.match(app, /const href = input\.url \? safeHref\(input\.url\) : null;/);
  assert.match(app, /\n\s+url: href,/, "거르지 않은 값이 서버로 간다");
  assert.match(app, /attachWishImage\(saved\.id, href\)/, "그림도 같은 값으로 찾아야 한다");
  // 고칠 때 링크가 그대로면 서버가 그림도 그대로 둔다. 비어 있을 때만 다시 찾는다.
  assert.match(app, /if \(href && !saved\.imageUrl\)/);
});

test("목록은 두 칸 그림만이고, 눌러야 자세히가 뜬다", () => {
  /*
   * 칸에 이름도 값도 안 적는다 — 두 칸에 늘어놓으면 글자가 들어갈 자리가 손톱만 해서
   * 읽히지도 않으면서 그림을 잘라먹는다.
   */
  const 칸 = fn("createWishTile");
  assert.match(칸, /\$\{shotMarkup\(wish\)\}/, "칸에 그림이 없다");
  assert.doesNotMatch(칸, /wish-detail-price|wish-note|formatMoney/, "칸에 글이 들어 있다");
  // 그림에는 글이 없으므로 읽어 주는 이름은 여기서 낸다.
  assert.match(칸, /aria-label", `\$\{wish\.name\} 자세히 보기`/);
  assert.match(칸, /data-open-wish="\$\{escapeHtml\(wish\.id\)\}"/);

  /*
   * 칸은 단추가 아니라 감싸는 자리다. 단추 안에 단추를 넣을 수 없어서 그림 단추와
   * ⋯ 단추를 나란히 놓는다.
   */
  assert.match(칸, /createElement\("div"\)/, "칸이 아직 단추 하나다");
  assert.match(css, /\.wish-tile \{[^}]*position: relative/);
  assert.match(css, /\.wish-more \{[\s\S]*?position: absolute/);
  // 이룬 것에는 ⋯ 를 안 붙인다. 끝난 줄이다.
  assert.match(칸, /wish\.state === "achieved"\s*\?\s*""/);

  const 격자 = css.match(/\.wish-list \{[\s\S]*?\n\}/)[0];
  assert.match(격자, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);

  // 세 자리가 같은 목록을 쓴다. ⋯ 를 먼저 봐야 겹친 두 단추가 갈린다.
  assert.match(app, /\[elements\.wishPursuing, elements\.wishList, elements\.wishAchieved\]/);
  const 목록누르기 = app.match(/const more = event\.target\.closest\("\[data-menu-wish\]"\);[\s\S]*?openWishDetail\(tile\.dataset\.openWish\)/)[0];
  assert.ok(
    목록누르기.indexOf("data-menu-wish") < 목록누르기.indexOf("data-open-wish"),
    "그림을 먼저 보면 ⋯ 를 눌러도 자세히가 뜬다",
  );
  assert.doesNotMatch(app, /elements\.wishList\.addEventListener\("pointerdown"/, "이 목록은 밀지 않는다");

  /*
   * 34 는 애플이 말하는 44 에 못 미친다. 동그라미를 키우면 그림을 그만큼 더 가리므로
   * 누를 자리만 넓힌다 — .icon-button 이 하는 것과 같은 방식이다.
   */
  assert.match(
    css,
    /\.wish-more::after \{[^}]*inset: calc\(\(var\(--tap-min\) - var\(--more-size\)\) \/ -2\)/,
    "⋯ 가 보이는 크기만큼만 눌린다",
  );
});

test("화면은 store 만 부른다 — 서버 질의를 새로 짜지 않았다", async () => {
  /*
   * 데이터 계층은 앞 갈래가 넣었다. 화면이 supabase 를 직접 부르기 시작하면
   * 실패 문구도 사본 갱신 시점도 두 벌이 되어 조용히 어긋난다.
   */
  const 화면들 = await Promise.all(
    ["../src/features/wish.js", "../src/ui/wish-list.js"].map((path) =>
      readFile(new URL(path, import.meta.url), "utf8"),
    ),
  );
  for (const 화면 of 화면들) {
    assert.doesNotMatch(화면, /from "\.\.\/supabase\.js"|from "\.\.\/data\//, "화면이 서버를 직접 부른다");
  }
  for (const 이름 of ["addWish", "agreeWish", "achieveWish", "removeWish", "getWishes"]) {
    assert.ok(화면들[0].includes(이름), `${이름} 을 store 에서 가져와 쓰지 않는다`);
  }
});

test("향하는 것은 서버가 정한 state 로만 가른다", () => {
  /*
   * 합의가 몇 개면 향하는 것이 되는지는 서버가 정한다(migration-wish.sql).
   * 화면이 사람 수를 세어 판정하면 두 폰이 같은 순간에 마지막 표를 던졌을 때 갈라진다.
   */
  const 기능 = fn("paintWishPage");
  assert.match(기능, /wish\.state === "pursuing"/);
  assert.match(기능, /wish\.state === "proposed"/);
  assert.match(기능, /wish\.state === "achieved"/);
  assert.doesNotMatch(기능, /agreementUserIds\.length ===/, "화면이 합의 수로 상태를 판정한다");
});

test("시트는 한 번에 한 장만 열린다", () => {
  /*
   * 닫는 길(closeActiveSheet)은 열린 시트를 하나씩 보고 열려 있으면 다 닫는다.
   * 두 장이 겹쳐 있으면 뒤로 한 번에 두 겹이 닫힌다 — 지출을 고르다 뒤로 갔을 때
   * 자세히까지 함께 닫혀 목록으로 튕겼다(계측: 이뤘어요 누른 뒤 열린 시트 두 장).
   *
   * 다음 시트를 올리기 전에 지금 것을 닫는다. 닫히는 연출과 겹치지 않게 한 박자 뒤다.
   */
  const 이룸열기 = fn("openAchieveSheet");
  assert.match(이룸열기, /closeWishDetail\(\);/, "자세히를 안 닫고 다음 시트를 올린다");
  assert.match(이룸열기, /setTimeout\(\(\) => showSheet\(elements\.wishAchieveSheet\), MENU_HANDOFF_MS\)/);
  assert.ok(
    이룸열기.indexOf("closeWishDetail") < 이룸열기.indexOf("showSheet"),
    "닫기보다 올리기가 먼저다",
  );

  // 메뉴에서 넘기는 둘도 같은 줄을 쓴다.
  for (const 이름 of ["editFromMenu", "dropFromMenu"]) {
    assert.match(fn(이름), /closeWishMenu\(\);[\s\S]*?MENU_HANDOFF_MS/, `${이름} 이 겹쳐 띄운다`);
  }
});

test("위시 화면과 시트는 있는 부품을 다시 쓴다", () => {
  // 새로 만들기 전에 있는 것을 먼저 찾는다. 부품이 갈라지면 화면끼리 조금씩 어긋난다.
  assert.match(html, /<section class="page" id="wish-page"/);
  assert.match(html, /<header class="page-head">[\s\S]*?id="wish-page-title"/);
  assert.match(html, /<button class="icon-button page-action" type="button" id="add-wish"/);
  assert.match(html, /<dialog class="sheet" id="wish-sheet"/);
  assert.match(html, /<form class="sheet-scroll" id="wish-form"/);
  // 이룰 지출을 고르는 줄은 설정 메뉴와 같은 .menu-row 다.
  assert.match(app, /button\.className = "menu-row"/);

  // 시트는 다른 시트와 같은 처리를 받아야 끌어 닫기·Esc·포커스 가두기가 함께 붙는다.
  for (const 시트 of ["wishSheet", "wishAchieveSheet"]) {
    assert.ok(
      new RegExp(`SHEETS = \\[[\\s\\S]*?elements\\.${시트}`).test(app),
      `${시트} 가 SHEETS 목록에 없다`,
    );
    assert.ok(
      new RegExp(`!elements\\.${시트}\\.hidden`).test(app),
      `${시트} 가 닫는 길에 걸려 있지 않다`,
    );
  }
  // 화면도 마찬가지 — 뒤로 가기와 로그아웃 정리가 이 목록을 따른다.
  assert.match(app, /pages: \[[\s\S]*?document\.querySelector\("#wish-page"\)/);
});

test("상대가 바꾼 위시도 열어 둔 화면에 그대로 온다", () => {
  /*
   * 구독은 wish_items·wish_agreements 를 이미 듣고 있다(앞 갈래). 다시 읽은 뒤
   * render() 가 열려 있는 화면을 맞추는데, 위시가 거기 없으면 상대의 "나도" 가 안 보인다.
   */
  assert.match(app, /if \(!elements\.wishPage\.hidden\) paintWishPage\(\);/);
});

test("그림 자리는 정사각이고 색은 담은 사람에게서 온다", () => {
  const 그리기 = fn("shotMarkup");
  assert.match(그리기, /getMemberColor\(wish\.createdBy\)/);
  assert.match(그리기, /const image = safeHref\(wish\.imageUrl\)/, "그림 주소도 한 겹 더 받는다");
  assert.match(그리기, /aria-hidden="true"/, "첫 글자는 읽어 주지 않는다 — 칸이 이름을 이미 낸다");
  assert.match(그리기, /referrerpolicy="no-referrer"/);

  const 자리 = css.match(/\.wish-shot \{[\s\S]*?\n\}/)[0];
  assert.match(자리, /aspect-ratio: 1/);
  assert.match(자리, /var\(--wish-tile, var\(--ink\)\)/, "사람 색이 없어도 투명해지지 않는다");
  // 자세히에서는 더 넓게 본다. 목록에서 손톱만 했던 것을 여기서 제대로 본다.
  assert.match(css, /\.wish-detail \.wish-shot \{[\s\S]*?aspect-ratio: 4 \/ 3/);
});


test("그림은 첫 글자 위에 덮이고, 안 오면 그 자리가 드러난다", () => {
  const 그리기 = fn("shotMarkup");
  // 글자를 지우고 그림을 넣는 것이 아니다. 둘 다 두고 그림이 위에 선다.
  assert.match(그리기, /escapeHtml\(letter\)\}\$\{/, "그림이 있으면 글자를 안 그린다");
  assert.match(그리기, /const image = safeHref\(wish\.imageUrl\)/, "그림 주소도 한 겹 더 받는다");
  assert.match(그리기, /referrerpolicy="no-referrer"/, "어디서 왔는지까지 남의 서버에 알릴 일이 없다");
  assert.match(그리기, /loading="lazy"/);

  // 남의 서버 그림은 언제든 사라진다. 깨진 그림 표시가 첫 글자를 가리면 안 된다.
  assert.match(app, /image\.addEventListener\("error", \(\) => image\.remove\(\), \{ once: true \}\)/);

  const 그림 = css.match(/\.wish-shot img \{[\s\S]*?\n\}/)[0];
  assert.match(그림, /position: absolute/);
  assert.match(그림, /object-fit: cover/, "늘여 맞추면 물건이 찌그러진다");
  assert.match(css, /\.wish-shot \{[\s\S]*?overflow: hidden/, "모서리 밖으로 그림이 삐져나온다");
});

test("그림 찾기는 담기를 붙잡지 않고, 못 찾아도 조용하다", () => {
  const 담기 = fn("handleWishSubmit");
  // 담기가 먼저 끝나야 한다. 남의 사이트를 읽는 데 몇 초가 걸린다.
  assert.ok(
    담기.indexOf("showToast(\"위시를 담았어요\")") < 담기.indexOf("attachWishImage"),
    "그림을 기다리느라 담기가 늦어진다",
  );
  assert.match(담기, /void attachWishImage\(/, "기다리면 시트가 그만큼 늦게 닫힌다");
  /*
   * 붙고 나면 다시 그린다. 목록은 담자마자 한 번 그려졌으니, 그때 없던 그림은 여기서
   * 다시 그리지 않으면 화면을 나갔다 들어와야 보인다 — 링크 읽기를 2.5초 늦춰 재 봤다.
   */
  assert.match(담기, /\.then\(\(image\) => \{\s*if \(image && !elements\.wishPage\.hidden\) paintWishPage\(\);/);

  /*
   * 이름은 실제로 있는 것이라야 한다. 한동안 이 자리가 그림얹기() 를 불렀는데 그런 함수는
   * 어디에도 없었다 — 링크를 넣어 담을 때마다 ReferenceError 가 나고 그림이 안 붙었다.
   * fn() 은 못 찾으면 빈 글자를 돌려주므로, 이름만 견주던 검사는 그것을 통과시켰다.
   */
  const 부르는이름 = [...담기.matchAll(/void (\w+)\(/g)].map((m) => m[1]);
  assert.ok(부르는이름.length > 0, "담기에서 뒤따라 부르는 것을 못 찾았다");
  for (const 이름 of 부르는이름) {
    assert.ok(
      new RegExp(`(function|const|let) ${이름}\\b`).test(app) || new RegExp(`^\\s+${이름},$`, "m").test(app),
      `${이름} 은 어디에도 없는 이름이다`,
    );
  }

  const 붙이기 = fn("attachWishImage");
  assert.match(붙이기, /if \(!image\) return null/, "못 찾은 것을 잘못으로 다루면 안 된다");
  assert.doesNotMatch(붙이기, /showToast/, "그림 없는 링크는 흔하다 — 말 걸 일이 아니다");

  // 서버에 못 적었으면 화면에도 얹지 않는다. 다음에 열면 없는 것이 맞다.
  assert.match(붙이기, /catch \{[\s\S]*?return null;/);
});

test("담을 때 못 붙은 그림은 화면 열 때 채운다", () => {
  // 기능이 생기기 전에 담은 것, 그때 상대가 안 받아 준 것이 여기 걸린다.
  assert.match(fn("openWishPage"), /void 빠진그림채우기\(\)/);

  const 채우기 = fn("빠진그림채우기");
  assert.match(채우기, /wish\.url && !wish\.imageUrl/, "주소가 없거나 이미 있는 것에 또 묻는다");
  assert.match(채우기, /!triedImage\.has\(wish\.id\)/, "못 찾은 것을 열 때마다 다시 묻는다");
  assert.match(채우기, /\.slice\(0, BACKFILL_LIMIT\)/, "한 번에 몇 개까지인지 정해 두지 않았다");
  assert.match(app, /const BACKFILL_LIMIT = 5;/);

  // 하나씩 간다. Promise.all 로 몰면 같은 서버에 한꺼번에 들어간다.
  assert.match(채우기, /for \(const wish of 빠진것\) \{[\s\S]*?await attachWishImage/);
  assert.doesNotMatch(채우기, /Promise\.all/);
});

test("남의 사이트에는 사람이 쓰는 이름표로 묻는다", async () => {
  const 함수 = await readFile(
    new URL("../supabase/functions/link-preview/index.ts", import.meta.url),
    "utf8",
  );
  /*
   * 정직하게 봇이라고 밝히면 한국 쇼핑몰이 거절한다 — 네이버 브랜드스토어 429, 쿠팡 403.
   * 실제로 재 보고 바꿨다. 되돌리면 그림이 조용히 안 붙는다.
   */
  const 이름표 = 함수.match(/"User-Agent":\s*\n?\s*"([^"]*)"/)[1];
  assert.doesNotMatch(이름표, /bot/i, "봇이라고 밝히면 네이버가 429 를 준다");
  assert.match(이름표, /^Mozilla\/5\.0 \(iPhone/);
  assert.match(함수, /"Accept-Language": "ko-KR/);
});

test("한마디는 담을 때 함께 들어가고, 없으면 자리를 안 만든다", () => {
  // 시트 칸 · DB check · 화면 검사가 같은 길이를 봐야 한다.
  assert.match(html, /id="wish-note" name="note" maxlength="100"/);
  assert.match(app, /const NOTE_LIMIT = 100;/);
  for (const sql of [schema, migration]) {
    assert.match(sql, /note\s+text check \(note is null or char_length\(trim\(note\)\) between 1 and 100\)/);
  }

  /*
   * maxlength 로도 막히지만 화면에서 다시 센다. 붙여넣기는 그 제한을 넘길 수 있고,
   * DB check 에 걸리면 "위시 저장에 실패했어요" 만 남아 무엇이 문제인지 모른다.
   */
  assert.match(fn("validateWishInput"), /note\.length > NOTE_LIMIT/);
  assert.match(app, /note: input\.note \|\| null/, "적은 것이 서버로 안 간다");

  // 없으면 빈 줄을 남기지 않는다. 남기면 격자의 카드 높이가 들쭉날쭉해진다.


  // 담아 둔 칸과 향하는 카드가 같은 것을 쓴다.
  assert.match(fn("createWishDetail"), /wish\.note \? `<p class="wish-detail-note">/);

  // 길이가 칸마다 다르면 격자 아래 선이 어긋난다. 두 줄에서 자른다.
  assert.match(css, /\.wish-note \{[\s\S]*?-webkit-line-clamp: 2/);
});

test("지우기는 한 번 묻는다", () => {
  /*
   * 밀어서 지우던 때는 밀고 누르는 두 동작이었는데 격자로 오면서 × 한 번이 됐다.
   * 그림 위 작은 단추라 스치듯 눌릴 수 있고, 지운 위시는 되돌릴 길이 없다.
   */
  assert.match(html, /<dialog class="sheet" id="wish-drop-sheet"/);
  assert.match(html, /<h2 id="wish-drop-title">정말 지울까요\?<\/h2>/);
  // 무엇을 지우는지 이름으로 못 박는다. 격자에서는 어느 칸을 눌렀는지 헷갈리기 쉽다.
  assert.match(html, /<p class="eyebrow" id="wish-drop-name"><\/p>/);
  assert.match(fn("askDropWish"), /elements\.wishDropName\.textContent = wish\.name/);

  // ⋯ 메뉴의 지우기가 묻기만 한다. 실제로 지우는 것은 그다음 시트의 단추다.
  assert.match(app, /elements\.wishMenuDrop\.addEventListener\("click", dropFromMenu\)/);
  // 메뉴를 먼저 닫고 다음 시트를 올린다. 닫는 사이에 비워지므로 무엇인지는 미리 붙잡는다.
  assert.match(fn("dropFromMenu"), /const id = menuWishId;[\s\S]*?closeWishMenu\(\);[\s\S]*?MENU_HANDOFF_MS/);
  assert.match(fn("editFromMenu"), /const id = menuWishId;[\s\S]*?closeWishMenu\(\);[\s\S]*?MENU_HANDOFF_MS/);
  assert.match(fn("closeWishMenu"), /menuWishId = null/, "닫고도 무엇을 골랐는지가 남는다");
  assert.match(app, /elements\.wishDropSubmit\.addEventListener\("click", dropWish\)/);
  assert.doesNotMatch(fn("askDropWish"), /removeWish/, "묻기가 곧바로 지운다");
  assert.match(fn("dropWish"), /if \(!droppingWishId\) return;/, "무엇을 지울지 없이 지운다");

  // 다른 시트와 같은 처리를 받아야 끌어 닫기·Esc·초점 가두기가 함께 붙는다.
  assert.match(app, /SHEETS = \[[\s\S]*?elements\.wishDropSheet/);
  assert.match(app, /!elements\.wishDropSheet\.hidden\) closeDropSheet\(\)/);
  // 닫으면 무엇을 지우려 했는지도 비운다. 남으면 다음에 엉뚱한 것이 지워진다.
  assert.match(fn("closeDropSheet"), /droppingWishId = null/);
});

test("자세히가 다 말한다 — 그림·값·한마디·올린 사람·링크", () => {
  assert.match(html, /<dialog class="sheet" id="wish-detail-sheet"/);
  const 자세히 = fn("createWishDetail");
  assert.match(자세히, /\$\{shotMarkup\(wish\)\}/);
  assert.match(자세히, /wish-detail-price/);
  assert.match(자세히, /wish\.note \?/, "한마디는 있을 때만");
  assert.match(자세히, /wish-detail-by/);
  assert.match(자세히, /const href = safeHref\(wish\.url\);/, "주소는 한 겹 더 받는다");

  /*
   * 큰 단추는 하나다 — 이뤘어요. 넷이 같은 무게로 늘어서면 이 시트를 무엇을 하러 열었는지가
   * 흐려진다. 열기·고치기·지우기는 그림으로 내려간다.
   */
  assert.match(자세히, /class="submit-button" type="button" data-achieve-wish/);
  assert.equal((자세히.match(/class="submit-button"/g) || []).length, 1, "큰 단추가 둘 이상이다");
  // "나도" 는 곁들이는 것이라 색이 물러난다. 상대가 아직 안 누른 것에만 붙는다.
  assert.match(자세히, /action === "agree"[\s\S]*?class="submit-button quiet" type="button" data-agree-wish/);

  /*
   * 링크는 이뤘어요 왼쪽에 작은 단추로 선다. 글자를 안 적는다 — "링크 열기" 라고 쓰면
   * 옆의 이뤘어요와 같은 무게가 되어 무엇이 이 시트의 일인지 흐려진다.
   * 모양은 큰 단추에서 오고 색만 물러난다. 링크는 여기서만 밖으로 나간다.
   */
  assert.match(fn("링크단추"), /class="submit-button quiet wish-detail-link" href=[\s\S]*?rel="noopener noreferrer" aria-label="링크 열기"/);
  assert.match(자세히, /<div class="wish-detail-do">\s*\$\{링크단추\(href\)\}\s*<button class="submit-button" type="button" data-achieve-wish/);
  // 이룬 것에는 이뤘어요가 없어 링크가 홀로 줄을 다 쓴다.
  assert.match(자세히, /이룸\s*\?\s*링크단추\(href\)/);
  assert.match(css, /\.wish-detail-do \{[^}]*display: flex/);
  assert.match(css, /\.wish-detail-do \.wish-detail-link \{[^}]*flex: 0 0 var\(--control-lg\)/);
  assert.match(css, /\.wish-detail-do \[data-achieve-wish\] \{[^}]*flex: 1/);

  // 고치기·지우기는 목록 칸의 ⋯ 로 갔다. 여기 남아 있으면 입구가 둘이 된다.
  assert.doesNotMatch(자세히, /data-edit-wish|data-remove-wish/, "손보는 동작이 자세히에 남아 있다");

  // 어느 자리인지 시트가 스스로 말한다. 목록의 이름표는 여기에 없다.
  assert.match(fn("자리이름"), /wish\.state === "pursuing" \? "함께 바라는 것" : "담아 둔 것"/);

  // 이룬 것에는 이뤘어요를 안 붙인다. 끝난 줄이다.
  assert.match(자세히, /const 이룸 = wish\.state === "achieved";/);
  assert.doesNotMatch(자세히, /이룸\s*\?\s*[^:]*data-achieve-wish/, "이룬 것에 이뤘어요가 붙는다");

  // 열려 있는 동안 상대가 바꾸면 따라 그린다 — 진척도 단추도 달라진다.
  assert.match(fn("paintWishPage"), /if \(!elements\.wishDetailSheet\.hidden\) paintWishDetail\(\);/);
  assert.match(app, /SHEETS = \[[\s\S]*?elements\.wishDetailSheet/);
  assert.match(app, /!elements\.wishDetailSheet\.hidden\) closeWishDetail\(\)/);
});

test("고치기는 담기 시트를 다시 쓰고, 말과 값만 갈아 끼운다", () => {
  const 열기 = fn("openWishEditSheet");
  // 시트를 하나 더 만들지 않는다. 적는 칸이 똑같다.
  assert.match(열기, /openWishSheet\(\);/);
  assert.match(열기, /elements\.wishSheetTitle\.textContent = "무엇을 고칠까요\?"/);
  assert.match(열기, /elements\.wishSubmitLabel\.textContent = "저장"/);
  for (const 칸 of ["wishName", "wishUrl", "wishPrice", "wishNote"]) {
    assert.ok(열기.includes(`elements.${칸}.value`), `${칸} 에 지금 값이 안 채워진다`);
  }

  // 담기로 열면 반드시 되돌아온다. 안 그러면 다음 담기가 남의 것을 덮어쓴다.
  const 담기열기 = fn("openWishSheet");
  assert.match(담기열기, /editingWishId = null;/);
  assert.match(담기열기, /elements\.wishSubmitLabel\.textContent = "담기"/);
  assert.match(fn("closeWishSheet"), /editingWishId = null/);

  // 같은 폼이 두 갈래로 나뉜다.
  assert.match(app, /고치는중 \? await editWish\(고치는중, 값\) : await addWish\(값\)/);
  assert.match(app, /showToast\(고치는중 \? "고쳤어요" : "위시를 담았어요"\)/);

  // 이룬 것은 못 고친다 — 이미 끝난 줄이다. 링크가 바뀌면 그림도 다시 찾게 비운다.
  for (const sql of [schema, editMigration]) {
    assert.match(sql, /if v_state = 'achieved' then\s+raise exception '이미 이룬 위시입니다'/);
    assert.match(sql, /image_url = case when url is not distinct from v_url then image_url else null end/);
  }
});

test("자세히에는 모은 돈도 퍼센트도 없다", () => {
  /*
   * 위시는 사고 싶은 것을 적어 두는 자리다. 얼마를 모았는지는 목표에서 지출을 뺀 어림이라
   * 볼 때마다 달라지는데, 그것이 물건 사진 밑에 붙어 있으니 무엇을 보는 시트인지 흐려졌다.
   *
   * 세는 쪽(src/wish-progress.js)은 남겨 둔다. 계산은 그대로 맞고, 나중에 다른 자리에서
   * 쓸 수 있다. 여기서는 그리지 않는다는 것만 지킨다.
   */
  const 그리기 = fn("createWishDetail");
  assert.doesNotMatch(그리기, /progress|percent|모음/, "자세히에 진척이 돌아왔다");
  // 부르는 곳이 없어야 한다. 세는 쪽은 남아 있으므로 이름만 찾으면 제 정의가 걸린다.
  assert.doesNotMatch(app, /from "[./]*wish-progress\.js"/, "화면이 다시 진척을 세고 있다");
  assert.doesNotMatch(css, /\.wish-progress/, "진척 막대 모양새가 남아 있다");
});

test("탭은 미달성 · 달성 둘이고, 미달성이 기본이다", () => {
  assert.match(html, /<div class="segmented-control segment-tabs" id="wish-tabs"/);
  assert.match(html, /data-wish-tab="open" aria-pressed="true">미달성/, "미달성이 기본이다");
  assert.match(html, /data-wish-tab="done" aria-pressed="false">달성/);

  const 그리기 = fn("paintWishPage");
  // 미달성에는 함께 바라는 것과 담아 둔 것이, 달성에는 이룬 것이 선다.
  assert.match(그리기, /elements\.wishOpenSection\.hidden = 달성중/);
  assert.match(그리기, /elements\.wishAchievedSection\.hidden = !달성중/);
  assert.match(그리기, /const pursuing = 달성중\s*\?\s*\[\]/, "달성 탭에는 함께 바라는 것이 없다");
  // 누른 탭 표시는 매번 다시 적는다.
  assert.match(그리기, /aria-pressed", String\(\(button\.dataset\.wishTab === "done"\) === 달성중\)/);
  assert.match(app, /let wishTab = "open";/);
});

test("함께 바라는 것은 여럿이 서고, 이룬 것에는 체크가 얹힌다", () => {
  assert.match(html, /<div class="wish-section" id="wish-pursuing-section" hidden>/);

  const 그리기 = fn("paintWishPage");
  assert.match(그리기, /\.filter\(\(wish\) => wish\.state === "pursuing"\)/);
  assert.doesNotMatch(그리기, /\.find\(\(wish\) => wish\.state === "pursuing"\)/);
  assert.match(그리기, /elements\.wishPursuingSection\.hidden = !pursuing\.length/);
  assert.match(그리기, /pursuing\.length > 1 \? `\(\$\{pursuing\.length\}\)` : ""/);

  /*
   * 이룬 것은 그림 위 체크로 갈린다. 표만 얹으면 밝은 사진 위에서 안 보이므로
   * 그림을 어둡게 깔고 그 위에 흰 체크를 놓는다.
   */
  assert.match(app, /wish\.state === "achieved" \? 이룸표 : ""/);
  assert.match(css, /\.wish-done \{[\s\S]*?inset: 0/);
  assert.match(css, /\.wish-done \{[\s\S]*?color-mix\(in srgb, var\(--ink\) 45%, transparent\)/);
  assert.match(css, /\.wish-done svg \{[\s\S]*?stroke: var\(--white\)/);
});
