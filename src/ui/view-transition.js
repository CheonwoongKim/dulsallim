/**
 * 화면이 갈아 끼워지는 동안 브라우저가 앞뒤 모습을 이어 준다.
 *
 * 목록과 캘린더는 같은 자리를 완전히 다른 그림으로 바꾼다. 그냥 바꾸면 툭 바뀌는데,
 * 브라우저가 바꾸기 전후를 스냅숏으로 떠서 겹쳐 주면 "같은 자리가 모양을 바꿨다"로 읽힌다.
 *
 * 지원하지 않는 브라우저에서는 그냥 즉시 바꾼다 — 잃는 것은 연출뿐이라 기능은 그대로다.
 * 움직임을 줄여 달라고 한 사람에게도 쓰지 않는다.
 */
export function withViewTransition(change) {
  const 이어주기 = document.startViewTransition?.bind(document);
  const 조용히 = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!이어주기 || 조용히) {
    change();
    return;
  }
  이어주기(change);
}
