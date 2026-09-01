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

/**
 * 그림 곳간에 잘못 담긴 우리 그림을 걷는다.
 *
 * 한동안 출처를 안 가리고 담았다. 그 곳간은 판이 올라가도 안 비우므로, 이미 담긴 사람은
 * 아이콘을 고쳐 올려도 영영 옛것을 본다 — 이제부터 안 담는 것만으로는 안 풀린다.
 * 판이 바뀔 때마다 한 번 훑어 우리 것만 골라 버린다. 남의 그림은 그대로 둔다.
 */
async function 갇힌우리그림풀기() {
  const cache = await caches.open(IMAGE_CACHE_NAME).catch(() => null);
  if (!cache) return;
  const keys = await cache.keys();
  await Promise.all(
    keys
      .filter((request) => new URL(request.url).origin === self.location.origin)
      .map((request) => cache.delete(request)),
  );
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
      await 갇힌우리그림풀기();
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
   * 남의 서버 그림만 판과 따로 담는다. 위시의 대표 그림이 거기 있고, 그 서버가 캐시를
   * 얼마나 두라고 말해 주는지는 우리가 못 정한다 — 안 알려 주는 곳도 있다.
   *
   * 우리 그림은 여기 넣지 않는다. 그림 곳간은 판이 올라가도 안 비우는 자리라,
   * 넣어 두면 이름에 해시가 없는 것(/icon.png·/apple-touch-icon.png)이 영영 안 바뀐다 —
   * 아이콘을 고쳐 올려도 이미 깔린 사람에게는 옛것이 그대로 남는다.
   * 우리 것은 아래 판을 따르는 길로 보낸다.
   *
   * 출처를 보는 이 줄이 그림 갈래 안에 있어야 한다. 밖에 두고 먼저 보면 남의 그림이
   * 거기서 걸러져 한 장도 안 담긴다.
   */
  const 남의것 = new URL(request.url).origin !== self.location.origin;
  if (request.destination === "image" && 남의것) {
    event.respondWith(imageFirst(request));
    return;
  }

  // 그 밖의 외부 도메인(글꼴 CDN 등)은 브라우저 기본 처리에 맡긴다.
  if (남의것) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, true));
    return;
  }

  /*
   * 이름에 해시가 박혀 있어 내용이 바뀌면 이름도 바뀌는 것들. 담아 둔 것이 있으면 그것부터
   * 쓴다 — 그물로 먼저 가면 두 번째 방문에도 매번 다녀오게 된다.
   *
   * /fonts 는 구글이 잘라 둔 글꼴 조각이다. 이름이 곧 판이라 바뀔 일이 없다.
   */
  const url = new URL(request.url);
  const 안바뀌는것 = url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/");
  event.respondWith(안바뀌는것 ? cacheFirst(request) : networkFirst(request));
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

/**
 * 알림이 가리키는 자리. 우리 집 안이어야 한다.
 *
 * new URL(값, 우리주소) 는 값이 절대 주소면 그것을 그대로 쓴다 — 알림에 실린 주소가
 * https://남의곳/… 이면 눌렀을 때 거기로 나간다. 알림은 우리 이름과 아이콘을 달고 뜨므로
 * 그 창은 우리 화면처럼 읽힌다. 우리가 실제로 보내는 값은 "/" 뿐이라 잃을 것도 없다.
 *
 * 보내는 쪽에도 문을 달았지만(functions/send-push/guard.ts), 문이 하나뿐이면
 * 그것이 열리는 날 이 자리가 그대로 뚫린다.
 */
function 갈곳정하기(값) {
  try {
    const 주소 = new URL(값 || "/", self.location.origin);
    return 주소.origin === self.location.origin ? 주소 : new URL("/", self.location.origin);
  } catch {
    return new URL("/", self.location.origin);
  }
}

/** 알림을 누르면 이미 열려 있는 창을 앞으로 가져온다. 매번 새 창을 띄우면 여러 장이 쌓인다. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const 갈곳 = 갈곳정하기(event.notification.data?.url);
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
