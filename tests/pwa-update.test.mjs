import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPrecacheUrls, renderServiceWorker } from "../vite.config.js";

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

function readNamedFunction(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} 함수를 찾지 못했습니다`);
  const bodyStart = source.indexOf(") {", start) + 2;
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`${name} 함수의 끝을 찾지 못했습니다`);
}

const updaterSource = readNamedFunction(appSource, "registerPwaUpdater").replace("export ", "");
const registerPwaUpdater = Function(`${updaterSource}; return registerPwaUpdater;`)();

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type });
  }
}

const nextTask = () => new Promise((resolve) => setImmediate(resolve));

function makeEnvironment({ controlled = true } = {}) {
  const serviceWorker = new FakeEventTarget();
  serviceWorker.controller = controlled ? { state: "activated" } : null;

  const registration = {
    updateCalls: 0,
    async update() {
      this.updateCalls += 1;
    },
  };

  const calls = [];
  serviceWorker.register = async (...args) => {
    calls.push(args);
    return registration;
  };

  const windowTarget = new FakeEventTarget();
  const documentTarget = new FakeEventTarget();
  documentTarget.visibilityState = "visible";
  const locationTarget = {
    protocol: "https:",
    reloadCalls: 0,
    reload() {
      this.reloadCalls += 1;
    },
  };

  return { calls, documentTarget, locationTarget, registration, serviceWorker, windowTarget };
}

test("서비스 워커를 HTTP 캐시 없이 확인하고 활성화된 새 버전으로 한 번만 전환한다", async () => {
  const env = makeEnvironment();

  await registerPwaUpdater(env);

  assert.deepEqual(env.calls, [["/sw.js", { updateViaCache: "none" }]]);
  assert.equal(env.registration.updateCalls, 1, "등록 직후 배포된 새 버전을 확인해야 한다");

  env.serviceWorker.dispatch("controllerchange");
  env.serviceWorker.dispatch("controllerchange");
  assert.equal(env.locationTarget.reloadCalls, 1, "같은 업데이트로 화면을 반복해서 새로고치면 안 된다");
});

test("홈 화면 앱이 다시 보이거나 온라인으로 돌아오면 업데이트를 확인한다", async () => {
  const env = makeEnvironment();
  await registerPwaUpdater(env);

  env.windowTarget.dispatch("pageshow");
  await nextTask();
  env.windowTarget.dispatch("online");
  await nextTask();

  env.documentTarget.visibilityState = "hidden";
  env.documentTarget.dispatch("visibilitychange");
  await nextTask();
  env.documentTarget.visibilityState = "visible";
  env.documentTarget.dispatch("visibilitychange");
  await nextTask();

  assert.equal(env.registration.updateCalls, 4, "숨겨진 동안에는 확인하지 않고 복귀할 때 확인해야 한다");
});

test("최초 설치의 controllerchange는 불필요한 재로딩을 만들지 않는다", async () => {
  const env = makeEnvironment({ controlled: false });
  await registerPwaUpdater(env);

  env.serviceWorker.controller = { state: "activated" };
  env.serviceWorker.dispatch("controllerchange");
  assert.equal(env.locationTarget.reloadCalls, 0);

  env.serviceWorker.dispatch("controllerchange");
  assert.equal(env.locationTarget.reloadCalls, 1);
});

test("빌드할 때 해시 자산과 버전을 서비스 워커 템플릿에 넣는다", () => {
  const precacheUrls = createPrecacheUrls([
    "index.html",
    "assets/index-abc123.js",
    "assets/index-def456.css",
    "assets/index-abc123.js.map",
  ]);
  assert.deepEqual(precacheUrls, [
    "/",
    "/index.html",
    "/manifest.webmanifest",
    "/icon.png",
    "/apple-touch-icon.png",
    "/assets/index-abc123.js",
    "/assets/index-def456.css",
  ]);

  const template = 'const BUILD_VERSION = "__BUILD_VERSION__";\nconst APP_SHELL = [\n  // __PRECACHE_MANIFEST__\n];';
  const rendered = renderServiceWorker(template, { version: "release-42", precacheUrls });

  assert.match(rendered, /const BUILD_VERSION = "release-42"/);
  assert.match(rendered, /"\/assets\/index-abc123\.js"/);
  assert.doesNotMatch(rendered, /__BUILD_VERSION__|__PRECACHE_MANIFEST__/);
});

test("서비스 워커는 문서 요청에만 앱 셸을 오프라인 대체 응답으로 사용한다", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

  assert.match(source, /dulsallim-\$\{BUILD_VERSION\}/);
  assert.match(source, /request\.mode === "navigate"/);
  assert.match(source, /LEGACY_CACHE_NAME/);
  assert.match(source, /client\.navigate\(client\.url\)/, "기존 홈 화면 설치본도 한 번은 새 문서를 받아야 한다");
  assert.doesNotMatch(source, /await client\.navigate/, "활성화 중 탐색 완료를 기다리면 서로 대기할 수 있다");
});

test("적고 있는 중이면 새로고침을 미루고, 닫힌 뒤에 한다", async () => {
  /*
   * 시트를 열어 둔 채 앱을 나갔다 돌아오는 사이에 배포가 있으면, 예전에는 그 자리에서
   * 새로고침해 적어 둔 지출이 통째로 사라졌다.
   */
  const env = makeEnvironment();
  let 열려있음 = true;
  await registerPwaUpdater({ ...env, isBusy: () => 열려있음, idleDelay: 5 });

  env.serviceWorker.dispatch("controllerchange");
  await nextTask();
  assert.equal(env.locationTarget.reloadCalls, 0, "적는 중에는 새로고침하지 않는다");

  열려있음 = false;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(env.locationTarget.reloadCalls, 1, "닫히면 그때 한 번 새로고침한다");
});

test("미뤄 두는 동안에도 새로고침은 한 번뿐이다", async () => {
  const env = makeEnvironment();
  let 열려있음 = true;
  await registerPwaUpdater({ ...env, isBusy: () => 열려있음, idleDelay: 5 });

  env.serviceWorker.dispatch("controllerchange");
  env.serviceWorker.dispatch("controllerchange");
  await nextTask();
  열려있음 = false;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(env.locationTarget.reloadCalls, 1);
});

test("첫 등록이 실패해도 다음 기회에 다시 시도한다", async () => {
  // 등록 뒤에 리스너를 걸던 때는, 한 번 실패하면 그 세션 내내 업데이트 확인이 멈췄다.
  const env = makeEnvironment();
  let 실패할까 = true;
  const 등록시도 = [];
  env.serviceWorker.register = async (...args) => {
    등록시도.push(args);
    if (실패할까) throw new Error("일시적인 오류");
    return env.registration;
  };

  const 결과 = await registerPwaUpdater(env);
  assert.equal(결과, null, "실패하면 등록 결과가 없다");
  assert.equal(등록시도.length, 1);

  실패할까 = false;
  env.windowTarget.dispatch("online");
  await nextTask();
  await nextTask();
  assert.equal(등록시도.length, 2, "온라인으로 돌아오면 다시 등록한다");
  assert.equal(env.registration.updateCalls, 1, "등록된 뒤에는 업데이트도 확인한다");
});

test("앱 셸 자리에는 문서만 넣는다", async () => {
  /*
   * 최상위 문서로 연 것이 무엇이든 그대로 저장하면(예: /icon.png),
   * 오프라인에서 그 그림이 앱 대신 나온다.
   */
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(source, /content-type[\s\S]{0,60}text\/html/);
  assert.match(source, /isDocument \? cacheResponse\("\/index\.html", response\) : response/);
});
