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
   * 한 번 치고 곧바로 누르지 않는다.
   *
   * 앱은 세션을 확인하고 나서 로그인 화면을 세우는데(app.js 의 boot), 그때 도는
   * form.reset() 이 방금 친 것을 지운다 — 로그인 화면이 뜨기를 기다렸다 쳐도, 인증
   * 이벤트가 뒤늦게 한 번 더 오면 그 사이에 비워진다. 그러면 빈 폼이 넘어가고
   * "이메일과 비밀번호를 모두 입력해 주세요" 에서 멈춘 채 목록을 기다리게 된다.
   * 크로미움에서 스무 번에 다섯 번 그랬다(이 가지 전에도 같은 비율이었다).
   *
   * 앱을 고칠 일이 아니다 — 사람은 화면이 선 뒤에 친다. 여기서 값이 남아 있는 것을
   * 확인하고 누르고, 지워졌으면 다시 친다.
   */
  await page.waitForSelector("#auth-gate:not([hidden])", { timeout: 15000 });
  for (let 번째 = 1; ; 번째 += 1) {
    await page.fill("#login-email", "we@example.com");
    await page.fill("#login-password", "swordfish");
    await page.click("#login-submit");
    try {
      await page.waitForSelector(".expense-item", { timeout: 8000 });
      return { page, 콘솔오류 };
    } catch (오류) {
      // 둘 다 본다. 지우는 일이 두 줄 사이에 끼면 한쪽만 비어 있다.
      const 비었나 = await page.evaluate(() =>
        !document.querySelector("#login-email").value || !document.querySelector("#login-password").value);
      // 비어 있지 않은데 안 들어갔으면 진짜로 무언가 깨진 것이다. 덮지 않는다.
      if (!비었나 || 번째 >= 3) throw 오류;
    }
  }
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
      같나(await page.locator(".expense-item").count(), 4, "지출 줄 수");
      /*
       * 합계는 0 에서 세어 올라간다. 다 오를 때까지 기다린다 —
       * 그냥 읽으면 세는 도중의 숫자를 잡는다(실제로 142,383 을 읽었다).
       *
       * 42,000 + 12,800 + 700,000 + (100,000 − 70,000) = 784,800.
       * 환급을 안 빼면 854,800 이 나온다.
       */
      await page.waitForFunction(() => document.querySelector("#monthly-total").textContent === "784,800",
        null, { timeout: 5000 });
    });

    await 검사("환급이 있는 줄은 실부담이 제일 크게 보인다", async () => {
      /*
       * 합계에 들어가는 숫자가 줄에서 가장 커야 한다 — 결제 금액이 더 크게 보이면
       * 보이는 숫자를 다 더해도 위의 총액이 안 나온다.
       *
       * 몇 px 인지는 브라우저에게 물어야 안다. 흉내 DOM 은 두 글자 크기를 다 "토큰 이름"
       * 으로만 들고 있어 어느 쪽이 큰지 모른다.
       */
      const 잰것 = await page.evaluate(() => {
        const 줄 = [...document.querySelectorAll(".expense-item")].at(-1);
        const 큰것 = 줄.querySelector(".expense-amount strong");
        const 작은것 = 줄.querySelector(".expense-amount small");
        return {
          실부담: 큰것?.textContent.trim() ?? "",
          곁들임: 작은것?.textContent.trim() ?? "",
          큰글자: 큰것 ? parseFloat(getComputedStyle(큰것).fontSize) : 0,
          작은글자: 작은것 ? parseFloat(getComputedStyle(작은것).fontSize) : 0,
        };
      });
      같나(잰것.실부담, "30,000원", "줄의 큰 숫자");
      맞나(잰것.곁들임.includes("100,000원") && 잰것.곁들임.includes("70,000원"),
        `결제 금액과 환급액이 둘 다 안 보인다: ${잰것.곁들임}`);
      맞나(잰것.큰글자 > 잰것.작은글자,
        `실부담 ${잰것.큰글자}px 이 곁들임 ${잰것.작은글자}px 보다 크지 않다`);
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

    await 검사("눌러서 연 자리도 목록과 같은 숫자를 말한다", async () => {
      // 목록이 3만 원이라 하고 대화 시트가 10만 원이라 하면 어느 쪽이 맞는지 알 수 없다.
      await page.evaluate(() => document.querySelectorAll(".expense-surface")[3].click());
      await page.waitForSelector("#notes-sheet:not([hidden])");
      const 제목 = await page.textContent("#notes-title");
      맞나(제목.includes("30,000원"), `대화 시트 제목이 실부담을 안 말한다: ${제목}`);
      맞나(!제목.includes("100,000원"), `대화 시트 제목이 결제 금액을 말한다: ${제목}`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.querySelector("#notes-sheet").hidden);
    });

    await 검사("분석에서 펴 본 줄도 실부담을 말한다", async () => {
      // 분류 합계는 실부담인데 그 아래 펴진 줄이 결제 금액이면, 줄을 더해도 위 숫자가 안 나온다.
      await page.evaluate(() => document.querySelector("#open-analysis").click());
      await page.waitForSelector("#analysis-page:not([hidden])");
      await page.waitForTimeout(400);
      await page.evaluate(() => document.querySelector('.analysis-row[data-category="medical"]').click());
      await page.waitForSelector(".analysis-detail-row");
      const 줄 = await page.evaluate(() => {
        const r = document.querySelector(".analysis-detail-row");
        return { 금액: r.querySelector("b").textContent, 곁들임: r.querySelector("small").textContent };
      });
      같나(줄.금액, "30,000원", "펴진 줄의 금액");
      맞나(줄.곁들임.includes("70,000원"), `얼마를 돌려받았는지 안 보인다: ${줄.곁들임}`);
      await page.evaluate(() => document.querySelector("#analysis-page [data-close-page]").click());
      await page.waitForFunction(() => document.querySelector("#analysis-page").hidden);
    });

    /*
     * ── 쓰기 경로 ──────────────────────────────────────────────
     *
     * 폼이 환급액을 아예 안 보내게 고쳐도 node 쪽 검사는 전부 초록이었다. 그쪽은 흉내 DOM
     * 이라 폼 모듈에 닿지 못한다(dom.js 가 #id 로 요소를 찾는데 흉내 DOM 은 그 고르개를
     * 모른다). 적는 칸부터 서버를 지나 다시 목록까지 한 바퀴 도는 것은 여기서만 볼 수 있다.
     */
    const 총액 = () => page.textContent("#monthly-total");
    const 마지막줄 = () => page.evaluate(() =>
      [...document.querySelectorAll(".expense-item")].at(-1).querySelector(".expense-amount").textContent.replace(/\s+/g, " ").trim());
    /** 그 지출을 수정으로 열어 환급액을 적고 저장한다. 빈 글자면 환급을 지운다. */
    const 환급적기 = async (id, 값) => {
      await page.evaluate((그것) => document.querySelector(`[data-edit-id="${그것}"]`).click(), id);
      await page.waitForSelector("#entry-sheet:not([hidden])");
      await page.fill("#expense-refunded", 값);
      await page.evaluate(() => document.querySelector("#expense-submit").click());
    };

    await 검사("수정으로 열면 적어 둔 환급액이 그대로 채워져 있다", async () => {
      await page.evaluate(() => document.querySelector('[data-edit-id="e4"]').click());
      await page.waitForSelector("#entry-sheet:not([hidden])");
      같나(await page.inputValue("#expense-amount"), "100,000", "결제 금액");
      같나(await page.inputValue("#expense-refunded"), "70,000", "환급액");
      // 남은 목표도 실부담으로 말한다. 결제 금액으로 세면 여기 숫자가 달라진다.
      맞나((await page.textContent("#goal-notice")).includes("557,200"),
        `남은 목표가 실부담 기준이 아니다: ${await page.textContent("#goal-notice")}`);

      // 치는 동안 따라 움직인다. 2만 원 더 돌려받으면 남은 목표도 2만 원 늘어난다.
      await page.fill("#expense-refunded", "90,000");
      await page.waitForFunction(() => document.querySelector("#goal-notice").textContent.includes("577,200"),
        null, { timeout: 3000 });
    });

    await 검사("결제한 것보다 많이 돌려받았다고 하면 저장이 막힌다", async () => {
      await page.fill("#expense-refunded", "200,000");
      await page.evaluate(() => document.querySelector("#expense-submit").click());
      await page.waitForTimeout(300);
      같나(await page.textContent("#refunded-error"), "환급액은 결제 금액보다 클 수 없어요.");
      맞나(!(await page.evaluate(() => document.querySelector("#entry-sheet").hidden)), "막았는데 시트가 닫혔다");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.querySelector("#entry-sheet").hidden);
    });

    await 검사("적은 환급액이 서버를 지나 합계까지 내려간다", async () => {
      await 환급적기("e4", "40,000");
      // 854,800 − 40,000. 폼이 환급을 안 보내면 854,800 에 머문다.
      await page.waitForFunction(() => document.querySelector("#monthly-total").textContent === "814,800",
        null, { timeout: 5000 });
      맞나((await 마지막줄()).startsWith("60,000원"), `줄이 실부담을 안 보인다: ${await 마지막줄()}`);
    });

    await 검사("환급을 지우면 결제 금액으로 돌아간다", async () => {
      await 환급적기("e4", "");
      await page.waitForFunction(() => document.querySelector("#monthly-total").textContent === "854,800",
        null, { timeout: 5000 });
      같나(await 마지막줄(), "100,000원", "곁들이는 칸이 남았다");
    });

    /*
     * ── 그림이 거짓말하는 자리 ────────────────────────────────
     *
     * 아래 둘은 숫자로는 안 잡힌다. 금액도 %도 맞게 적히는데 막대만 틀리게 그려진다.
     */
    await 검사("실부담 0원인 분류는 막대를 안 얻는다", async () => {
      // 병원만 전액 환급. 그 줄은 "0원 0%" 인데 최소 굵기 8px 이 남으면 쓴 것처럼 보인다.
      await 환급적기("e4", "100,000");
      await page.waitForFunction(() => document.querySelector("#monthly-total").textContent === "754,800",
        null, { timeout: 5000 });
      await page.evaluate(() => document.querySelector("#open-analysis").click());
      await page.waitForSelector("#analysis-page:not([hidden])");
      await page.waitForTimeout(400);
      const 잰것 = await page.evaluate(() => [...document.querySelectorAll(".analysis-row")].map((줄) => ({
        이름: 줄.querySelector(".analysis-name").textContent,
        금액: 줄.querySelector(".analysis-amount").textContent,
        막대: 줄.querySelector(".analysis-bar i")
          ? Math.round(줄.querySelector(".analysis-bar i").getBoundingClientRect().width) : null,
      })));
      const 의료 = 잰것.find((줄) => 줄.이름 === "의료");
      맞나(의료 === undefined || 의료.막대 === null,
        `0원 분류에 ${의료?.막대}px 막대가 그려졌다`);
      // 다른 줄은 멀쩡히 그려져야 한다 — 다 안 그리면 위 확인이 헛것이다.
      맞나(잰것.some((줄) => 줄.막대 > 0), "막대가 하나도 안 그려졌다");
    });

    await browser.close();
  }
} finally {
  서버?.kill();
}

console.log(`\n통과 ${통과} · 실패 ${실패.length}`);
if (실패.length) { 실패.forEach((줄) => console.log(`  ${줄}`)); process.exit(1); }
