const BUILD_VERSION = "__BUILD_VERSION__";
const CACHE_NAME = `dulsallim-${BUILD_VERSION}`;
const LEGACY_CACHE_NAME = "dulsallim-v1";

/*
 * 그림은 판이 올라가도 안 버린다.
 *
 * 위시의 대표 그림은 남의 서버(쇼핑몰 CDN)에 있다. 그 서버가 캐시를 얼마나 오래 두라고
 * 말해 주는지는 우리가 못 정하고, 안 알려 주는 곳도 있다. 그러면 목록을 열 때마다 다시
 * 받아 와 첫 글자만 잠깐 보였다가 그림이 뜬다.
 *
 * 앱 판(BUILD_VERSION)과 묶지 않는다. 코드를 고쳤다고 남의 그림까지 다시 받을 까닭이 없다.
 */
const IMAGE_CACHE_NAME = "dulsallim-images";

/*
 * 담아 둘 장수. 위시는 몇 개 안 되지만 고치면서 주소가 바뀐 옛 그림이 쌓인다.
 *
 * 남의 서버 그림은 속을 볼 수 없는 응답(opaque)이라 브라우저가 크기를 부풀려 셈한다.
 * 무한정 담으면 저장 공간을 다 쓰고 앱 셸까지 밀려난다. 넘치면 오래된 것부터 버린다.
 */
const IMAGE_LIMIT = 40;
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

/**
 * 그림은 담아 둔 것이 있으면 그것부터.
 *
 * 남의 서버 그림은 no-cors 로 와서 status 가 0 이고 속을 볼 수 없다(opaque). ok 로는 못
 * 가리므로 0 도 성공으로 본다 — 정말 실패한 요청은 fetch 가 던지므로 여기까지 안 온다.
 */
async function imageFirst(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.status === 0 || response.ok) {
    await cache.put(request, response.clone()).catch(() => {});
    void 넘치면버리기(cache);
  }
  return response;
}

/** 오래된 것부터 버린다. 캐시의 열쇠는 넣은 차례로 나온다. */
async function 넘치면버리기(cache) {
  const keys = await cache.keys();
  if (keys.length <= IMAGE_LIMIT) return;
  await Promise.all(keys.slice(0, keys.length - IMAGE_LIMIT).map((key) => cache.delete(key)));
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
      // 그림 곳간은 판과 묶여 있지 않다. 여기서 지우면 판을 올릴 때마다 다시 받는다.
      const staleCaches = keys.filter(
        (key) => key.startsWith("dulsallim-") && key !== CACHE_NAME && key !== IMAGE_CACHE_NAME,
      );

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

  /*
   * 그림은 어느 서버 것이든 담는다. 남의 서버 것이 오히려 더 필요하다 — 위시의 대표 그림이
   * 거기 있고, 그 서버가 캐시를 얼마나 두라고 말해 주는지는 우리가 못 정한다.
   */
  if (request.destination === "image") {
    event.respondWith(imageFirst(request));
    return;
  }

  // 그 밖의 외부 도메인(글꼴 CDN 등)은 브라우저 기본 처리에 맡긴다.
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
