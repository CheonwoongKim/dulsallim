import { spawn } from "node:child_process";
import { webkit } from "playwright";
const 주소 = "http://localhost:4180";
const 살아 = await fetch(주소).then(r=>r.ok).catch(()=>false);
const 서버 = 살아 ? null : spawn("node",["tools/mock-server.mjs","dist","4180"],{stdio:"ignore"});
for (let i=0;i<50 && !(await fetch(주소).then(r=>r.ok).catch(()=>false));i++) await new Promise(r=>setTimeout(r,100));
const b = await webkit.launch(); const p = await b.newPage({viewport:{width:393,height:852}});
await p.goto(주소,{waitUntil:"domcontentloaded"});
await p.fill("#login-email","we@example.com"); await p.fill("#login-password","swordfish");
await p.click("#login-submit"); await p.waitForSelector(".expense-item");
await p.click("#open-settings");
for (const ms of [0,100,200,400,800,1500]) {
  await p.waitForTimeout(ms ? 100 : 0);
  console.log(ms, await p.evaluate(() => {
    const s = document.querySelector("#settings-page");
    const b = document.querySelector("#open-wish").getBoundingClientRect();
    return { x: Math.round(b.x), 변형: getComputedStyle(s).transform.slice(0,40), 반: s.className, 애니: s.getAnimations().length };
  }));
}
await b.close(); 서버?.kill();
