import { getMembers } from "../members.js";

/**
 * 전체 / 사람 탭. 분석 화면과 위시리스트가 함께 쓴다.
 *
 * 있는 버튼을 고쳐 쓰고 새로 만들지 않는다. 통째로 갈아 끼우면 방금 누른 버튼이
 * 그 자리에서 사라져 커서가 갈 곳을 잃고 <body> 로 떨어진다 — 키보드로 고른 사람은
 * 누른 순간 자리를 놓치고, 다음 Tab 이 화면 처음부터 다시 짚는다(세 엔진에서 확인).
 * 명부는 로그인 뒤로 거의 바뀌지 않으므로 새로 만드는 것은 사람 수가 달라졌을 때뿐이다.
 *
 * @param {HTMLElement} picker 버튼들이 들어갈 자리
 * @param {string|null} current 지금 고른 사람. null 이면 전체
 * @param {{전체?: boolean}} [고르기] 전체 칸을 둘지. 위시는 사람만 고른다 —
 *   각자의 목록이라 "전체" 라는 자리가 없다.
 */
export function paintMemberTabs(picker, current, { 전체 = true } = {}) {
  const options = 전체 ? [{ id: null, name: "전체" }, ...getMembers()] : getMembers();

  if (picker.childElementCount !== options.length) {
    picker.replaceChildren(
      ...options.map(() => {
        const button = document.createElement("button");
        button.type = "button";
        return button;
      }),
    );
  }

  options.forEach(({ id, name }, index) => {
    const button = picker.children[index];
    button.dataset.member = id || "";
    // 같은 글자를 다시 쓰면 안의 글자 마디가 통째로 갈린다. 바뀐 것만 손댄다.
    if (button.textContent !== name) button.textContent = name;
    button.setAttribute("aria-pressed", String(current === id));
  });
}
