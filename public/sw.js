const BUILD_VERSION = "__BUILD_VERSION__";
const CACHE_NAME = `dulsallim-${BUILD_VERSION}`;
const LEGACY_CACHE_NAME = "dulsallim-v1";
const APP_SHELL = [
  // __PRECACHE_MANIFEST__
];

async function cacheResponse(key, response) {
  if (!response.ok || !(response.type === "basic")) return response;

  const copy = response.clone();
  await caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(key, copy))
    .catch(() => {});
  return response;
}

async function networkFirst(request, fallbackToShell = false) {
  try {
    const response = await fetch(request);
    return cacheResponse(fallbackToShell ? "/index.html" : request, response);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackToShell) return (await cache.match("/index.html")) || Response.error();
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(request)) || networkFirst(request);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const isLegacyUpgrade = keys.includes(LEGACY_CACHE_NAME);
      const staleCaches = keys.filter((key) => key.startsWith("dulsallim-") && key !== CACHE_NAME);

      await Promise.all(staleCaches.map((key) => caches.delete(key)));
      await self.clients.claim();

      // 기존 설치본에는 controllerchange 처리 코드가 없다. 첫 전환에 한해 새 문서를 직접 연다.
      if (isLegacyUpgrade) {
        const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        // navigate 완료를 기다리면 활성화가 끝나지 않아 새 탐색과 서로 대기할 수 있다.
        for (const client of windowClients) {
          if ("navigate" in client) void client.navigate(client.url).catch(() => null);
        }
      }
    })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // 외부 도메인(폰트 CDN 등)은 캐시 대상이 아니다. 브라우저 기본 처리에 맡긴다.
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, true));
    return;
  }

  const url = new URL(request.url);
  event.respondWith(url.pathname.startsWith("/assets/") ? cacheFirst(request) : networkFirst(request));
});
