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
   * 시트나 전체 화면이 열려 있으면 사람이 무언가 적고 있는 중이다.
   * 그때 새로고침하면 저장하지 않은 지출이 통째로 사라진다. 닫힐 때까지 미룬다.
   * 기본 판정은 DOM 만 본다 — 이 함수는 테스트에서 본문만 떼어 실행되므로
   * 모듈 바깥의 것을 참조하면 안 된다.
   */
  const isBusy =
    environment.isBusy ??
    (() => Boolean(documentTarget.querySelector?.(".sheet:not([hidden]), .page:not([hidden])")));
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
  window.addEventListener("load", () => registerPwaUpdater().catch(() => {}), { once: true });
}
