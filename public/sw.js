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
    if (!fallbackToShell) return cacheResponse(request, response);

    /*
     * 앱 셸 자리에는 문서만 넣는다.
     * 최상위 문서로 연 것이 무엇이든(예: /icon.png) 그대로 저장하면,
     * 오프라인에서 그 그림이 앱 대신 나온다.
     */
    const isDocument = (response.headers.get("content-type") || "").includes("text/html");
    return isDocument ? cacheResponse("/index.html", response) : response;
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

/*
 * 알림.
 *
 * iOS 는 홈 화면에 추가한 웹앱에서만 푸시를 받는다(16.4+). Safari 탭에서는 오지 않으므로
 * 여기 코드는 그 경우 그냥 실행되지 않는다.
 *
 * 페이로드는 서버가 보낸 JSON 이다. 형태가 어긋나도 알림은 떠야 하므로 기본값을 둔다 —
 * 아무것도 안 뜨면 사용자는 무슨 일이 있었는지 영영 모른다.
 */
self.addEventListener("push", (event) => {
  let 알림 = {};
  try {
    알림 = event.data ? event.data.json() : {};
  } catch {
    알림 = { body: event.data ? event.data.text() : "" };
  }

  const 제목 = 알림.title || "둘살림";
  event.waitUntil(
    self.registration.showNotification(제목, {
      body: 알림.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      // 같은 종류가 여러 번 오면 쌓지 않고 최신 것으로 바꾼다.
      tag: 알림.tag || "dulsallim",
      renotify: Boolean(알림.tag),
      data: { url: 알림.url || "/" },
    }),
  );
});

/** 알림을 누르면 이미 열려 있는 창을 앞으로 가져온다. 매번 새 창을 띄우면 여러 장이 쌓인다. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const 갈곳 = new URL(event.notification.data?.url || "/", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((창들) => {
      for (const 창 of 창들) {
        if (new URL(창.url).origin !== 갈곳.origin) continue;
        창.focus();
        if ("navigate" in 창 && 창.url !== 갈곳.href) 창.navigate(갈곳.href);
        return undefined;
      }
      return self.clients.openWindow(갈곳.href);
    }),
  );
});
