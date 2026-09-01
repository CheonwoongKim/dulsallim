/**
 * 부르는 쪽이 정말 서버인지 본다.
 *
 * 이 함수는 아무에게나 알림을 보낼 수 있다. Edge Functions 가 JWT 를 먼저 보지만
 * 그것만으로는 모자라다 — anon 키도 제대로 된 JWT 라서 그 검사를 통과한다. 그 키는
 * JS 묶음에 공개돼 있으니, 그대로 두면 아무나 남의 폰에 제목과 본문을 골라 띄울 수 있다.
 * (같은 자리를 link-preview 는 이미 막아 두었다. 여기만 빠져 있었다.)
 *
 * 부르는 쪽은 DB 트리거와 cron 뿐이고, 둘 다 service_role 키를 달고 온다.
 * 그러니 그 키인지만 보면 된다.
 *
 * 글자를 하나씩 견주지 않는다. 다른 자리에서 갈리면 그만큼 빨리 끝나, 재 보는 것만으로
 * 열쇠를 한 글자씩 알아낼 수 있다. 길이가 달라도 끝까지 훑어 시간이 같게 만든다.
 *
 * @param 머리 Authorization 머리글 그대로
 * @param 열쇠 SUPABASE_SERVICE_ROLE_KEY
 */
export function 서버인가(머리: string | null, 열쇠: string | undefined): boolean {
  if (!열쇠) return false;
  if (!머리?.startsWith("Bearer ")) return false;
  return 같은글자인가(머리.slice("Bearer ".length), 열쇠);
}

/** 언제나 같은 시간이 걸리게 견준다. */
function 같은글자인가(가: string, 나: string): boolean {
  const 길이 = Math.max(가.length, 나.length);
  let 다름 = 가.length ^ 나.length;
  for (let i = 0; i < 길이; i += 1) {
    다름 |= (가.charCodeAt(i) || 0) ^ (나.charCodeAt(i) || 0);
  }
  return 다름 === 0;
}
