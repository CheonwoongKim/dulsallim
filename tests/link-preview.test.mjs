import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { 갈수있나, 그림찾기, 쓸수있는주소 } from "../supabase/functions/link-preview/parse.ts";

/**
 * 링크에서 대표 그림을 찾는 서버 함수.
 *
 * 오가는 부분(fetch)은 Deno 위에서만 돌아 여기서 못 돌린다. 대신 판단하는 부분만
 * parse.ts 로 떼어 두고 그것을 시험한다 — 틀리면 가장 크게 다치는 자리가 거기다.
 */

const 기준 = new URL("https://shop.example.com/products/7");

test("우리 안쪽 망으로 가는 주소는 막는다", () => {
  /*
   * 이 함수는 "남이 준 주소를 서버가 대신 연다" 는 구조다. 그대로 두면 밖에서 못 닿는
   * 자리를 대신 열어 주는 통로가 된다(SSRF). 169.254.169.254 는 클라우드가 제 열쇠를
   * 내주는 자리라 여기가 뚫리면 열쇠가 통째로 나간다.
   */
  const 막을것 = [
    "http://localhost/x",
    "http://LOCALHOST/x",
    "http://api.localhost/x",
    "http://127.0.0.1/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/x",
    "http://192.168.0.1/x",
    "http://172.16.0.1/x",
    "http://172.31.255.255/x",
    "http://0.0.0.0/x",
    "http://[::1]/x",
    "http://printer.local/x",
    "http://vault.internal/x",
    "http://box.home.arpa/x",
    "http://239.1.1.1/x",
    "file:///etc/passwd",
    "ftp://example.com/x",
    "gopher://example.com/x",
  ];
  for (const 주소 of 막을것) {
    assert.equal(갈수있나(new URL(주소)), false, `${주소} 를 열어 준다`);
  }

  // 172.16~31 만 사설이다. 그 밖은 평범한 주소라 막으면 안 된다.
  const 열것 = [
    "https://www.coupang.com/vp/products/1",
    "http://172.15.0.1/x",
    "http://172.32.0.1/x",
    "http://11.0.0.1/x",
    "https://example.co.kr/x",
  ];
  for (const 주소 of 열것) {
    assert.equal(갈수있나(new URL(주소)), true, `${주소} 를 막는다`);
  }
});

test("og:image 를 속성 차례와 무관하게 찾는다", () => {
  // property 가 먼저 오는 흔한 형태
  assert.equal(
    그림찾기('<meta property="og:image" content="https://cdn.example.com/a.jpg">', 기준),
    "https://cdn.example.com/a.jpg",
  );
  // content 가 먼저 오는 형태. 이것 때문에 태그를 통째로 집고 안에서 따로 찾는다.
  assert.equal(
    그림찾기('<meta content="https://cdn.example.com/b.jpg" property="og:image">', 기준),
    "https://cdn.example.com/b.jpg",
  );
  // 홑따옴표와 대문자
  assert.equal(
    그림찾기("<META PROPERTY='OG:IMAGE' CONTENT='https://cdn.example.com/c.jpg'>", 기준),
    "https://cdn.example.com/c.jpg",
  );
  // name 으로 적는 곳도 있다(트위터 카드)
  assert.equal(
    그림찾기('<meta name="twitter:image" content="https://cdn.example.com/d.jpg">', 기준),
    "https://cdn.example.com/d.jpg",
  );
});

test("여럿 있으면 정해진 차례로 고른다", () => {
  const 문서 = `
    <meta name="twitter:image" content="https://cdn.example.com/twitter.jpg">
    <meta property="og:image" content="https://cdn.example.com/og.jpg">
    <meta property="og:image:secure_url" content="https://cdn.example.com/secure.jpg">
  `;
  // https 를 명시한 것이 가장 안전하다. 문서에 나온 차례가 아니라 우리가 정한 차례다.
  assert.equal(그림찾기(문서, 기준), "https://cdn.example.com/secure.jpg");
});

test("상대 주소는 그 페이지를 기준으로 편다", () => {
  assert.equal(
    그림찾기('<meta property="og:image" content="/img/hero.png">', 기준),
    "https://shop.example.com/img/hero.png",
  );
  assert.equal(
    그림찾기('<meta property="og:image" content="//cdn.example.com/hero.png">', 기준),
    "https://cdn.example.com/hero.png",
  );
  assert.equal(
    그림찾기('<meta property="og:image" content="hero.png">', 기준),
    "https://shop.example.com/products/hero.png",
  );
});

test("걸 수 없는 그림 주소는 없는 것으로 친다", () => {
  // 그대로 <img src> 에 넣으면 안 되는 것들. 화면에 닿기 전에 여기서 버린다.
  for (const 값 of [
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    '',
    '   ',
  ]) {
    assert.equal(
      그림찾기(`<meta property="og:image" content="${값}">`, 기준),
      null,
      `${값} 를 통과시킨다`,
    );
  }
  // og 가 아예 없는 문서
  assert.equal(그림찾기("<html><head><title>없다</title></head></html>", 기준), null);
  // 이름이 비슷하지만 다른 것
  assert.equal(그림찾기('<meta property="og:image:width" content="600">', 기준), null);
});

test("og 를 안 쓰는 옛 사이트는 link rel=image_src 로 받는다", () => {
  assert.equal(
    그림찾기('<link rel="image_src" href="https://cdn.example.com/old.jpg">', 기준),
    "https://cdn.example.com/old.jpg",
  );
  // 다만 og 가 있으면 그쪽이 먼저다.
  assert.equal(
    그림찾기(
      '<link rel="image_src" href="https://cdn.example.com/old.jpg"><meta property="og:image" content="https://cdn.example.com/new.jpg">',
      기준,
    ),
    "https://cdn.example.com/new.jpg",
  );
});

test("쓸수있는주소 는 http·https 만 남긴다", () => {
  assert.equal(쓸수있는주소("https://a.com/x.png", 기준), "https://a.com/x.png");
  assert.equal(쓸수있는주소("  https://a.com/x.png  ", 기준), "https://a.com/x.png");
  assert.equal(쓸수있는주소("javascript:alert(1)", 기준), null);
  assert.equal(쓸수있는주소("data:text/html,<b>", 기준), null);
});

test("서버 쪽 울타리가 그대로 서 있다", async () => {
  const 함수 = await readFile(
    new URL("../supabase/functions/link-preview/index.ts", import.meta.url),
    "utf8",
  );
  // 옮겨 가는 자리마다 다시 본다. fetch 에게 맡기면 우리가 못 본 사이에 안쪽으로 간다.
  assert.match(함수, /redirect: "manual"/);
  assert.match(함수, /if \(!갈수있나\(지금\)\) return null;/);
  // 큰 페이지에 통째로 매달리지 않는다.
  assert.match(함수, /const 읽을최대 = 256 \* 1024;/);
  assert.match(함수, /AbortSignal\.timeout\(기다릴시간\)/);
  // 실패는 "그림이 없는 것" 과 같이 다룬다. 담기는 이미 끝났다.
  assert.match(함수, /catch \{[\s\S]*?Response\.json\(\{ image: null \}/);

  /*
   * anon 키만으로는 못 부른다.
   *
   * Edge Functions 의 JWT 검사는 anon 키도 통과시킨다 — 그 키는 JS 묶음에 공개돼 있으니
   * 그것만 믿으면 아무나 우리 서버로 남의 사이트를 열 수 있다. 실제로 apikey 만 붙여
   * 부르니 200 이 나왔다. 토큰 뒤에 진짜 사람이 있는지 한 번 더 본다.
   */
  assert.match(함수, /if \(!\(await 사람인가\(req\)\)\) \{[\s\S]*?status: 401/);
  assert.match(함수, /await db\.auth\.getUser\(\)/);
  assert.match(함수, /return !error && Boolean\(data\.user\?\.id\)/);
  // 주소를 열기 전에 본다. 뒤에 두면 거절당할 요청도 이미 나간 뒤다.
  assert.ok(
    함수.indexOf("사람인가(req)") < 함수.indexOf("조심해서받기(주소"),
    "사람인지 보기 전에 남의 사이트를 연다",
  );
});

test("IPv4 를 감싼 IPv6 로도 안쪽에 못 간다", () => {
  /*
   * ::ffff:169.254.169.254 는 클라우드가 제 열쇠를 내주는 자리를 IPv6 꼴로 감싼 것이다.
   * 점 넷짜리만 찾던 때는 이것이 그냥 지나갔다 — 서버가 대신 열어 주는 구조라
   * 그 열쇠가 그대로 밖으로 나갈 수 있었다.
   *
   * WHATWG URL 이 그 꼴을 16진수로 바꿔 두기도 한다(::ffff:a9fe:a9fe). 둘 다 본다.
   */
  for (const 주소 of [
    "http://[::ffff:169.254.169.254]/",
    "http://[::ffff:a9fe:a9fe]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:10.0.0.1]/",
    "http://[::ffff:192.168.1.1]/",
  ]) {
    assert.equal(갈수있나(new URL(주소)), false, `${주소} 가 통과했다`);
  }
});

test("IPv6 규칙을 이름에 대지 않는다", () => {
  /*
   * fc00::/7·fe80::/10 을 호스트 이름 앞글자에 대고 보던 때가 있었다.
   * 그래서 fc2.com 같은 멀쩡한 곳이 막혔다 — 실제로 쓰는 사이트다.
   */
  for (const 주소 of ["https://fc2.com/item", "https://fdn.fr", "https://fe80shop.com", "https://fdiscount.example"]) {
    assert.equal(갈수있나(new URL(주소)), true, `${주소} 를 막았다`);
  }
  // 대괄호 안일 때는 그대로 막는다.
  for (const 주소 of ["http://[fc00::1]/", "http://[fd12::1]/", "http://[fe80::1]/", "http://[::1]/"]) {
    assert.equal(갈수있나(new URL(주소)), false, `${주소} 가 통과했다`);
  }
});

test("바깥 IPv6 는 막지 않는다", () => {
  // 남의 사이트가 IPv6 로만 오는 일이 있다. 안쪽이 아니면 열어 준다.
  assert.equal(갈수있나(new URL("http://[2606:4700::1111]/")), true);
  assert.equal(갈수있나(new URL("http://[2001:4860:4860::8888]/")), true);
});
