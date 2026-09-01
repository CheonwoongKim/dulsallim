import { spawn } from "node:child_process";
import { webkit } from "playwright";
const 주소="http://localhost:4180";
const 살아=await fetch(주소).then(r=>r.ok).catch(()=>false);
const 서버=살아?null:spawn("node",["tools/mock-server.mjs","dist","4180"],{stdio:"ignore"});
for(let i=0;i<50&&!(await fetch(주소).then(r=>r.ok).catch(()=>false));i++)await new Promise(r=>setTimeout(r,100));
const b=await webkit.launch(); const p=await b.newPage({viewport:{width:393,height:852}});
p.on("pageerror",e=>console.log("⚠",e.message.slice(0,90)));
await p.goto(주소,{waitUntil:"domcontentloaded"});
await p.fill("#login-email","we@example.com");await p.fill("#login-password","swordfish");
await p.click("#login-submit");await p.waitForSelector(".expense-item");
console.log("설정 누르기 전:", await p.evaluate(()=>({hidden:document.querySelector("#settings-page").hidden})));
await p.evaluate(()=>document.querySelector("#open-settings").click());
for (const _ of [1,2,3,4]) { await p.waitForTimeout(300);
  console.log(await p.evaluate(()=>({설정:document.querySelector("#settings-page").hidden, 앱:document.querySelector("#app-shell").hidden}))); }
await b.close();서버?.kill();
