/*
 * 알림을 보낸다.
 *
 * 세 가지를 보낸다 — 상대가 기록했을 때, 목표를 넘겼을 때, 달이 끝났을 때.
 * 무엇을 보낼지는 부르는 쪽(DB 트리거·cron)이 정하고, 여기서는 그 사람의 기기 전부에 전한다.
 *
 * 보안: service_role 로만 부를 수 있다. 구독표는 anon 에게 권한이 없으므로
 * 이 함수 밖에서는 남의 알림 주소를 읽을 수 없다.
 *
 * 410(사라짐)·404 를 받으면 그 구독은 죽은 것이다. 지워 두지 않으면 다음에도 헛수고한다.
 */
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const 공개키 = Deno.env.get("VAPID_PUBLIC_KEY")!;
const 비밀키 = Deno.env.get("VAPID_PRIVATE_KEY")!;
const 연락처 = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@dulsallim.app";
webpush.setVapidDetails(연락처, 공개키, 비밀키);

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type 보낼것 = { userIds: string[]; title: string; body: string; url?: string; tag?: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let 내용: 보낼것;
  try {
    내용 = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!Array.isArray(내용.userIds) || !내용.userIds.length || !내용.title) {
    return new Response("userIds 와 title 이 필요하다", { status: 400 });
  }

  const { data: 구독들, error } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", 내용.userIds);
  if (error) return new Response(error.message, { status: 500 });

  const 짐 = JSON.stringify({
    title: 내용.title,
    body: 내용.body ?? "",
    url: 내용.url ?? "/",
    tag: 내용.tag,
  });

  let 보냄 = 0;
  const 죽은것: string[] = [];
  await Promise.all(
    (구독들 ?? []).map(async (구독) => {
      try {
        await webpush.sendNotification(
          { endpoint: 구독.endpoint, keys: { p256dh: 구독.p256dh, auth: 구독.auth } },
          짐,
        );
        보냄 += 1;
      } catch (e) {
        const 코드 = (e as { statusCode?: number }).statusCode;
        if (코드 === 404 || 코드 === 410) 죽은것.push(구독.endpoint);
      }
    }),
  );
  if (죽은것.length) await db.from("push_subscriptions").delete().in("endpoint", 죽은것);

  return Response.json({ 보냄, 지운것: 죽은것.length });
});
