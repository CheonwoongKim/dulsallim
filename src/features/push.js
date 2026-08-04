import { elements } from "../dom.js";
import { savePushSubscription, removePushSubscription } from "../data/remote.js";
import { showToast } from "../ui/toast.js";
import { getProfile } from "./auth.js";

/**
 * 알림 받기.
 *
 * iOS 는 홈 화면에 추가한 웹앱에서만 푸시를 허용한다(16.4+). Safari 탭에서는
 * Notification 자체가 없거나 permission 요청이 거절되므로, 그 경우 스위치를 감춘다 —
 * 눌러도 안 되는 것을 보여 주면 고장 난 것처럼 보인다.
 *
 * 허락을 구하는 것은 사람이 스위치를 켠 그 순간이어야 한다. 화면을 열자마자 물으면
 * 브라우저가 아예 막고, 한 번 거절당하면 다시 물을 방법이 없다.
 */
const 공개키 = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

/** 서버가 주는 base64url 을 구독 API 가 받는 바이트로 바꾼다. */
function toBytes(base64url) {
  const 채움 = "=".repeat((4 - (base64url.length % 4)) % 4);
  const 글자 = atob((base64url + 채움).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(글자, (c) => c.charCodeAt(0));
}

export function canUsePush() {
  return Boolean(
    공개키 &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      typeof Notification === "function",
  );
}

async function 지금구독() {
  if (!canUsePush()) return null;
  const 등록 = await navigator.serviceWorker.getRegistration();
  return (await 등록?.pushManager.getSubscription()) ?? null;
}

/** 스위치가 지금 상태를 그대로 비추게 한다. 껐는데 켜져 보이면 다음 판단이 어긋난다. */
export async function syncPushToggle() {
  const 자리 = elements.pushRow;
  if (!자리) return;
  자리.hidden = !canUsePush();
  if (자리.hidden) return;
  elements.pushToggle.checked = Boolean(await 지금구독());
  // 한 번 거절하면 브라우저가 다시 묻지 않는다. 그 사실을 알려 준다.
  elements.pushToggle.disabled = Notification.permission === "denied";
  elements.pushHint.textContent =
    Notification.permission === "denied"
      ? "폰 설정에서 이 앱의 알림을 다시 켜 주세요."
      : "상대가 기록하거나, 목표를 넘기거나, 달이 끝나면 알려 드려요.";
}

export async function togglePush(켜기) {
  if (!canUsePush()) return;
  const profile = getProfile();
  if (!profile) return;

  try {
    if (!켜기) {
      const 구독 = await 지금구독();
      if (구독) {
        await removePushSubscription(구독.endpoint);
        await 구독.unsubscribe();
      }
      showToast("알림을 껐어요");
      return;
    }

    const 허락 = await Notification.requestPermission();
    if (허락 !== "granted") {
      showToast("알림이 허용되지 않았어요");
      return;
    }

    const 등록 = await navigator.serviceWorker.ready;
    const 구독 = await 등록.pushManager.subscribe({
      // 알림 없이 조용히 깨우는 것은 iOS 가 허용하지 않는다. 늘 보이는 알림이어야 한다.
      userVisibleOnly: true,
      applicationServerKey: toBytes(공개키),
    });
    await savePushSubscription(profile.id, 구독.toJSON());
    showToast("알림을 켰어요");
  } catch (error) {
    showToast(error.message);
  } finally {
    await syncPushToggle();
  }
}
