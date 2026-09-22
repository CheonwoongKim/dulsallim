/**
 * 진짜 브라우저에서 재는 것들.
 *
 * node --test 쪽은 흉내 DOM 을 쓴다(tests/helpers/dom.mjs). 그것으로는 원리적으로 못 보는
 * 것이 있다 — 커서가 어디로 가는지, CSSOM 이 못된 값을 버리는지, 글자가 실제로 몇 px 인지.
 * 그 셋이 여기 있다. 나머지는 전부 저쪽이 더 빠르게 본다.
 *
 * npm test 에 안 넣는다. 저쪽은 2초에 끝나 늘 도는 문이고(CLAUDE.md §7), 브라우저를
 * 띄우는 값은 그 문 앞에 둘 값이 아니다. `npm run check` 가 둘을 함께 돈다.
 *
 * 아직 여기 없는 것: 위시 담기·나도·이룸의 화면 흐름, 그리고 로그아웃 뒤 화면이 비는지. 목 서버가 그 서버 함수들을 이제
 * 흉내 내므로 재려면 잴 수 있는데, 설정 → 위시로 들어가는 페이지 전환이 자리를 잡기 전에
 * 눌러 검사가 들쭉날쭉했다(버튼이 뷰포트 밖 x=417 에 있는 채로 잡힌다). 불안정한 검사를
 * 두면 붉은 것을 보고도 그냥 지나치게 되므로, 전환이 끝난 것을 제대로 기다리는 방법을
 * 찾은 뒤에 넣는다.
 *
 *   npm run test:browser            두 엔진에서
 *   npm run test:browser -- webkit  하나만
 */

import { spawn } from "node:child_process";
import process from "node:process";
import { chromium, webkit } from "playwright";

const 주소 = "http://localhost:4180";
const 엔진들 = { webkit, chromium };
const 고른것 = process.argv.slice(2).filter((a) => a in 엔진들);
const 돌릴것 = 고른것.length ? 고른것 : Object.keys(엔진들);

let 통과 = 0;
const 실패 = [];

const 검사 = async (이름, 몸) => {
  try {
    await 몸();
    통과 += 1;
    console.log(`  ✔ ${이름}`);
  } catch (오류) {
    실패.push(`${이름}: ${오류.message}`);
    console.log(`  ✖ ${이름}\n      ${오류.message.split("\n")[0]}`);
  }
};
const 같나 = (본것, 바란것, 말) => {
  if (본것 !== 바란것) throw new Error(`${말 ?? ""} — 본 것 ${JSON.stringify(본것)}, 바란 것 ${JSON.stringify(바란것)}`);
};
const 맞나 = (참인가, 말) => { if (!참인가) throw new Error(말); };

/**
 * 고정비 시트를 연다. 그 단추는 설정 화면 안에 있다.
 *
 * 페이지 안에서 직접 누른다. 설정으로 들어가는 전환이 자리를 잡기 전에 누르면 검사가
 * 들쭉날쭉했고(이 파일 머리에 적어 둔 그것이다), 여기서 재려는 것은 화면 전환이 아니라
 * 할부 폼이다. 전환을 기다리는 값을 여기서 치를 까닭이 없다.
 */
async function 고정비열기(page) {
  await page.evaluate(() => document.querySelector("#open-fixed-sheet").click());
  await page.waitForSelector("#fixed-sheet:not([hidden])");
}

/** 목 서버를 띄운다. 이미 떠 있으면 그것을 쓴다. */
async function 서버띄우기() {
  const 살아있나 = await fetch(주소).then((r) => r.ok).catch(() => false);
  if (살아있나) return null;
  const 아이 = spawn("node", ["tools/mock-server.mjs", "dist", "4180"], { stdio: "ignore" });
  for (let i = 0; i < 50; i += 1) {
    if (await fetch(주소).then((r) => r.ok).catch(() => false)) return 아이;
    await new Promise((풀기) => setTimeout(풀기, 100));
  }
  아이.kill();
  throw new Error("목 서버가 안 뜬다 — dist 를 먼저 구웠나?");
}

/** 로그인해서 목록이 뜬 상태까지. 재는 것은 그다음부터다. */
async function 열기(browser) {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  /*
   * 기다리는 값을 짧게 둔다. 기본 30초로 두면 한 걸음이 어긋났을 때 몇 분을 서 있는다 —
   * 무엇이 잘못됐는지 보려고 돌리는 것인데 그 사이 아무것도 안 보인다.
   */
  page.setDefaultTimeout(7000);
  const 콘솔오류 = [];
  page.on("pageerror", (e) => 콘솔오류.push(e.message));
  await page.goto(주소, { waitUntil: "domcontentloaded" });
  /*
   * 로그인 화면이 다 자리 잡은 뒤에 적는다. 커서가 첫 칸에 앉은 것이 그 표시다.
   *
   * domcontentloaded 는 boot() 이 끝나기 한참 전에 돌아온다. boot() 은 세션을 서버에
   * 물어본 뒤에야 showLoginScreen() 을 부르고, 그것은 폼을 비운 다음 60ms 뒤에 첫 칸으로
   * 커서를 옮긴다. 그 사이에 적으면 두 가지로 깨진다 — 적은 것이 reset 으로 지워지거나,
   * 비밀번호를 적는 도중에 커서가 이메일 칸으로 튀어 거기에 이어 붙는다.
   *
   * 뒤엣것이 실제로 났다. 이메일 칸이 "we@example.comswordfish" 가 되고 비밀번호는 빈 채로
   * 제출되어, "이메일과 비밀번호를 모두 입력해 주세요" 에 막혔다. 두 엔진을 이어 돌릴 때
   * 뒤엣것이 이 경주에서 자주 졌고, 그 탓에 검사 전체가 들쭉날쭉했다.
   *
   * 커서가 앉기를 기다리면 그 뒤로는 폼을 건드리는 것이 없다.
   */
  await page.waitForFunction(
    () => ["login-email", "login-password"].includes(document.activeElement?.id),
    null,
    { timeout: 15000 },
  );
  await page.fill("#login-email", "we@example.com");
  await page.fill("#login-password", "swordfish");
  await page.click("#login-submit");
  await page.waitForSelector(".expense-item", { timeout: 15000 });
  return { page, 콘솔오류 };
}

const 서버 = await 서버띄우기();
try {
  for (const 이름 of 돌릴것) {
    console.log(`\n${이름}`);
    // 앞 엔진이 건드린 것을 되돌린다. 안 그러면 두 번째 엔진이 다른 판에서 시작한다.
    await fetch(`${주소}/__reset`);
    const browser = await 엔진들[이름].launch();
    const { page, 콘솔오류 } = await 열기(browser);

    await 검사("로그인하면 이번 달 목록이 뜬다", async () => {
      같나(await page.locator(".expense-item").count(), 3, "지출 줄 수");
      /*
       * 합계는 0 에서 세어 올라간다. 다 오를 때까지 기다린다 —
       * 그냥 읽으면 세는 도중의 숫자를 잡는다(실제로 142,383 을 읽었다).
       */
      await page.waitForFunction(() => document.querySelector("#monthly-total").textContent === "754,800",
        null, { timeout: 5000 });
    });

    await 검사("여는 동안 콘솔이 조용하다", async () => {
      같나(콘솔오류.length, 0, `터진 것: ${콘솔오류.join(" / ")}`);
    });

    await 검사("시트를 닫으면 커서가 열었던 자리로 돌아온다", async () => {
      /*
       * 흉내 DOM 으로는 못 보는 것. 커서를 잃으면 키보드로 쓰는 사람은 시트를 닫는 순간
       * 화면 처음으로 튕겨, 다음 Tab 이 머리글부터 다시 짚는다.
       */
      /*
       * 키보드로 연다. WebKit 은 단추를 눌러도 포커스를 안 준다(Safari 의 오랜 동작) —
       * 마우스로 눌러 놓고 "커서가 돌아오나" 를 물으면 애초에 기억할 자리가 없다.
       * 이 검사가 지키려는 것은 키보드로 쓰는 사람의 자리다. 그러니 키보드로 연다.
       */
      await page.focus("#month-picker-trigger");
      await page.keyboard.press("Enter");
      await page.waitForSelector("#month-sheet:not([hidden])");
      await page.keyboard.press("Escape");
      // hidden 인 것은 waitForSelector 로 못 본다 — 그것은 보이기를 기다린다.
      await page.waitForFunction(() => document.querySelector("#month-sheet").hidden);
      /*
       * 커서는 닫히는 움직임이 끝난 뒤 돌아온다(afterMotion → requestAnimationFrame).
       * 곧바로 읽으면 BODY 를 본다 — 실제로 그렇게 읽고 없는 버그를 쫓을 뻔했다.
       * 안 돌아오면 여기서 시간이 다 되어 걸린다.
       */
      await page.waitForFunction(() => document.activeElement?.id === "month-picker-trigger",
        null, { timeout: 5000 });
      /*
       * 이 검사가 지키는 것은 "돌아온다" 는 사실이지 "우리 코드가 돌려준다" 가 아니다.
       * <dialog> 는 닫힐 때 브라우저가 스스로 되돌려 주기도 해서, ui/sheet.js 의 되돌리기를
       * 지워도 여기서는 안 걸린다(재 봤다). 사람에게 보이는 것을 지키는 자리로 둔다.
       */
    });

    await 검사("사람 색이 실제로 그 색으로 칠해진다", async () => {
      /*
       * 명부의 색은 style 속성 안에 들어가 아바타를 칠한다. 흉내 DOM 은 무엇을 넣어도
       * 글자로만 들고 있어 "정말 그 색이 되나" 를 못 본다 — 브라우저에게 물어야 안다.
       *
       * 앞서 여기서 <i> 를 새로 만들어 재던 때가 있었는데, 그건 앱 코드를 한 줄도 안 거쳐
       * 브라우저의 성질만 재는 검사였다. 지금은 앱이 그린 것을 본다.
       */
      const 칠 = await page.evaluate(() => {
        const 자리 = document.querySelector("#me-avatar");
        return { 계산: getComputedStyle(자리).backgroundColor, 속성: 자리.getAttribute("style") ?? "" };
      });
      // 목 서버가 우리에게 준 색이다(#20211e = rgb(32, 33, 30)).
      같나(칠.계산.replace(/\s/g, ""), "rgb(32,33,30)", "아바타가 명부의 색으로 안 칠해졌다");
      맞나(!/alert|<|javascript:/i.test(칠.속성), `style 에 이상한 것이 들어갔다: ${칠.속성}`);
    });

    await 검사("디자인 토큰이 실제로 먹는다", async () => {
      // 머리 줄 높이는 본 화면과 덮는 화면이 같아야 이어져 보인다(DESIGN.md §9).
      const 머리 = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--head-height").trim());
      같나(머리, "76px", "--head-height");
      // 머리 줄 안의 첫 칸이 그 높이를 쓴다. 줄 전체는 요약까지 품어 더 크다.
      const 실제 = await page.evaluate(() =>
        Math.round(document.querySelector(".app-header > *").getBoundingClientRect().height));
      맞나(Math.abs(실제 - 76) <= 2, `머리 줄 첫 칸이 ${실제}px — 토큰과 2px 넘게 어긋난다`);
    });

    await 검사("가로로 넘치는 곳이 없다", async () => {
      // 393px 은 요즘 아이폰 폭이다. 가로 스크롤이 생기면 한 손으로 못 쓴다.
      const 넘침 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      맞나(넘침 <= 0, `${넘침}px 넘친다`);
    });

    await 검사("할부를 등록하면 끝이 보인다", async () => {
      /*
       * 흉내 DOM 은 index.html 을 읽지 않아 이 폼을 통째로 못 본다. 시작월 고르개가
       * 실제로 채워지는지, 고른 달이 안내에 반영되는지, 목록 줄이 회차를 말하는지는
       * 여기서만 잰다.
       *
       * 날짜에 기대지 않게 짰다 — 결제일은 계산값(이번 달 또는 다음 달)에서 시작하므로
       * 언제 돌려도 아직 한 번도 안 낸 상태, 곧 `0/5회` 다.
       */
      await 고정비열기(page);
      await page.click("#add-fixed");
      await page.fill("#fixed-day", "25");
      await page.fill("#fixed-item", "소파");
      await page.fill("#fixed-amount", "300000");
      await page.fill("#fixed-months", "5");

      // 시작월은 고를 수 있어야 한다. 계산값이 먼저 들어와 있고, 그다음 달로 바꿔 본다.
      const 계산값 = await page.inputValue("#fixed-start-month");
      맞나(/^\d{4}-\d{2}$/.test(계산값), `시작월이 안 채워졌다: ${계산값}`);
      const [해, 달] = 계산값.split("-").map(Number);
      const 고른것 = 달 === 12 ? `${해 + 1}-01` : `${해}-${String(달 + 1).padStart(2, "0")}`;
      await page.selectOption("#fixed-start-month", 고른것);

      // 안내가 고른 달과 끝나는 달을 함께 말한다. 끝이 안 보이면 구독과 구분이 안 된다.
      const 안내 = await page.textContent("#fixed-hint");
      const [끝해, 끝달] = [고른것.slice(0, 4), Number(고른것.slice(5))].map(Number);
      const 끝 = 끝달 + 4 > 12 ? `${끝해 + 1}년 ${끝달 - 8}월` : `${끝해}년 ${끝달 + 4}월`;
      맞나(안내.includes(`${Number(고른것.slice(5))}월 25일부터 5개월`), `고른 달이 안내에 없다: ${안내}`);
      맞나(안내.includes(`${끝}까지`), `끝나는 달이 안내에 없다: ${안내} (바란 것 ${끝})`);

      await page.click("#fixed-submit");
      await page.waitForSelector("#fixed-list-view:not([hidden])");
      const 줄 = await page.locator(".fixed-item", { hasText: "소파" }).first().textContent();
      맞나(줄.includes("0/5회"), `목록이 회차를 안 말한다: ${줄.replace(/\s+/g, " ")}`);
      맞나(줄.includes(`${고른것.slice(2, 4)}.${고른것.slice(5)}`) || 줄.includes("까지"),
        `목록이 끝나는 달을 안 말한다: ${줄.replace(/\s+/g, " ")}`);

      // 끝을 안 적은 고정비(월세)는 지금까지처럼 다음 반영일만 말한다.
      const 월세 = await page.locator(".fixed-item", { hasText: "월세" }).first().textContent();
      맞나(!월세.includes("회"), `구독에 회차가 붙었다: ${월세.replace(/\s+/g, " ")}`);

      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.querySelector("#fixed-sheet").hidden);
    });

    await 검사("할부 줄이 가로로 안 넘친다", async () => {
      /*
       * 회차와 끝나는 달을 한 줄에 넣었다. 393px 에서 넘치면 잘려 읽힌다 —
       * 글자 폭은 흉내 DOM 이 원리적으로 못 보는 것이라 여기서 잰다.
       */
      await 고정비열기(page);
      const 넘침 = await page.evaluate(() => {
        const 줄 = [...document.querySelectorAll(".fixed-copy span")]
          .find((el) => el.textContent.includes("/5회"));
        return 줄 ? 줄.scrollWidth - 줄.clientWidth : -1;
      });
      맞나(넘침 === 0, `할부 줄이 ${넘침}px 넘친다`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.querySelector("#fixed-sheet").hidden);
    });

    await 검사("눌러서 대화를 연다", async () => {
      await page.evaluate(() => document.querySelectorAll(".expense-surface")[1].click());
      await page.waitForSelector("#notes-sheet:not([hidden])");
      // 남긴 말은 시트가 열린 뒤에 서버에서 온다. 곧바로 읽으면 빈 자리를 본다.
      await page.waitForFunction(() => document.querySelector("#note-list").textContent.includes("이건 뭐야?"),
        null, { timeout: 5000 });
      // 어느 지출의 대화인지 제목이 말해 준다.
      맞나((await page.textContent("#notes-title")).includes("택시"), "제목이 그 지출을 안 가리킨다");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.querySelector("#notes-sheet").hidden);
    });

    await browser.close();
  }
} finally {
  서버?.kill();
}

console.log(`\n통과 ${통과} · 실패 ${실패.length}`);
if (실패.length) { 실패.forEach((줄) => console.log(`  ${줄}`)); process.exit(1); }
