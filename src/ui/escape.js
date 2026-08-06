/** innerHTML에 값을 넣기 전 반드시 통과시킨다. 속성값의 따옴표까지 막는다. */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * 링크로 쓸 수 있는 주소만 통과시킨다.
 *
 * escapeHtml 만으로는 모자란다. `javascript:alert(1)` 에는 막을 글자가 하나도 없어
 * 그대로 href 에 들어가고, 누르는 순간 그 코드가 우리 페이지 안에서 돈다.
 * 사람이 여는 링크는 http·https 뿐이라 그 둘만 남긴다.
 *
 * @returns {string|null} 쓸 수 있으면 정규화된 주소, 아니면 null
 */
export function safeHref(value) {
  let url;
  try {
    // 상대 주소는 기준이 없어 여기서 던진다. 우리는 절대 주소만 링크로 받는다.
    url = new URL(String(value));
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}
