/**
 * iOS 홈 화면 웹앱은 Safari 탭과 별도 프로세스로 살아남을 수 있다.
 * 앱이 다시 보일 때 워커를 확인하고, 새 워커가 제어권을 잡으면 문서도 같은 버전으로 맞춘다.
 */
export async function registerPwaUpdater(environment = {}) {
  const serviceWorker = environment.serviceWorker ?? globalThis.navigator?.serviceWorker;
  const windowTarget = environment.windowTarget ?? globalThis.window;
  const documentTarget = environment.documentTarget ?? globalThis.document;
  const locationTarget = environment.locationTarget ?? globalThis.location;

  if (!serviceWorker || !windowTarget || !documentTarget || !locationTarget || locationTarget.protocol === "file:") {
    return null;
  }

  /*
   * 적다 만 것이 있으면 새로고침을 미룬다.
   *
   * 시트는 거의 다 적는 곳이라 열려 있으면 무조건 미룬다 — 시트를 열어 둔 채 앱을
   * 나갔다 돌아오는 사이에 배포가 있으면 적어 둔 지출이 통째로 사라졌다.
   *
   * 화면(.page)은 달랐다. 예전에는 열려 있기만 하면 미뤘는데, 위시리스트·분석처럼
   * 적을 것이 없는 화면에서도 그 조건이 계속 참이라 거기 앉아 있는 동안 새 버전이
   * 영영 안 들어갔다. 실제로 위시리스트에서 옛 코드가 돌아 지우기 확인 단계가 없었다.
   * 그래서 화면은 안에 적는 칸이 있을 때만 미룬다.
   *
   * 켜고 끄는 것(checkbox·radio)은 세지 않는다. 누르는 즉시 서버로 가 적다 만 것이 없다.
   * 지금 걸리는 화면은 마이페이지 하나다(이름·아바타 색·목표).
   *
   * 기본 판정은 DOM 만 본다 — 이 함수는 테스트에서 본문만 떼어 실행되므로
   * 모듈 바깥의 것을 참조하면 안 된다.
   */
  const UNSAVED_FIELDS =
    ".page:not([hidden]) textarea, " +
    ".page:not([hidden]) input:not([type='checkbox']):not([type='radio']):not([type='button'])";

  const isBusy =
    environment.isBusy ??
    (() =>
      Boolean(
        documentTarget.querySelector?.(".sheet:not([hidden])") ||
          documentTarget.querySelector?.(UNSAVED_FIELDS),
      ));
  // 미뤄 둔 새로고침을 얼마나 자주 다시 살필지. 기다리는 동안에만 돈다.
  const idleDelay = environment.idleDelay ?? 2000;

  let hasController = Boolean(serviceWorker.controller);
  let isReloading = false;
  let idleTimer = null;

  const reloadWhenIdle = () => {
    if (isReloading) return;
    if (isBusy()) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(reloadWhenIdle, idleDelay);
      return;
    }
    isReloading = true;
    locationTarget.reload();
  };

  serviceWorker.addEventListener("controllerchange", () => {
    if (!hasController) {
      hasController = true;
      return;
    }
    reloadWhenIdle();
  });

  let registration = null;
  let updatePromise = null;

  /** 한 번 실패해도 다음 기회에 다시 등록한다. 실패를 삼키면 그 세션은 영영 옛 버전이다. */
  const ensureRegistration = async () => {
    if (registration) return registration;
    registration = await serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => null);
    return registration;
  };

  const checkForUpdate = () => {
    if (updatePromise) return updatePromise;
    updatePromise = ensureRegistration()
      .then((current) => current?.update())
      // 확인에 실패해도 사용자에게 알릴 것이 없다. 다음 기회에 다시 확인한다.
      .catch(() => undefined)
      .finally(() => {
        updatePromise = null;
      });
    return updatePromise;
  };

  const checkWhenVisible = () => {
    if (documentTarget.visibilityState === "visible") void checkForUpdate();
  };

  // 등록보다 먼저 건다. 첫 등록이 실패해도 온라인으로 돌아오면 다시 시도할 수 있어야 한다.
  windowTarget.addEventListener("pageshow", checkForUpdate);
  windowTarget.addEventListener("online", checkForUpdate);
  documentTarget.addEventListener("visibilitychange", checkWhenVisible);

  await checkForUpdate();
  return registration;
}

if (import.meta.env.PROD) {
  // 등록에 실패해도 앱은 그대로 돈다. 새 버전으로 갈아타는 것만 다음 기회로 미뤄진다.
  window.addEventListener("load", () => registerPwaUpdater().catch(() => {}), { once: true });
}
