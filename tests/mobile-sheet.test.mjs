import assert from "node:assert/strict";
import test from "node:test";

import { STYLE_FILES, css, html, source as app, styleImportEntry } from "./helpers/source.mjs";

test("style.css는 분할된 스타일을 캐스케이드 순서대로 임포트한다", () => {
  const imported = [...styleImportEntry.matchAll(/@import "\.\/styles\/(\w+)\.css"/g)].map((m) => m[1]);
  assert.deepEqual(imported, STYLE_FILES, "임포트 순서가 바뀌면 특이도 경합 결과가 달라진다");
});

test("날짜는 일관된 표시층과 네이티브 선택기를 함께 사용한다", () => {
  assert.match(html, /class="date-control"/);
  assert.match(html, /id="date-display"/);
  assert.match(html, /type="date"[^>]*aria-label="날짜"/);
  assert.match(app, /function syncDateDisplay\(\)/);
});

test("바텀시트는 세로 스크롤만 허용하고 스크롤 전파를 막는다", () => {
  const formRule = css.match(/\n\.sheet-scroll \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(formRule, /overflow-x:\s*hidden/);
  assert.match(formRule, /overflow-y:\s*auto/);
  assert.match(formRule, /overscroll-behavior:\s*contain/);
  assert.match(formRule, /touch-action:\s*pan-y/);
});

test("헤더와 닫기 버튼은 스크롤 영역 밖에 고정된다", () => {
  const sheetRule = css.match(/\n\.sheet \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(sheetRule, /overflow:\s*hidden/);
  assert.match(sheetRule, /flex-direction:\s*column/);

  const formRule = css.match(/\n\.sheet-scroll \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(formRule, /min-height:\s*0/);
  assert.match(formRule, /flex:\s*1 1 auto/);
});

test("닫히는 중인 바텀시트는 탭이 입력 요소로 새지 않는다", () => {
  assert.match(css, /\.sheet:not\(\.is-visible\)\s*\{[^}]*pointer-events:\s*none/, "두 시트가 공유하는 규칙이어야 한다");
  assert.match(html, /<dialog class="sheet" id="entry-sheet"/);
  assert.match(html, /<dialog class="sheet month-sheet" id="month-sheet"/);
  const hideFn = app.match(/function hideSheet\([\s\S]*?\n\}/)?.[0] || "";
  assert.match(hideFn, /\.blur\(\)/);
});

test("월 선택은 네이티브 input이 아닌 자체 시트로 동작한다", () => {
  assert.doesNotMatch(html, /type="month"/);
  // role="dialog" 는 <dialog> 가 스스로 갖는다.
  assert.match(app, /elements\.monthTrigger\.addEventListener\("click", openMonthSheet\)/);
});

test("월 선택 시트는 연도를 이동하며 특정 연·월로 바로 갈 수 있다", () => {
  assert.match(app, /function buildMonthGrid\(\)/);
  assert.match(app, /length: 12/);
  const selectFn = app.match(/function selectMonth\([\s\S]*?\n\}/)?.[0] || "";
  assert.match(selectFn, /setSelectedMonth\(monthKey\)/);
  assert.match(app, /shiftPickerYear\(-1\)/);
  assert.match(app, /shiftPickerYear\(1\)/);
});

test("바텀시트는 아래로 쓸어내리면 닫힌다", () => {
  assert.match(app, /onDrag\(\{ dy, context \}\) \{[\s\S]*?--drag-y/, "끌린 거리를 시트에 반영해야 한다");
  assert.match(app, /scroller\.scrollTop > 0/, "내부가 스크롤돼 있으면 스크롤이 우선이다");
  assert.match(app, /context\.offset > DISMISS_DISTANCE/);
  assert.match(app, /dismiss\(\)/, "닫기 동작은 주입받아 호출한다");
});

test("드래그 오프셋은 데스크톱 중앙 정렬 transform과 합성된다", () => {
  assert.match(css, /\.sheet\.is-visible\s*\{[^}]*transform:\s*translateY\(var\(--drag-y, 0px\)\)/);
  assert.match(css, /transform:\s*translateY\(calc\(-50% \+ var\(--drag-y, 0px\)\)\) scale\(1\)/);
});

test("폼 입력 필드는 iOS 자동 확대를 막기 위해 16px 이상이다", () => {
  /*
   * [^}] 로 규칙 안에 가둔다. [\s\S]*? 로 두면 그 규칙에 font-size 가 없을 때
   * 닫는 괄호를 넘어 다음 규칙의 값을 읽는다 — 엉뚱한 14px 을 잡아 실패했다.
   */
  const rules = {
    "지출 항목·분류": /\.field-group input\[type="text"\],\s*\n\.field-group select \{[^}]*font-size:\s*(\d+)px/,
    "날짜": /\n\.date-control \{[^}]*font-size:\s*(\d+)px/,
    "금액": /\.amount-field input\[type="text"\] \{[^}]*font-size:\s*(\d+)px/,
  };
  for (const [name, pattern] of Object.entries(rules)) {
    const match = css.match(pattern);
    assert.ok(match, `${name} 필드의 font-size 규칙을 찾지 못했습니다`);
    assert.ok(Number(match[1]) >= 16, `${name} 필드가 ${match[1]}px (16px 미만이면 iOS가 확대함)`);
  }
});

test("바텀시트를 열 때 직전 스크롤 위치가 남지 않는다", () => {
  const openFn = app.match(/function openForm\([\s\S]*?\n\}/)?.[0] || "";
  assert.match(openFn, /elements\.form\.scrollTop = 0/);
});

test("바텀시트가 열리면 iOS에서도 배경 페이지 위치를 고정한다", () => {
  assert.match(app, /document\.body\.style\.position = "fixed"/);
  assert.match(app, /document\.body\.style\.top = `-\$\{lockedScrollY\}px`/);
  assert.match(app, /window\.scrollTo\(0, lockedScrollY\)/);
});
