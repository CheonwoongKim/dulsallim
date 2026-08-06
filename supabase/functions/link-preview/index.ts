/*
 * 링크에서 대표 그림 주소 하나를 찾아 준다.
 *
 * 브라우저는 남의 사이트 HTML 을 못 읽는다(CORS). 그래서 서버가 대신 읽고
 * og:image 만 뽑아 돌려준다. 그림 자체는 나르지 않는다 — 주소만 준다.
 *
 * 보안: 로그인한 사람만 부를 수 있다(Edge Functions 가 JWT 를 먼저 본다).
 * 그것만으로는 모자라다. 이 함수는 "남이 준 주소를 서버가 대신 연다" 는 구조라,
 * 주소를 우리 안쪽 망으로 돌리면 밖에서 못 닿는 곳을 대신 열어 주는 꼴이 된다(SSRF).
 * 그래서 갈 수 있는 곳을 좁히고, 따라가는 자리마다 다시 본다.
 */

import { 갈수있나, 그림찾기, 쓸수있는주소 } from "./parse.ts";

/** 우리 화면에서 부른다. 브라우저가 먼저 OPTIONS 로 물어보므로 답해 줘야 한다. */
const 통신머리 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** 사이트가 크면 앞부분에 이미 og 태그가 다 있다. 그 뒤는 읽어도 쓸 데가 없다. */
const 읽을최대 = 256 * 1024;
const 기다릴시간 = 5000;
const 따라갈횟수 = 3;


/**
 * 옮겨 가는 자리를 손으로 따라간다.
 *
 * fetch 에게 맡기면 우리가 못 본 사이에 안쪽 주소로 옮겨 갈 수 있다. 가기 전에
 * 매번 다시 보려면 한 걸음씩 가야 한다.
 */
async function 조심해서받기(처음: URL, 신호: AbortSignal): Promise<Response | null> {
  let 지금 = 처음;
  for (let 걸음 = 0; 걸음 <= 따라갈횟수; 걸음 += 1) {
    if (!갈수있나(지금)) return null;
    const 답 = await fetch(지금, {
      redirect: "manual",
      signal: 신호,
      headers: {
        // 봇을 막는 곳이 많다. 사람이 보는 것과 같은 것을 달라고 한다.
        "User-Agent": "Mozilla/5.0 (compatible; DulsallimBot/1.0; +https://dulsallim.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (답.status < 300 || 답.status >= 400) return 답;

    const 다음 = 답.headers.get("location");
    await 답.body?.cancel();
    if (!다음) return null;
    try {
      지금 = new URL(다음, 지금);
    } catch {
      return null;
    }
  }
  return null;
}

/** 앞에서부터 정해진 만큼만 읽는다. 큰 페이지에 통째로 매달리지 않는다. */
async function 앞부분만(답: Response): Promise<string> {
  const 읽개 = 답.body?.getReader();
  if (!읽개) return "";

  const 조각: Uint8Array[] = [];
  let 모은길이 = 0;
  while (모은길이 < 읽을최대) {
    const { done, value } = await 읽개.read();
    if (done) break;
    조각.push(value);
    모은길이 += value.length;
  }
  await 읽개.cancel().catch(() => null);

  const 모음 = new Uint8Array(모은길이);
  let 자리 = 0;
  for (const 하나 of 조각) {
    모음.set(하나, 자리);
    자리 += 하나.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(모음);
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: 통신머리 });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: 통신머리 });
  }

  let 받은것: { url?: string };
  try {
    받은것 = await req.json();
  } catch {
    return new Response("bad json", { status: 400, headers: 통신머리 });
  }

  let 주소: URL;
  try {
    주소 = new URL(String(받은것.url ?? ""));
  } catch {
    return new Response("url 이 필요하다", { status: 400, headers: 통신머리 });
  }
  if (!갈수있나(주소)) {
    return new Response("열 수 없는 주소", { status: 400, headers: 통신머리 });
  }

  const 시계 = AbortSignal.timeout(기다릴시간);
  try {
    const 답 = await 조심해서받기(주소, 시계);
    if (!답 || !답.ok) {
      await 답?.body?.cancel();
      return Response.json({ image: null }, { headers: 통신머리 });
    }
    // HTML 이 아니면 og 태그가 있을 리 없다. 그림 파일이면 그 자체가 그림이다.
    const 종류 = 답.headers.get("content-type") ?? "";
    if (종류.startsWith("image/")) {
      await 답.body?.cancel();
      return Response.json({ image: 답.url || 주소.href }, { headers: 통신머리 });
    }
    if (!종류.includes("html")) {
      await 답.body?.cancel();
      return Response.json({ image: null }, { headers: 통신머리 });
    }

    const 문서 = await 앞부분만(답);
    const 기준 = 쓸수있는주소(답.url, 주소) ? new URL(답.url) : 주소;
    return Response.json({ image: 그림찾기(문서, 기준) }, { headers: 통신머리 });
  } catch {
    // 시간이 넘었거나 상대가 안 받는다. 그림이 없는 것과 같이 다룬다 — 담기는 이미 끝났다.
    return Response.json({ image: null }, { headers: 통신머리 });
  }
});
