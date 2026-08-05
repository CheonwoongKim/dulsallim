import postcss from "postcss";

/**
 * CSS 를 블록과 선언으로 읽는다.
 *
 * 예전에는 검사 파일 안에서 글자를 한 자씩 세며 따옴표·괄호·중첩을 손수 따라갔다.
 * 그 읽기에는 검사를 통째로 지나쳐 버리는 구멍이 둘 있었다.
 *  · 선언은 세미콜론에서만 기록했다. 블록의 마지막 선언에서 세미콜론을 빼면
 *    그 선언이 아예 안 보였다(재현: `.trend-note { ...; padding: 18px }` 가 통과했다.
 *    중첩 CSS 의 `& span { padding: 18px }` 도 같은 이유로 통과했다).
 *  · 괄호 깊이가 0 보다 크면 중괄호도 세미콜론도 건너뛰었다. 선택자에 짝 없는
 *    이스케이프 괄호가 하나 있으면(`.trend-note\(`) 깊이가 영영 안 내려와 그 뒤가 통째로
 *    안 보였다(계측: 합친 CSS 의 선언이 1456 → 1304 건. trend·auth·responsive 가 통째로 사라졌다).
 *
 * 그래서 vite 가 이미 의존성으로 들고 있는 postcss 로 옮겼다. 브라우저가 읽는 것과
 * 같은 규칙으로 읽으므로 이스케이프 식별자·at-규칙·url() 안의 특수문자·중첩에서 갈리지 않는다.
 *
 * 옛 읽기와 뜻을 맞춘 자리가 셋이다.
 *  · `!important` — postcss 는 값에서 떼어 따로 들지만, 검사는 "적힌 값 그대로"를 본다.
 *    떼어 두면 `z-index: var(--layer-sheet) !important` 가 단일 토큰으로 보여 통과한다.
 *  · 몸통 없는 at-규칙(`@import` 등)은 블록이 아니다.
 *  · 블록 밖(최상위)의 선언은 세지 않는다.
 */

/** 블록 이름 — 규칙은 선택자, at-규칙은 `@이름 조건`. 옛 읽기가 중괄호 앞 글자를 쓰던 것과 같다. */
const 블록이름 = (node) => (node.type === "rule"
  ? node.selector
  : `@${node.name}${node.raws.afterName ?? " "}${node.params}`).trim();

/**
 * 여는 중괄호 자리. 적힌 그대로의 글자 길이로 세야 주석이 든 선택자에서도 어긋나지 않는다
 * (postcss 의 selector·params 는 주석을 지운 값이라 원본보다 짧다).
 */
const 여는자리 = (node) => {
  const 앞 = node.type === "rule"
    ? node.raws.selector?.raw ?? node.selector
    : `@${node.name}${node.raws.afterName ?? " "}${node.raws.params?.raw ?? node.params}`;
  return node.source.start.offset + 앞.length + (node.raws.between ?? "").length;
};

/** 내용이 있는 주석만 이유로 친다. `/**\/` 처럼 빈 것은 아무것도 설명하지 않는다. */
const 내용있는주석 = (node) => node.type === "comment" && node.text.trim() !== "";

/**
 * 이 선언 앞에 이유를 적은 주석이 있나.
 *
 * 범위는 옛 읽기와 같다 — 같은 블록 안에서 이 선언보다 앞선 주석 전부와,
 * 블록의 선택자에 바로 붙어 있는 주석들이다. 더 위 조상의 주석까지는 보지 않는다.
 * 값 안이나 선택자 안에 낀 주석은 세지 않는다. 그건 그 선언을 설명하는 자리가 아니다.
 */
const 이유주석있나 = (node) => {
  for (let 앞 = node.prev(); 앞; 앞 = 앞.prev()) if (내용있는주석(앞)) return true;
  for (let 앞 = node.parent.prev(); 앞?.type === "comment"; 앞 = 앞.prev()) if (내용있는주석(앞)) return true;
  return false;
};

/** 바깥에서 안쪽 차례로 감싼 블록 이름들. 마지막이 이 선언이 든 블록이다. */
const 감싼것들 = (node) => {
  const 이름들 = [];
  for (let 위 = node.parent; 위 && 위.type !== "root"; 위 = 위.parent) 이름들.unshift(블록이름(위));
  return 이름들;
};

export function css구조읽기(source, 이름표 = "css") {
  const root = postcss.parse(source, { from: 이름표 });
  const 블록들 = [];
  const 선언들 = [];

  root.walk((node) => {
    if (node.type === "rule" || node.type === "atrule") {
      if (!node.nodes) return;
      const open = 여는자리(node);
      const close = node.source.end.offset - 1;
      // 파서가 주는 자리를 그대로 믿지 않는다. 어긋나면 :root 를 잘라 읽는 검사가 조용히 헛돈다.
      if (source[open] !== "{" || source[close] !== "}") {
        throw new Error(`${이름표}: ${블록이름(node)} 의 중괄호 자리를 못 찾았다`);
      }
      블록들.push({ selector: 블록이름(node), open, close });
      return;
    }
    if (node.type !== "decl" || node.parent.type === "root") return;
    const contexts = 감싼것들(node);
    선언들.push({
      property: node.prop,
      value: node.value + (node.important ? node.raws.important ?? " !important" : ""),
      selector: contexts.at(-1),
      contexts,
      이유주석: 이유주석있나(node),
    });
  });

  return { 블록들, 선언들 };
}
