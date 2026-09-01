/**
 * node 에는 DOM 이 없다. 그린 것을 실제로 돌려 보려고 쓰는 만큼만 흉내 낸다.
 *
 * jsdom 같은 것을 들이지 않는 이유는 이 저장소가 프레임워크를 안 쓰는 이유와 같다 —
 * 우리가 만지는 것이 몇 가지뿐이라 들여올 코드가 흉내 낼 것보다 훨씬 크다.
 * 고르개도 우리가 실제로 쓰는 모양만 안다: `태그`, `.반`, `태그[속성]`, `앞 뒤`, 그리고 쉼표.
 * 필요한 것이 늘면 여기에 더한다. 여기서 못 흉내 낼 만큼 복잡해지면 그것부터 신호다.
 */

function 반목록() {
  const 값들 = new Set();
  return {
    값들,
    add: (...이름들) => 이름들.forEach((이름) => 값들.add(이름)),
    remove: (...이름들) => 이름들.forEach((이름) => 값들.delete(이름)),
    contains: (이름) => 값들.has(이름),
    toggle(이름, 켬) {
      const 켤까 = 켬 === undefined ? !값들.has(이름) : Boolean(켬);
      if (켤까) 값들.add(이름);
      else 값들.delete(이름);
      return 켤까;
    },
    toString: () => [...값들].join(" "),
  };
}

/** `.a`, `태그`, `태그[속성]` 하나가 이 요소에 맞나. */
function 하나맞나(요소, 조각) {
  const [, 태그 = "", 반 = "", 속성 = ""] = 조각.match(/^([\w-]*)(?:\.([\w-]+))?(?:\[([\w-]+)\])?$/) || [];
  if (태그 && 요소.tagName !== 태그) return false;
  if (반 && !요소.classList.contains(반)) return false;
  if (속성 && 요소.getAttribute(속성) === null && !(속성.replace(/^data-/, "") in 요소.dataset)) return false;
  return Boolean(태그 || 반 || 속성);
}

function 맞나(요소, 고르개) {
  return 고르개.split(",").some((갈래) => {
    const 조각들 = 갈래.trim().split(/\s+/);
    if (!하나맞나(요소, 조각들.at(-1))) return false;
    // 앞 조각은 조상 어딘가에 있어야 한다.
    let 위 = 요소.parentElement;
    for (const 조각 of 조각들.slice(0, -1).reverse()) {
      while (위 && !하나맞나(위, 조각)) 위 = 위.parentElement;
      if (!위) return false;
      위 = 위.parentElement;
    }
    return true;
  });
}

function 아래전부(요소, 모은것 = []) {
  for (const 아이 of 요소.children) {
    모은것.push(아이);
    아래전부(아이, 모은것);
  }
  return 모은것;
}

export function 요소만들기(tagName = "div") {
  const 속성 = {};
  /** innerHTML 글자 속 태그를 대신해 설 것들. 같은 태그를 두 번 찾으면 같은 것이 나온다. */
  const 선것 = {};
  const 요소 = {
    tagName,
    dataset: {},
    classList: 반목록(),
    style: {},
    children: [],
    parentElement: null,
    textContent: "",
    innerHTML: "",
    /** 스와이프가 액션 폭을 잰다. 검사에서 값을 넣어 준다. */
    offsetWidth: 0,
    속성,
    listeners: {},
    get className() {
      return this.classList.toString();
    },
    set className(값) {
      this.classList.값들.clear();
      String(값).split(/\s+/).filter(Boolean).forEach((이름) => this.classList.add(이름));
    },
    get childElementCount() {
      return this.children.length;
    },
    setAttribute(이름, 값) {
      속성[이름] = String(값);
    },
    getAttribute(이름) {
      return 이름 in 속성 ? 속성[이름] : null;
    },
    addEventListener(이름, 손) {
      (this.listeners[이름] ||= []).push(손);
    },
    /** 그 요소에 걸린 손을 부른다. 검사에서 일이 일어난 것처럼 만든다. */
    울리기(이름, ...인자) {
      (this.listeners[이름] || []).forEach((손) => 손(...인자));
    },
    append(...아이들) {
      아이들.forEach((아이) => {
        아이.parentElement = this;
        this.children.push(아이);
      });
    },
    replaceChildren(...아이들) {
      this.children.forEach((아이) => (아이.parentElement = null));
      this.children = [];
      this.append(...아이들);
    },
    remove() {
      const 위 = this.parentElement;
      if (!위) return;
      위.children = 위.children.filter((아이) => 아이 !== this);
      this.parentElement = null;
    },
    matches(고르개) {
      return 맞나(this, 고르개);
    },
    closest(고르개) {
      let 여기 = this;
      while (여기) {
        if (맞나(여기, 고르개)) return 여기;
        여기 = 여기.parentElement;
      }
      return null;
    },
    querySelectorAll(고르개) {
      return 아래전부(this).filter((아이) => 맞나(아이, 고르개));
    },
    querySelector(고르개) {
      const 찾은것 = this.querySelectorAll(고르개)[0];
      if (찾은것) return 찾은것;
      /*
       * 여기는 일부러 얕다. innerHTML 로 지은 것은 글자일 뿐이라 나무에 안 들어가는데,
       * 그린 뒤에 그 안의 요소를 찾아 손을 거는 자리가 있다(깨진 그림 걷어내기).
       * 글자를 진짜로 파싱하지 않고, 그런 태그가 글에 있으면 대신 설 것 하나를 내준다.
       * 이 흉내로 못 볼 만큼 복잡한 일을 하게 되면 그때는 이 본을 고칠 때다.
       */
      const 태그 = 고르개.trim().split(/[\s,]+/).at(-1);
      if (!/^[\w-]+$/.test(태그) || !this.innerHTML.includes(`<${태그}`)) return null;
      선것[태그] ||= 요소만들기(태그);
      return 선것[태그];
    },
    /** 애니메이션은 기본으로 없다. 있는 것처럼 하려면 검사에서 갈아 끼운다. */
    getAnimations() {
      return [];
    },
  };
  return 요소;
}

/**
 * `document` 를 세운다. 이미 그린 글자(innerHTML)만 보는 자리는 이것만으로 충분하다.
 * @returns {{만든것: object[], 뿌리: object}}
 */
export function 문서세우기() {
  const 만든것 = [];
  const 뿌리 = 요소만들기("html");
  globalThis.document = {
    documentElement: 뿌리,
    body: 요소만들기("body"),
    createElement(tagName) {
      const 요소 = 요소만들기(tagName);
      만든것.push(요소);
      return 요소;
    },
    querySelectorAll: (고르개) => 뿌리.querySelectorAll(고르개),
    querySelector: (고르개) => 뿌리.querySelector(고르개),
  };
  return { 만든것, 뿌리 };
}

/** `<a class="b"><c/></a>` 꼴로 나무를 세운다. 검사에서 손으로 엮는 수고를 던다. */
export function 나무(tagName, { 반 = [], 속성 = {}, 자료 = {}, 폭 = 0 } = {}, ...아이들) {
  const 요소 = 요소만들기(tagName);
  반.forEach((이름) => 요소.classList.add(이름));
  Object.entries(속성).forEach(([이름, 값]) => 요소.setAttribute(이름, 값));
  Object.assign(요소.dataset, 자료);
  요소.offsetWidth = 폭;
  요소.append(...아이들);
  return 요소;
}

/**
 * 그린 글자에서 태그를 속성 표로 뽑는다. `<a class="x" href="y">` → `{class:"x", href:"y"}`.
 *
 * 속성 차례에 기대지 않으려고 둔다. 정규식으로 `<a class="x" href="y"` 를 통째로 견주면
 * 차례만 바꿔도 검사가 헛되이 운다 — tests/trend-chart.test.mjs 가 먼저 겪고 이 꼴을 만들었다.
 */
export function 태그들(글, 이름) {
  return [...글.matchAll(new RegExp(`<${이름}\\b([^>]*)>`, "g"))].map(([, 속성]) =>
    Object.fromEntries([...속성.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, 키, 값]) => [키, 값])),
  );
}
