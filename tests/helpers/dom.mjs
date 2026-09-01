/**
 * node 에는 DOM 이 없다. 그린 것을 실제로 돌려 보려고 쓰는 만큼만 흉내 낸다.
 *
 * jsdom 같은 것을 들이지 않는 이유는 이 저장소가 프레임워크를 안 쓰는 이유와 같다 —
 * 우리가 만지는 것이 createElement 와 innerHTML·setAttribute 뿐이라, 들여올 코드가
 * 흉내 낼 것보다 훨씬 크다. 필요한 것이 늘면 여기에 더한다.
 */

/** `<img>` 가 붙어 있는지는 그린 글자로 안다. 깨졌을 때 걷어내는 길을 재려면 필요하다. */
function 가짜그림() {
  const 듣는것 = [];
  return {
    지워졌나: false,
    addEventListener(이름, 손) {
      듣는것.push([이름, 손]);
    },
    remove() {
      this.지워졌나 = true;
    },
    /** 그림이 안 왔다고 알린다. */
    깨뜨리기() {
      듣는것.filter(([이름]) => 이름 === "error").forEach(([, 손]) => 손());
    },
  };
}

export function 요소만들기(tagName) {
  const 속성 = {};
  let 그림 = null;
  return {
    tagName,
    dataset: {},
    className: "",
    innerHTML: "",
    속성,
    setAttribute(이름, 값) {
      속성[이름] = String(값);
    },
    getAttribute(이름) {
      return 이름 in 속성 ? 속성[이름] : null;
    },
    /** 쓰는 곳이 `.wish-shot img` 하나뿐이다. 그린 글자에 그림이 있으면 하나 내준다. */
    querySelector() {
      if (!this.innerHTML.includes("<img")) return null;
      그림 ||= 가짜그림();
      return 그림;
    },
  };
}

/** `document.createElement` 만 세운다. @returns 만들어진 요소들 (검사에서 들여다볼 때 쓴다) */
export function 문서세우기() {
  const 만든것 = [];
  globalThis.document = {
    createElement(tagName) {
      const 요소 = 요소만들기(tagName);
      만든것.push(요소);
      return 요소;
    },
  };
  return 만든것;
}
