import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { 서버인가 } from "../supabase/functions/send-push/guard.ts";

/*
 * 알림을 보내는 길과, 그 알림을 눌렀을 때 가는 길.
 *
 * 둘을 이으면 남의 폰에 우리 이름으로 아무 말이나 띄우고, 누르면 남의 집으로 데려갈 수
 * 있었다. 문 둘이 다 열려 있었다.
 *
 *   ① send-push 가 부르는 쪽을 안 봤다. Edge Functions 의 JWT 검사만으로는 모자라다 —
 *      anon 키도 제대로 된 JWT 라서 통과하는데 그 키는 JS 묶음에 공개돼 있다.
 *      (같은 자리를 link-preview 는 이미 막아 두고 "실제로 apikey 만 붙여 부르니 200 이
 *       나왔다" 고 적어 두었다. 여기만 빠져 있었다.)
 *   ② 서비스 워커가 알림에 실린 주소를 그대로 열었다. 절대 주소면 남의 곳으로 나간다.
 */

/* ── ① 보내는 길 ──────────────────────────────────────────── */

const 서버열쇠 = "sk-service-role-0123456789";

test("서버 열쇠를 든 부름만 받는다", () => {
  assert.equal(서버인가(`Bearer ${서버열쇠}`, 서버열쇠), true);
});

test("공개된 anon 열쇠로는 못 부른다", () => {
  // 이 키는 JS 묶음에 그대로 들어 있다. 아무나 들고 올 수 있다는 뜻이다.
  assert.equal(서버인가("Bearer anon-public-key", 서버열쇠), false);
});

test("머리글이 어설프면 받지 않는다", () => {
  for (const 머리 of [null, "", "Bearer", "Bearer ", 서버열쇠, `bearer ${서버열쇠}`, `Basic ${서버열쇠}`]) {
    assert.equal(서버인가(머리, 서버열쇠), false, `${JSON.stringify(머리)} 를 받아들였다`);
  }
});

test("한 글자만 달라도 안 받는다", () => {
  assert.equal(서버인가(`Bearer ${서버열쇠}x`, 서버열쇠), false, "뒤에 붙였는데 통과했다");
  assert.equal(서버인가(`Bearer ${서버열쇠.slice(0, -1)}`, 서버열쇠), false, "한 글자 잘랐는데 통과했다");
  assert.equal(서버인가(`Bearer ${서버열쇠.replace("0", "9")}`, 서버열쇠), false);
});

test("열쇠가 없으면 아무도 못 부른다", () => {
  // 환경 변수를 안 넣고 올린 판이다. 열어 두는 것보다 아무도 못 부르는 편이 낫다.
  assert.equal(서버인가(`Bearer ${서버열쇠}`, undefined), false);
  assert.equal(서버인가("Bearer ", ""), false);
});

/*
 * 견주는 시간이 글자에 따라 갈리지 않는 것(constant-time)은 여기서 안 잰다.
 * 재 보려 했더니 JIT 과 GC 에 따라 들쭉날쭉해 붉었다 파랬다 했다 — 그런 검사를 두면
 * 붉은 것을 보고도 그냥 지나치게 된다. 그 성질은 guard.ts 의 셈 자체가 지킨다
 * (길이가 달라도 끝까지 훑고, 중간에 안 끊는다). 아래 "한 글자만 달라도" 가 뜻을 지킨다.
 */

/* ── ② 누르면 가는 길 ─────────────────────────────────────── */

const sw = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const 우리집 = "https://dulsallim.app";
globalThis.self = { location: { origin: 우리집 } };
const 갈곳정하기 = new Function(`${sw.match(/function 갈곳정하기[\s\S]*?\n\}/)[0]}; return 갈곳정하기;`)();

test("우리 집 안이면 그대로 간다", () => {
  assert.equal(갈곳정하기("/").href, `${우리집}/`);
  assert.equal(갈곳정하기("/?month=2026-09").href, `${우리집}/?month=2026-09`);
  assert.equal(갈곳정하기(`${우리집}/wish`).href, `${우리집}/wish`);
});

test("남의 곳으로는 안 나간다", () => {
  /*
   * 알림은 우리 이름과 아이콘을 달고 뜬다. 누르면 열리는 창도 우리 화면처럼 읽힌다.
   * new URL(값, 우리주소) 는 값이 절대 주소면 그것을 그대로 쓴다 — 그게 이 자리의 함정이다.
   */
  for (const 못된값 of [
    "https://evil.example/phish",
    "http://evil.example",
    "//evil.example/x",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    `https://dulsallim.app.evil.example/x`,
  ]) {
    assert.equal(갈곳정하기(못된값).href, `${우리집}/`, `${못된값} 로 나갔다`);
  }
});

test("누르는 자리가 그 함수를 실제로 쓴다", () => {
  /*
   * 함수만 봐서는 모자라다. 고쳐 놓고 부르는 자리를 옛 줄로 되돌려도 검사가 통과했다 —
   * 실제로 그렇게 재 보고 알았다. 누르는 자리가 그 문을 지나는지 함께 본다.
   */
  const 누를때 = sw.match(/addEventListener\("notificationclick"[\s\S]*?\n\}\);/)[0];
  assert.match(누를때, /갈곳정하기\(/, "누르는 자리가 그 함수를 안 쓴다");
  assert.doesNotMatch(누를때, /new URL\([^)]*data\?\.url/, "알림에 실린 주소를 그대로 열고 있다");
});

test("값이 없거나 망가져도 우리 집으로 간다", () => {
  for (const 값 of [null, undefined, "", "   ", "%%%", {}, 123]) {
    assert.equal(갈곳정하기(값).origin, 우리집, `${JSON.stringify(값)} 에서 엉뚱한 데로 갔다`);
  }
});
