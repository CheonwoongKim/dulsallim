import { subscribeHousehold, subscribeNotes, unsubscribe } from "./data/remote.js";
import { getProfile } from "./features/auth.js";
import { refreshFixedSheet } from "./features/fixed-sheet.js";
import { flushPendingNotes, receiveNote } from "./features/notes.js";
import { paintMembers, render } from "./render.js";
import { loadAll, reloadHousehold } from "./store.js";

/**
 * 상대 폰에서 일어난 일을 내 화면에 맞춘다.
 *
 * 두 갈래다. 앱이 떠 있는 동안은 구독이 알려 주고(watchForChanges),
 * 자다 깨어난 뒤에는 통째로 다시 읽는다(catchUp). 마무리는 둘이 같은 것을 쓴다.
 */

/** 상대 폰의 변경을 몰아서 한 번만 반영한다. 한 건씩 다시 읽으면 목록이 계속 껌뻑인다. */
const SYNC_DEBOUNCE_MS = 400;

let channel = null;
let noteChannel = null;
let syncTimer = null;

/** 다시 읽은 뒤 화면을 맞춘다. 실시간 변경과 화면 복귀가 같은 마무리를 쓴다. */
function repaintAfterSync() {
  // 지출보다 먼저 도착해 맡겨 뒀던 메시지를 이제 붙인다. 그려지기 전이어야 개수가 맞는다.
  flushPendingNotes();
  render();
  // 고정비 목록은 render 가 그리지 않는다. 열어 둔 채라면 여기서 맞춘다.
  refreshFixedSheet();
}

/** 상대가 기록하면 내 화면도 따라 바뀐다. 내 변경도 여기로 돌아오지만 결과는 같다. */
export function watchForChanges(householdId) {
  unsubscribe(channel);
  unsubscribe(noteChannel);
  // 상대가 남긴 말은 목록의 개수와 열려 있는 대화 양쪽에 바로 반영된다.
  noteChannel = subscribeNotes(receiveNote);
  channel = subscribeHousehold(householdId, () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        await reloadHousehold();
        repaintAfterSync();
      } catch {
        // 실패해도 지금 보이는 화면은 그대로 둔다. 다음 변경 때 다시 시도된다.
      }
    }, SYNC_DEBOUNCE_MS);
  });
}

let catchingUp = false;

/**
 * 화면으로 돌아왔을 때 처음부터 다시 읽는다.
 *
 * 폰이 앱을 재우면 실시간 연결이 끊긴다. 깨어나 다시 이어져도 자는 동안 있었던 일은
 * 들려주지 않는다 — 지나간 변경을 재생해 주는 구독이 아니기 때문이다.
 * 그래서 상대가 그사이 적은 지출은 다음에 무언가 바뀔 때까지 화면에 없었다.
 *
 * 바뀐 것만 골라 읽지 않고 통째로 읽는다. 얼마나 오래 잠들었는지 알 수 없으니
 * 무엇이 어긋났는지도 알 수 없다. 특히 대화 개수와 구성원은 reloadHousehold 가
 * 읽지 않아, 그것만으로는 상대가 남긴 말이 목록에 나타나지 않는다.
 */
export async function catchUp() {
  const profile = getProfile();
  // 로그아웃하면 profile 이 비므로, 로그인 화면에서 돌아온 것과 구분된다.
  if (!profile || catchingUp) return;

  catchingUp = true;
  try {
    await loadAll(profile);
  } catch {
    // 돌아오자마자 오류 화면을 띄우지 않는다. 보던 것을 그대로 두고 다음 기회에 맞춘다.
    return;
  } finally {
    catchingUp = false;
  }
  paintMembers();
  repaintAfterSync();
}

/** 로그아웃하면 남의 집 소식을 계속 듣고 있을 이유가 없다. */
export function stopSync() {
  unsubscribe(channel);
  unsubscribe(noteChannel);
  clearTimeout(syncTimer);
  channel = null;
  noteChannel = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") catchUp();
});
/* 얼려 둔 페이지를 되살릴 때는 visibilitychange 없이 이쪽만 울리는 경우가 있다. */
window.addEventListener("pageshow", (event) => {
  if (event.persisted) catchUp();
});
