import { subscribeHousehold, subscribeNotes, unsubscribe } from "./data/remote.js";
import { msUntilNextDay, toDateKey } from "./domain/expenses.js";
import { describeApplied } from "./domain/fixed-costs.js";
import { getProfile } from "./features/auth.js";
import { applyDueFixedCosts, refreshFixedSheet } from "./features/fixed-sheet.js";
import { flushPendingNotes, receiveNote } from "./features/notes.js";
import { paintMembers, render } from "./render.js";
import { loadAll, reloadHousehold } from "./store.js";
import { showToast } from "./ui/toast.js";

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
let dayTimer = null;

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
  watchForNewDay();
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
async function catchUp() {
  const profile = getProfile();
  // 로그아웃하면 profile 이 비므로, 로그인 화면에서 돌아온 것과 구분된다.
  if (!profile || catchingUp) return;

  /*
   * 마칠 때까지 문을 걸어 둔다.
   *
   * 예전에는 읽기(loadAll)만 잠갔다. 그 뒤에 남은 것이 다시 그리기뿐이라 순식간이었다.
   * 지금은 그 자리에 서버 쓰기가 있다 — 한 번에 여섯 건씩(store.js 의 APPLY_BATCH),
   * 열두 달이 밀렸으면 왕복이 스무 번이다. 그사이 화면이 한 번 더 깨어나면 두 번째
   * catchUp 이 그대로 들어와, 통째로 읽어 온 사본과 방금 만든 지출이 겹친다.
   * 서버는 유니크 제약이 막아 주지만 손안의 사본은 같은 지출을 두 번 들거나
   * 새로 만든 것을 잃는다.
   */
  catchingUp = true;
  try {
    await loadAll(profile);
    paintMembers();

    /*
     * 자는 사이 반영일이 지났을 수 있다.
     *
     * 설치한 앱은 좀처럼 완전히 꺼지지 않는다 — 홈 버튼으로 잠들었다 그대로 깨어난다.
     * 그래서 냉시작(startApp)에서만 채우면, 5일이 지나 앱을 열어도 그날 고정비가 없다.
     * 폰이 앱을 메모리에서 밀어낼 때에야 뒤늦게 한꺼번에 들어와, 어떤 달은 되고
     * 어떤 달은 안 되는 것처럼 보였다.
     */
    const applied = await applyDueFixedCosts();
    repaintAfterSync();

    // 조용히 넘어가면 이번 달 고정비가 통째로 빠진 걸 모른 채 지나간다.
    const notice = describeApplied(applied);
    if (notice) showToast(notice);
  } catch {
    // 돌아오자마자 오류 화면을 띄우지 않는다. 보던 것을 그대로 두고 다음 기회에 맞춘다.
  } finally {
    catchingUp = false;
  }
}

/**
 * 켜 둔 채 자정을 넘겨도 그날 고정비가 들어오게 한다.
 *
 * 깨어나는 길(catchUp)은 visibilitychange 나 pageshow 가 울려야 도는데, 앱을 계속 앞에
 * 두고 있으면 둘 다 안 울린다. 침대맡에 켜 두거나 낮 내내 띄워 두면 5일이 되어도 그날
 * 고정비가 화면에 없다. 구독은 상대 폰의 변경만 알려 줄 뿐 날이 바뀐 것은 모른다.
 *
 * 1분마다 날짜를 보는 대신 자정 한 번만 깨운다 — 하루에 천사백 번 깨우면 배터리를 먹는다.
 * 깬 뒤에 다음 자정을 다시 잡으므로, 폰이 자느라 늦게 울려도 그다음이 어긋나지 않는다.
 */
function watchForNewDay() {
  clearTimeout(dayTimer);
  const now = new Date();
  dayTimer = setTimeout(() => {
    // 폰이 자느라 늦게 울렸을 수도, 시계가 뒤로 갔을 수도 있다. 날이 정말 바뀐 것만 친다.
    if (toDateKey(new Date()) !== toDateKey(now)) catchUp();
    watchForNewDay();
  }, msUntilNextDay(now));
}

/** 로그아웃하면 남의 집 소식을 계속 듣고 있을 이유가 없다. */
export function stopSync() {
  unsubscribe(channel);
  unsubscribe(noteChannel);
  clearTimeout(syncTimer);
  clearTimeout(dayTimer);
  channel = null;
  noteChannel = null;
  dayTimer = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") catchUp();
});
/* 얼려 둔 페이지를 되살릴 때는 visibilitychange 없이 이쪽만 울리는 경우가 있다. */
window.addEventListener("pageshow", (event) => {
  if (event.persisted) catchUp();
});
