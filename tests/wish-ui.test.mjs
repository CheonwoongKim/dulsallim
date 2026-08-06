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

test("머리 줄 아이콘은 사람에서 별로 바뀌었다", () => {
  // 이름은 두 곳이 같아야 한다 — 읽어 주는 이름과 화면 제목.
  assert.match(html, /id="open-wish" aria-label="위시리스트"/);
  assert.match(html, /<h2 id="wish-page-title">위시리스트<\/h2>/);
  assert.doesNotMatch(html, /id="open-profile" aria-label="마이페이지"/, "사람 아이콘이 남아 있다");

  const 별 = html.match(/id="open-wish"[\s\S]*?<\/button>/)[0];
  assert.match(별, /viewBox="0 0 24 24"/, "다른 아이콘과 같은 24 상자여야 한다");
  assert.doesNotMatch(별, /fill="/, "선으로만 그린다 — 칠은 .icon-button svg 가 none 으로 정한다");
  assert.doesNotMatch(별, /stroke="/, "색도 .icon-button svg 의 currentColor 를 따른다");

  /*
   * 별이 상자 안에서 놀아야 한다. 24 를 넘으면 잘리고, 너무 작으면 옆 아이콘보다 작아 보인다.
   * 다른 아이콘은 3~4px 안쪽에서 논다(분석 4~20, 설정 3~21).
   */
  const 좌표 = [...별.match(/ d="([^"]+)"/)[1].matchAll(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g)]
    .map(([, x, y]) => [Number(x), Number(y)]);
  assert.equal(좌표.length, 10, "정오각별은 꼭짓점이 열이다");
  const 가로 = 좌표.map(([x]) => x);
  const 세로 = 좌표.map(([, y]) => y);
  const 안에 = (값들) => Math.min(...값들) >= 2 && Math.max(...값들) <= 22;
  assert.ok(안에(가로), `가로 ${Math.min(...가로)}~${Math.max(...가로)} — 24 상자 안에서 놀아야 한다`);
  assert.ok(안에(세로), `세로 ${Math.min(...세로)}~${Math.max(...세로)} — 24 상자 안에서 놀아야 한다`);
});

test("홈 화면의 세로 자리는 한 픽셀도 쓰지 않는다", () => {
  /*
   * 지출 목록이 393×852 에서 4줄, 430×932 에서 6줄 보이는 것이 이 화면의 약속이다.
   * 홈에 무엇이든 한 줄 얹으면 그만큼 목록이 밀린다. 머리 줄 아이콘 하나를 갈아 끼운 것뿐이어야 한다.
   */
  const 흔적 = [...홈.matchAll(/wish/gi)];
  assert.equal(흔적.length, 1, `홈에 위시가 ${흔적.length}군데 있다 — 머리 줄 아이콘 하나뿐이어야 한다`);
  assert.match(홈, /id="open-wish"/);

  // 위시 화면은 가계부를 덮는 .page 다. 홈 안에 끼어 있으면 문서 길이가 늘어난다.
  assert.match(html, /<section class="page" id="wish-page"/);
  assert.ok(
    html.indexOf('id="wish-page"') > html.indexOf('<section class="page" id="profile-page"'),
    "위시 화면이 홈 안에 들어 있다",
  );
});

test("마이페이지는 설정 맨 위에서 열리고 로그아웃은 설정 맨 아래에 있다", () => {
  /*
   * 로그아웃은 예전에 머리 줄 아이콘 한 번이면 닿았다. 마이페이지 안에 두면 세 단계가 된다 —
   * 설정 → 마이페이지 → 로그아웃. 설정에 직접 두어 두 번이면 닿게 한다.
   */
  const 줄들 = [...설정본문.matchAll(/id="(open-profile|open-fixed-sheet|open-nag|push-row|open-reset-sheet|sign-out)"/g)]
    .map((m) => m[1]);
  assert.equal(줄들[0], "open-profile", "마이페이지가 설정 맨 위가 아니다");
  assert.equal(줄들.at(-1), "sign-out", "로그아웃이 설정 맨 아래가 아니다");

  // 아바타와 이름이 보여야 "내 것" 으로 읽힌다. 글자만 있으면 다른 메뉴와 구분되지 않는다.
  assert.match(설정본문, /id="settings-avatar"/);
  assert.match(설정본문, /id="settings-name"/);
  assert.match(app, /settingsAvatar\.style\.background = toDisplayColor\(profile\.avatar_color\)/,
    "아바타 색은 서버 값이라 toDisplayColor 를 지나야 한다");

  const 마이페이지 = html.slice(
    html.indexOf('<section class="page" id="profile-page"'),
    html.indexOf('<section class="page" id="wish-page"'),
  );
  assert.doesNotMatch(마이페이지, /id="sign-out"/, "로그아웃이 마이페이지에 남아 있다");
  // 화면 자체는 그대로 둔다. 여는 자리만 바뀐 것이다.
  assert.match(마이페이지, /id="profile-form"/);
  assert.match(app, /elements\.openProfile\.addEventListener\("click", openProfilePage\)/);
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
    "wish.name",
    "wish.id",
    "metaLine(wish)",
    "href",
    "waiting",
    "formatAchievedOn(wish.achievedOn)",
    "expense.item",
    "formatShortDate(expense.date)",
    "getMemberName(expense.member)",
  ]) {
    assert.ok(그리기.includes(`escapeHtml(${값})`), `${값} 을 그대로 화면에 넣고 있다`);
  }

  /*
   * 서버 값을 통째로 끼워 넣은 자리가 없어야 한다.
   * 이름을 합치는 metaLine 은 글자만 만들고, 그 결과가 붙는 자리에서 한 번에 걸린다.
   */
  assert.doesNotMatch(그리기, /\$\{wish\.[\w.]+\}/, "위시 값이 escapeHtml 없이 들어간다");
  assert.doesNotMatch(그리기, /\$\{expense\.[\w.]+\}/, "지출 값이 escapeHtml 없이 들어간다");

  // 고를 지출의 id 는 글자로 엮지 않고 dataset 으로 건넨다 — 브라우저가 값으로만 다룬다.
  assert.match(그리기, /button\.dataset\.pickExpense = expense\.id;/);

  // 주소는 한 겹 더 받는다 — safeHref 가 먼저 http·https 가 아닌 것을 버린다.
  assert.match(그리기, /const href = safeHref\(wish\.url\);/);
  assert.match(그리기, /if \(!href\) return "";/, "열 수 없는 주소는 글자로도 내보내지 않는다");
  assert.match(그리기, /rel="noopener noreferrer"/);

  /*
   * 담을 때도 통과한 것만 보낸다. 화면에서만 거르면 나중에 다른 화면이 그 값을 믿는다.
   *
   * 그 주소는 담긴 뒤 그림을 찾는 데도 다시 쓰인다. 두 곳이 같은 값을 봐야 하므로
   * 한 번만 걸러 이름을 붙여 둔다 — 서버로 가는 것과 그림을 찾는 것이 갈리면 안 된다.
   */
  assert.match(app, /const href = input\.url \? safeHref\(input\.url\) : null;/);
  assert.match(app, /\n\s+url: href,/, "거르지 않은 값이 서버로 간다");
  assert.match(app, /그림얹기\(saved\.id, href\)/, "그림도 같은 값으로 찾아야 한다");
  // 고칠 때 링크가 그대로면 서버가 그림도 그대로 둔다. 비어 있을 때만 다시 찾는다.
  assert.match(app, /if \(href && !saved\.imageUrl\)/);
});

test("담아 둔 것은 한 줄에 하나씩이고, 이 목록은 스와이프를 쓰지 않는다", () => {
  /*
   * 두 칸으로 놓아 봤더니 그림이 165 밖에 안 됐다. 위시리스트는 훑는 곳이 아니라
   * 들여다보는 곳이라 폭을 다 준다 — 393 에서 그림이 343×257 이 된다.
   */
  const 목록 = css.match(/\.wish-list \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(목록, /grid-template-columns/, "한 줄에 하나씩이면 열을 나눌 것이 없다");

  // 지우기는 밀어서가 아니라 ⋯ 메뉴로 간다. 격자든 한 열이든 이 목록은 밀지 않는다.
  assert.doesNotMatch(app, /wish-item swipe-row/);
  assert.doesNotMatch(app, /elements\.wishList\.addEventListener\("pointerdown"/);
  assert.match(app, /class="wish-more" type="button" data-wish-menu=/);
  assert.doesNotMatch(app, /class="wish-drop"/, "늘 떠 있던 x 표가 남아 있다");

  /*
   * 이름이 길어도 ⋯ 는 제자리에 있어야 한다. 밀려나면 손이 닿는 자리도 화면 밖으로 나간다.
   */
  assert.match(css, /\.wish-head \{[\s\S]*?justify-content: space-between/);
  assert.match(css, /\.wish-more \{[\s\S]*?flex: 0 0 auto/);
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
  const 기능 = app.slice(app.indexOf("function paintPursuing"), app.indexOf("export function openWishPage"));
  assert.match(기능, /wish\.state === "pursuing"/);
  assert.match(기능, /wish\.state === "proposed"/);
  assert.match(기능, /wish\.state === "achieved"/);
  assert.doesNotMatch(기능, /agreementUserIds\.length ===/, "화면이 합의 수로 상태를 판정한다");
});

test("나도는 보이는 크기보다 넓게 눌린다", () => {
  /*
   * 이 화면에서 가장 자주 누르는 곳이다. 보이는 높이는 38 이라 44 에 모자란다.
   * 넓히는 만큼을 숫자로 적으면 단추 높이를 바꿀 때 조용히 어긋나므로 한 값에서 낸다.
   */
  const 토큰 = (이름) => Number(css.match(new RegExp(`${이름}: (\\d+)px`))[1]);
  const 높이 = Number(css.match(/\.wish-agree \{[^}]*--agree-height: (\d+)px/)[1]);
  assert.match(
    css,
    /\.wish-agree::after \{[^}]*inset: calc\(\(var\(--tap-min\) - var\(--agree-height\)\) \/ -2\) 0/,
    "넓히는 만큼을 44 에서 역산할 것",
  );
  assert.match(css, /\.wish-agree \{[^}]*min-height: var\(--agree-height\)/);
  assert.ok(높이 + (토큰("--tap-min") - 높이) >= 44, "넓히고 나서도 44 에 못 미친다");

  // 카드 안 "이뤘어요" 는 넓힐 자리가 있어 그냥 44 로 세운다.
  assert.match(css, /\.wish-card-actions \.ghost-button \{[^}]*min-height: var\(--tap-min\)/);
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

test("그림 자리는 너비에 비례하고, 색은 담은 사람에게서 온다", () => {
  assert.match(app, /class="wish-shot is-\$\{모양\}" style="--wish-tile: \$\{escapeHtml\(getMemberColor\(wish\.createdBy\)\)\}/);
  assert.match(app, /aria-hidden="true"/, "그림 자리 글자는 읽어 주지 않는다 — 바로 옆에 이름이 있다");
  // 담아 둔 것은 4:3, 향하는 것은 더 납작한 16:9. 비율이 갈려야 서로 다른 것으로 읽힌다.
  assert.match(app, /shotMarkup\(wish, "photo"\)/);
  assert.match(app, /shotMarkup\(wish, "wide"\)/);

  const 자리 = css.match(/\.wish-shot \{[\s\S]*?\n\}/)[0];
  /*
   * 높이를 px 로 박지 않는다. 393 과 430 에서 칸 너비가 다른데 높이만 고정하면
   * 한쪽에서 그림이 납작해진다.
   */
  assert.doesNotMatch(자리, /height:/, "높이를 박으면 폭에 따라 그림이 찌그러진다");
  assert.match(css, /\.wish-shot\.is-photo \{[\s\S]*?aspect-ratio: 4 \/ 3/);
  assert.match(css, /\.wish-shot\.is-wide \{[\s\S]*?aspect-ratio: 16 \/ 9/);

  // 사람 색이 없거나 이상해도 자리가 투명해지지 않아야 한다.
  assert.match(자리, /var\(--wish-tile, var\(--ink\)\)/);
  assert.doesNotMatch(자리, /\d+px/, "그림 자리에 날 숫자가 남아 있다");
});

test("링크는 어디로 가는지 미리 말한다", async () => {
  const { domainOf } = await import("../src/ui/wish-list.js");
  assert.equal(domainOf("https://www.coupang.com/vp/products/1"), "coupang.com");
  assert.equal(domainOf("https://airbnb.co.kr/rooms/2"), "airbnb.co.kr");
  // 여기 올 일이 없지만(safeHref 를 지나온다) 와도 링크 구실은 해야 한다.
  assert.equal(domainOf("주소가 아님"), "링크 열기");
  assert.doesNotMatch(app, /">링크 열기<\/a>/, "모든 줄이 같은 말을 하고 있다");
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
    담기.indexOf("showToast(\"위시를 담았어요\")") < 담기.indexOf("그림얹기"),
    "그림을 기다리느라 담기가 늦어진다",
  );
  assert.match(담기, /void 그림얹기\(/, "기다리면 시트가 그만큼 늦게 닫힌다");

  const 붙이기 = fn("attachWishImage");
  assert.match(붙이기, /if \(!image\) return null/, "못 찾은 것을 잘못으로 다루면 안 된다");
  assert.doesNotMatch(fn("그림얹기"), /showToast/, "그림 없는 링크는 흔하다 — 말 걸 일이 아니다");

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
  assert.match(fn("noteMarkup"), /return note \? .*wish-note.* : ""/);

  // 담아 둔 칸과 향하는 카드가 같은 것을 쓴다.
  assert.equal((app.match(/\$\{noteMarkup\(wish\)\}/g) || []).length, 2);

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
  assert.match(app, /what === "edit" \? openWishEditSheet\(id\) : askDropWish\(id\)/);
  assert.match(app, /elements\.wishDropSubmit\.addEventListener\("click", dropWish\)/);
  assert.doesNotMatch(fn("askDropWish"), /removeWish/, "묻기가 곧바로 지운다");
  assert.match(fn("dropWish"), /if \(!droppingWishId\) return;/, "무엇을 지울지 없이 지운다");

  // 다른 시트와 같은 처리를 받아야 끌어 닫기·Esc·초점 가두기가 함께 붙는다.
  assert.match(app, /SHEETS = \[[\s\S]*?elements\.wishDropSheet/);
  assert.match(app, /!elements\.wishDropSheet\.hidden\) closeDropSheet\(\)/);
  // 닫으면 무엇을 지우려 했는지도 비운다. 남으면 다음에 엉뚱한 것이 지워진다.
  assert.match(fn("closeDropSheet"), /droppingWishId = null/);
});

test("⋯ 메뉴에서 고치기와 지우기로 갈린다", () => {
  assert.match(html, /<dialog class="sheet" id="wish-menu-sheet"/);
  // 무엇에 대한 메뉴인지 이름으로 못 박는다.
  assert.match(fn("openWishMenu"), /elements\.wishMenuName\.textContent = wish\.name/);

  // 메뉴를 닫고 나서 다음 시트를 올린다. 겹치면 뒤엣것이 먼저 잡힌다.
  const 고르기 = fn("pickWishMenu");
  assert.match(고르기, /closeWishMenu\(\);/);
  assert.match(고르기, /setTimeout\([\s\S]*?MENU_HANDOFF_MS\)/);
  assert.match(app, /const MENU_HANDOFF_MS = 220;/);

  // 다른 시트와 같은 처리를 받아야 끌어 닫기·Esc·초점 가두기가 함께 붙는다.
  assert.match(app, /SHEETS = \[[\s\S]*?elements\.wishMenuSheet/);
  assert.match(app, /!elements\.wishMenuSheet\.hidden\) closeWishMenu\(\)/);
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

test("진척 막대는 값을 적은 위시에만 서고, 분석 화면과 같은 두께다", () => {
  const 그리기 = fn("progressMarkup");
  assert.match(그리기, /if \(!target\) return "";/, "나눌 것이 없으면 그리지 않는다");
  assert.match(그리기, /width: \$\{percent\}%/);
  // 모은 돈은 넘겨도 그대로 알려 주고 막대만 가득에서 멈춘다 — 자르는 것은 계산 쪽이 한다.
  assert.match(그리기, /formatMoney\(saved\)/);
  assert.match(그리기, /missingGoal \? " · 월 지출 목표를 정하면 더 정확해요" : ""/);

  // 담아 둔 것과 향하는 것 둘 다 같은 막대를 쓴다.
  assert.equal((app.match(/\$\{progressMarkup\(wish, context\)\}/g) || []).length, 2);

  /*
   * 같은 뜻의 그림이 화면마다 두께가 다르면 서로 다른 것으로 읽힌다.
   * 분석 화면 분류 막대와 같은 --bar-thin 을 쓴다.
   */
  assert.match(css, /\.wish-progress-bar \{[\s\S]*?height: var\(--bar-thin\)/);
  assert.match(css, /\.analysis-bar \{[\s\S]*?height: var\(--bar-thin\)/);

  // 줄마다 다시 읽지 않는다. 지출 전부를 훑는 계산이라 한 번 모아 넘긴다.
  assert.match(fn("progressContext"), /expenses: getExpenses\(\), members: getMembers\(\)/);
});

test("사람 탭은 찬성한 사람으로 가르고, 분석의 사람 필터와 따로 논다", () => {
  assert.match(html, /<div class="segmented-control member-tabs" id="wish-members"/);

  /*
   * 담은 사람이 아니라 찬성한 사람으로 가른다. 혼자 담은 것은 담은 사람 탭에만 서고,
   * 상대가 "나도" 를 누르면 둘 다의 탭에 선다 — 그때부터 둘이 함께 바라는 것이니까.
   */
  const 거르기 = fn("그사람것");
  assert.match(거르기, /wish\.agreementUserIds\.includes\(wishMemberFilter\)/);
  assert.doesNotMatch(거르기, /createdBy/, "담은 사람으로 가르면 공동 위시가 한쪽에만 선다");
  assert.match(거르기, /if \(!wishMemberFilter\) return wishes;/, "전체는 거르지 않는다");

  /*
   * 분석의 사람 필터와 상태를 나눠 둔다. 지출을 볼 때와 갖고 싶은 것을 볼 때 보고 싶은
   * 사람이 같으리라는 법이 없고, 한쪽에서 고른 것이 다른 쪽을 조용히 바꾸면 놀란다.
   */
  assert.match(app, /let wishMemberFilter = null;/);
  assert.doesNotMatch(fn("setWishMemberFilter"), /setMemberFilter/);

  // 세 덩이 모두 걸러진 목록을 본다. 하나만 안 걸러지면 탭이 반쯤 듣는 것처럼 보인다.
  assert.match(fn("paintWishPage"), /const wishes = 그사람것\(getWishes\(\)\);/);
});
