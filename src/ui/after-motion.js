/**
 * 그 요소의 움직임이 실제로 끝난 뒤에 부른다.
 *
 * 예전에는 CSS 에 적은 시간을 JS 에도 한 번 더 적어 두고 setTimeout 으로 맞췄다
 * (시트 420ms, 전체 화면 280ms, 토스트 220ms). 같은 숫자가 두 곳에 있으면 한쪽만
 * 고치게 되고, JS 가 짧으면 애니메이션 도중에 툭 사라지며 길면 닫힌 뒤에도
 * 한참 잠긴 채 남는다. 브라우저에게 직접 물으면 어긋날 수가 없다.
 *
 * getAnimations 는 부르기 전에 스타일을 한 번 정리하므로, 클래스를 바꾼 직후에 불러도
 * 그 바꿈으로 시작된 전환이 잡힌다. 움직임을 줄여 달라고 한 사람에게는 전환이 없어
 * 목록이 비고, 그때는 곧바로 끝난다.
 */
export function afterMotion(element, run) {
  const 끝남 = element.getAnimations().map((animation) => animation.finished);
  if (!끝남.length) {
    run();
    return () => {};
  }

  let 그만 = false;
  // 도중에 취소되면 finished 가 거절된다. 그래도 뒤처리는 해야 하므로 allSettled 다.
  Promise.allSettled(끝남).then(() => {
    if (!그만) run();
  });
  return () => {
    그만 = true;
  };
}
