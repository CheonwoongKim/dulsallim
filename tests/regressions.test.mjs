import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatMoney } from "../src/expenses.js";
import { describeApplied } from "../src/fixed-costs.js";
import { MAX_AMOUNT, formatAmountInput, isValidAmount, readAmount } from "../src/money.js";

/** 배치 크기는 소스에서 읽는다 — 숫자를 두 곳에 적으면 한쪽만 바뀐다. */
const APPLY_BATCH_SIZE = Number(/const APPLY_BATCH = (\d+);/.exec(app)[1]);
import { css, fn, html, source as app, sourceLineCounts, STYLE_FILES, sw } from "./helpers/source.mjs";
import { css구조읽기 } from "./helpers/css-model.mjs";

const 스타일별CSS = Object.fromEntries(await Promise.all(STYLE_FILES.map(async (name) => [
  name,
  await readFile(new URL(`../src/styles/${name}.css`, import.meta.url), "utf8"),
])));
const CSS구조 = css구조읽기(css, "합친 CSS");
const 스타일별구조 = Object.fromEntries(STYLE_FILES.map((name) => [name, css구조읽기(스타일별CSS[name], `${name}.css`)]));
const 루트블록 = 스타일별구조.base.블록들.filter(({ selector }) => selector === ":root")[0];
const 루트토큰 = new Set(스타일별구조.base.선언들
  .filter(({ selector, property }) => selector === ":root" && property.startsWith("--"))
  .map(({ property }) => property));

const 토큰참조 = (value) => [...value.matchAll(/var\(\s*(--[\w-]+)(\s*,)?[^)]*\)/g)]
  .map((m) => ({ name: m[1], fallback: Boolean(m[2]) }));
const 단일토큰인가 = (value, prefix) => {
  const m = value.match(new RegExp(`^var\\(\\s*(--${prefix}-[\\w-]+)\\s*\\)$`));
  return Boolean(m && 루트토큰.has(m[1]));
};
const 선언표시 = ({ selector, property, value }) => `${selector} { ${property}: ${value}; }`;

test("제출 검증은 날짜를 반드시 확인한다", () => {
  const validateFn = fn("validateExpenseInput");
  assert.match(validateFn, /isValidDateKey\(date\)/, "날짜 검증이 없으면 빈 날짜가 저장돼 기록이 유실된다");
  assert.match(validateFn, /elements\.dateError\.textContent/);
  assert.match(html, /id="date-error"/, "오류를 표시할 자리가 있어야 한다");
});

test("검증 실패 시 첫 번째 잘못된 필드로 포커스를 옮긴다", () => {
  assert.match(fn("handleSubmit"), /firstInvalidField\.focus\(\)/);
  assert.doesNotMatch(app, /elements\.item\.focus\(\);[\s\S]*elements\.amount\.focus\(\)/, "필드별 개별 focus 호출은 순서가 꼬인다");
});

test("서버가 확인해 준 뒤에야 화면 사본을 고친다", () => {
  // 먼저 고치고 나중에 보내면, 서버가 거절해도 화면에는 남아 있는 것처럼 보인다.
  for (const [name, pattern] of [
    ["addExpense", /await remote\.insertExpense[\s\S]*expenses = \[\.\.\.expenses, created\]/],
    ["editExpense", /await remote\.updateExpense[\s\S]*expenses = expenses\.map/],
    ["removeExpense", /await remote\.deleteExpense[\s\S]*expenses = expenses\.filter/],
  ]) {
    assert.match(fn(name), pattern, `${name}이 서버 응답 전에 사본을 고친다`);
  }
});

test("불러오기에 실패하면 빈 가계부 대신 이유를 보여준다", () => {
  // 빈 목록을 그리면 기록이 전부 지워진 줄 안다.
  const start = fn("startApp");
  assert.match(start, /catch \(error\)[\s\S]*showDataGate\(error\.message, true\)/);
  // 그리는 일이 전부 try 안에 있어야 한다. 밖에 있으면 실패한 뒤에도 빈 목록이 그려진다.
  assert.ok(start.indexOf("render();") < start.indexOf("} catch (error) {"),
    "render 가 catch 뒤에 있으면 실패해도 그려진다");
  assert.match(app, /elements\.retryLoad\.addEventListener\("click"/, "다시 시도할 방법이 있어야 한다");
});

test("모든 저장 경로가 실패를 사용자에게 알린다", () => {
  for (const name of ["handleSubmit", "deleteExpense", "undoDelete", "handleFixedSubmit", "removeFixedTemplate"]) {
    const body = fn(name);
    assert.match(body, /catch \(error\) \{\s*showToast\(error\.message\);\s*return;/, `${name}이 실패를 조용히 넘긴다`);
  }
});

test("응답을 기다리는 동안 같은 버튼을 두 번 누를 수 없다", () => {
  // 왕복이 느리면 사용자는 한 번 더 누른다. 그대로 두면 같은 지출이 두 건 기록된다.
  assert.match(fn("handleSubmit"), /elements\.submit\.disabled = true[\s\S]*elements\.submit\.disabled = false/);
  assert.match(fn("handleFixedSubmit"), /elements\.fixedSubmit\.disabled = true[\s\S]*elements\.fixedSubmit\.disabled = false/);
});

test("지출 목록은 변경 시 새 배열을 만든다", () => {
  assert.doesNotMatch(app, /expenses\.push\(/, "배열 직접 변경은 롤백을 불가능하게 한다");
  assert.doesNotMatch(app, /expenses\.splice\(/);
});

test("토스트 숨김 타이머는 추적되어 취소할 수 있다", () => {
  const show = fn("showToast");
  const hide = fn("hideToast");
  assert.match(hide, /stopWaiting = afterMotion\(elements\.toast/, "추적되지 않으면 새 토스트를 즉시 지워버린다");
  assert.match(hide, /stopWaiting\?\.\(\)/);
  assert.match(show, /stopWaiting\?\.\(\)/, "새 토스트를 띄울 때 이전 숨김 예약을 취소해야 한다");
});

test("토스트가 보이는 동안에는 하단 등록 버튼이 자리를 비운다", () => {
  const show = fn("showToast");
  const hide = fn("hideToast");
  const suppress = fn("setFloatingAddSuppressed");

  assert.match(show, /setFloatingAddSuppressed\(true\)/, "토스트가 나타날 때 FAB부터 숨겨야 한다");
  assert.match(
    hide,
    /elements\.toast\.hidden = true;\s*setFloatingAddSuppressed\(false\)/,
    "토스트의 퇴장 애니메이션이 끝난 뒤 FAB가 돌아와야 한다"
  );
  assert.match(suppress, /elements\.floatingAdd\.disabled = suppressed/, "보이지 않는 FAB가 눌리면 안 된다");
  assert.match(css, /\.floating-add\.is-toast-suppressed\s*\{[\s\S]*?pointer-events:\s*none;[\s\S]*?opacity:\s*0;/);
});

test("연도와 월 이동에는 상한·하한이 있다", () => {
  assert.match(fn("shiftPickerYear"), /clampYear\(/);
  assert.match(fn("openMonthSheet"), /clampYear\(/);
  assert.match(fn("selectMonth"), /isValidMonthKey\(monthKey\)/);
  assert.match(fn("shiftMonth"), /isValidMonthKey\(nextMonth\)/);
  assert.match(app, /elements\.prevYear\.disabled/, "경계에서 버튼을 비활성화해 시각적으로도 알려야 한다");
});

test("시트 손잡이를 잡아도 닫히지 않는다", () => {
  /*
   * top layer 에서는 배경 자리의 누름이 시트 자신에게 온다. 그런데 시트의 자기 여백 —
   * 맨 위 손잡이가 놓인 13px 띠 — 을 눌러도 똑같이 시트가 잡힌다.
   * target 만 보고 닫으면 적다 만 폼이 손잡이를 잡는 순간 날아간다(계측: 실제로 닫혔다).
   * 눌린 자리가 시트 상자 밖일 때만 배경이다.
   */
  const 배선 = app.match(/sheet\.addEventListener\("click"[\s\S]*?\n  \}\);/)[0];
  assert.match(배선, /const 상자 = sheet\.getBoundingClientRect\(\)/);
  assert.match(배선, /event\.clientY < 상자\.top/);
  // 키보드로 누른 click 은 좌표가 0 이다. 그걸 "왼쪽 위 바깥"으로 읽으면 안 된다.
  assert.match(배선, /event\.detail === 0\) return/);
});

test("한 번에 온 여러 기록 중 마지막을 본다", () => {
  // 첫 기록만 보면 이미 지나간 상태로 판단하게 된다.
  assert.match(app, /const 마지막 = \(entries\) => entries\[entries\.length - 1\]/);
  assert.match(fn("rewatch"), /마지막\(entries\)/);
});

test("닫는 도중 다른 화면을 열어도 앞 화면이 남지 않는다", () => {
  /*
   * 닫는 연출이 끝나기를 기다리던 것을 그냥 취소하면, 그 화면이 hidden = false 인 채
   * DOM 에 남는다. 눈에는 안 보여도(is-visible 이 빠져 옆으로 밀려 있다) 버튼은
   * 그대로 눌리고 탭으로도 들어간다.
   * 계측: 설정을 닫자마자 마이페이지를 열면 설정 화면 버튼이 히트테스트에 잡혔다.
   */
  assert.match(fn("showPage"), /finishClose\(\{ unlock: false \}\)/, "취소만 하면 안 되고 마무리를 지어야 한다");
  assert.match(fn("finishClose"), /page\.hidden = true/);
  // 잠금은 곧 열 화면이 이어받는다. 풀었다 다시 걸면 그사이 스크롤이 제자리로 튄다.
  assert.match(fn("finishClose"), /if \(unlock\) unlockPageScroll\(\)/);
});

test("앱을 다시 띄워도 머리 관찰자가 쌓이지 않는다", () => {
  /*
   * watchHeaderSummary 는 앱을 띄울 때마다 불린다 — 로그인, 다시 로그인,
   * 불러오기 실패 후 다시 시도. 먼저 걸어 둔 것을 끊지 않으면 하나씩 쌓여
   * 화면을 돌릴 때 rewatch 가 그만큼 겹쳐 돈다.
   * 계측: 세 번 로그인하니 살아 있는 ResizeObserver 가 3개였다(고친 뒤 1개).
   */
  assert.match(fn("watchHeaderSummary"), /sizeObserver\?\.disconnect\(\)/);
  assert.match(fn("rewatch"), /for \(const observer of observers\) observer\.disconnect\(\)/);
});

test("시트 껍데기에는 포커스 테두리를 그리지 않는다", () => {
  /*
   * 열릴 때 껍데기(tabindex=-1)에 포커스를 준다. 보조기술이 "무엇이 열렸는지"부터
   * 읽게 하려는 것이지 사람이 고른 자리가 아니다. 그런데 브라우저는 outline: auto 로
   * 시트 둘레에 기본 링을 그린다(iOS 에서는 파란색). 좌우와 아래는 화면 밖이라
   * 위쪽 한 줄만 파랗게 보였다. 계측: outline-style 이 auto 였다.
   *
   * Tab 으로 닿을 수 없는 요소라 지워도 키보드 사용자가 잃는 표시가 없다.
   */
  assert.match(css, /\.sheet:focus \{[^}]*outline: none/);
  // 안쪽 버튼·입력칸의 표시까지 지우면 키보드로 어디 있는지 알 수 없어진다.
  assert.doesNotMatch(css, /\.sheet [^{]*:focus[^{]*\{[^}]*outline: none/);
});

test("시트를 열어도 닫기 아이콘에 포커스 링이 뜨지 않는다", () => {
  /*
   * showModal 은 시트 안 첫 요소에 포커스를 준다 — 우리 경우 닫기 버튼이다.
   * 그러면 열자마자 X 둘레에 동그란 링이 떠서, 누르지도 않았는데 눌린 것처럼 보인다.
   * 껍데기를 잡아 두면 링이 없고, 보조기술도 "무엇이 열렸는지"부터 읽는다.
   *
   * showModal 바로 다음 줄이어야 한다. 프레임을 넘기면 링이 한 번 그려졌다 사라진다.
   */
  assert.match(fn("showSheet"), /showModal\(\);\s*(?:\/\/[^\n]*\n\s*)*moveFocusIntoSheet\(sheet, true\)/);
  assert.match(fn("moveFocusIntoSheet"), /if \(!무조건 && sheet\.contains\(document\.activeElement\)\) return/);
});

test("시트는 화면 바닥에 붙는다", () => {
  /*
   * <dialog> 기본값은 top: 0 이다. 아래(bottom)와 함께 위(top)까지 정해지면
   * margin: auto 가 남는 자리를 위아래로 똑같이 나눠 시트를 화면 한가운데로 밀어 올린다.
   * 계측: 위 137px 아래 137px 로 떠서, 시트와 화면 바닥 사이에 빈 띠가 생겼다.
   * <section> 이던 시절에는 top 이 원래 auto 라 드러나지 않던 자리다.
   */
  const 시트 = css.match(/\n\.sheet \{[^}]*\}/)[0];
  assert.match(시트, /top: auto/, "위를 놓아 두어야 바닥에 붙는다");
  assert.match(시트, /bottom: var\(--keyboard-inset/);
});

test("시트는 브라우저가 가둬 준다", () => {
  /*
   * 예전에는 Tab 순환을 손으로 가두고(trapTab), 다른 길로 새어 나간 포커스도
   * 되돌려 놓았다(keepFocusInSheet). <dialog> 를 showModal 로 열면 브라우저가
   * 포커스를 가두고, 바깥을 통째로 못 만지게 하고, 배경까지 그려 준다.
   * role="dialog" 와 aria-modal 도 요소 자체가 갖는다.
   */
  assert.match(fn("showSheet"), /if \(!sheet\.open\) sheet\.showModal\(\)/);
  assert.doesNotMatch(app, /function trapTab|function keepFocusInSheet/, "손으로 가두던 장치는 없앴다");
  assert.doesNotMatch(html, /aria-modal|role="dialog"/, "<dialog> 가 스스로 갖는 것을 또 적지 않는다");
  for (const id of ["entry-sheet", "month-sheet", "fixed-sheet", "nag-sheet", "trend-sheet", "reset-sheet", "notes-sheet"]) {
    assert.match(html, new RegExp(`<dialog class="sheet[^"]*" id="${id}"`), `${id} 가 <dialog> 가 아니다`);
  }
});

test("로그아웃하면 앞사람 기록이 화면에 남지 않는다", () => {
  const clear = fn("clearData");
  assert.match(clear, /비우기\(\)/);
  assert.match(clear, /context = null/);
  assert.match(clear, /setMembers\(\[\]\)/);
  /*
   * 비우는 일은 초기화와 로그아웃이 똑같이 한다. 두 곳에 따로 적어 두면 하나만 늘게 되고,
   * 빠진 쪽에는 앞사람 기록이 남는다. 지금은 한 함수가 다 지운다.
   */
  const 비우기 = fn("비우기");
  for (const line of [/expenses = \[\]/, /fixedTemplates = \[\]/, /fixedApplied = \[\]/,
                      /noteCounts = \{\}/, /countedNoteIds = new Set\(\)/]) {
    assert.match(비우기, line);
  }
  assert.match(fn("resetHousehold"), /비우기\(\)/, "초기화도 같은 것을 쓴다");
  // 사본만 비우고 다시 그리지 않으면 앞사람 목록이 화면에 그대로 남는다.
  assert.match(app, /clearData\(\);[\s\S]{0,200}?render\(\);/, "로그아웃 처리에서 사본을 비우고 다시 그려야 한다");
  assert.match(app, /unsubscribe\(channel\)/, "구독을 남기면 남의 가구 변경을 계속 받는다");
});

test("서비스워커는 성공한 동일 출처 응답만 캐시한다", () => {
  assert.match(sw, /origin !== self\.location\.origin/, "외부 CDN 응답까지 캐시하면 안 된다");
  assert.match(sw, /response\.ok/, "4xx·5xx를 캐시하면 오프라인에서 오류가 굳는다");
  assert.match(sw, /response\.type === "basic"/);
  assert.match(sw, /\.catch\(\(\) => \{\}\)/, "cache.put 실패가 unhandled rejection이 되면 안 된다");
});

test("닫기 버튼은 완성된 click 하나로만 닫는다", () => {
  // pointerdown에서 시트를 움직이면 같은 탭의 pointerup/click 대상이 배경이나 select로 바뀐다.
  // click이 X 버튼으로 확정된 뒤에 닫으면 전역 클릭 삼키기가 필요 없다.
  const helper = fn("closeOnPress");
  assert.match(helper, /addEventListener\("click", close\)/);
  assert.doesNotMatch(helper, /pointerdown/, "제스처가 끝나기 전에 시트를 움직이면 안 된다");
  assert.doesNotMatch(app, /swallowNextClick|swallowTimer/, "다음 정상 클릭을 전역에서 삼키면 안 된다");

  // 네 개의 닫기 버튼이 모두 같은 처리를 받아야 한다. 하나만 빠지면 그 시트에서만 재발한다.
  for (const button of ["closeForm", "closeMonthSheet", "closeNotes", "closeFixedSheet"]) {
    assert.match(app, new RegExp(`closeOnPress\\(elements\\.${button},`), `${button}이 공통 처리를 받지 않는다`);
  }
});

test("닫기 버튼 누름은 시트 드래그로 오인되지 않는다", () => {
  assert.match(app, /closest\("\.close-button"\)/, "닫기 버튼 위 누름은 onBegin에서 걸러야 한다");
});

test("키보드 변화 때문에 폼 전체의 입력을 임의로 차단하지 않는다", () => {
  // VisualViewport 이벤트는 Safari UI 상태에 따라 늦게 올 수 있다. 그 시점부터 폼을 막으면
  // 오탭을 막는 것이 아니라 사용자가 다음에 누른 정상 버튼을 잃는다.
  assert.doesNotMatch(app, /settleOnFocusLeave|beginSettle/);
  assert.doesNotMatch(app, /visualViewport\?\.addEventListener\("resize"/);
});

test("사람별 필터는 목록에만 적용되고 상단 요약은 그 달 전체를 유지한다", () => {
  const renderFn = fn("render");
  assert.match(renderFn, /const stats = summarize\(monthly, getMembers\(\)\)/, "요약은 필터 이전 목록으로 계산해야 한다");
  assert.match(renderFn, /filterByMember\(monthly, memberFilter\)/);
  assert.match(renderFn, /renderList\(visible\)/);
  assert.match(fn("paintLedgerHeading"), /elements\.count\.textContent = `\(\$\{visible\.length\}\)`/, "건수는 필터된 목록 기준");
  assert.doesNotMatch(renderFn, /summarize\(visible\)/, "요약을 필터된 목록으로 계산하면 합계가 흔들린다");
});

test("요약 카드는 눌림 상태를 알리는 버튼이다", () => {
  assert.match(html, /<button class="member-row"[^>]*aria-pressed="false"/);
  assert.match(fn("paintMemberShares"), /slot\.row\.setAttribute\("aria-pressed", String\(memberFilter === share\.id\)\)/);
});

test("사람 이름은 코드가 아니라 서버에서 온다", () => {
  // 이름을 코드에 박으면 DB와 화면이 어긋나고, 계정을 바꿀 때마다 배포해야 한다.
  assert.doesNotMatch(app, /천웅|주연/, "사람 이름을 코드에 박으면 안 된다");
  assert.doesNotMatch(html, /천웅|주연/);
  assert.match(fn("paintMembers"), /slot\.name\.textContent = `\$\{member\.name\} 지출`/);
  assert.match(fn("paintMembers"), /radio\.value = member\.id/, "결제자 선택도 같은 명부를 따라야 한다");
});

test("지출을 저장하면 필터가 풀려 방금 넣은 기록이 보인다", () => {
  assert.match(fn("handleSubmit"), /setMemberFilter\(null\)/);
});

test("고정비는 한 트랜잭션으로 반영해 같은 달이 두 번 들어가지 않는다", async () => {
  // 예전에는 표시·생성·연결을 세 요청으로 나눴다. 지출이 저장된 뒤 응답만 유실되면
  // 표시를 되돌리고 재시도해 같은 지출이 두 번 생겼다 — 되돌리기가 곧 중복의 원인이었다.
  const apply = fn("applyOccurrence");
  assert.match(apply, /rpc\("apply_fixed_cost"/);
  assert.doesNotMatch(apply, /\.delete\(\)/, "되돌릴 일이 없어야 한다");
  assert.match(fn("applyDueFixedCosts"), /applyOccurrences\(due\)/);

  const { readFile } = await import("node:fs/promises");
  for (const file of ["schema.sql", "migration-hardening.sql"]) {
    const sql = await readFile(new URL(`../supabase/${file}`, import.meta.url), "utf8");
    const 함수 = sql.match(/create or replace function apply_fixed_cost[\s\S]*?\n\$\$;/)[0];

    const 표시 = 함수.indexOf("insert into fixed_cost_applications");
    const 생성 = 함수.indexOf("insert into expenses");
    assert.ok(표시 > -1 && 생성 > 표시, `${file}: 지출을 먼저 만들면 상대 폰이 같은 지출을 또 만든다`);
    assert.match(함수, /on conflict \(fixed_cost_id, month\) do nothing/, `${file}: 이미 반영된 달은 건너뛸 일이다`);
    // definer 는 RLS 를 우회한다. 이 검사가 남의 가구 고정비를 막는 유일한 벽이다.
    assert.match(함수, /household_id = current_household_id\(\)/, `${file}: 가구 검사가 없다`);
  }
});

test("고정비 시트도 다른 시트와 같은 처리를 받는다", () => {
  assert.match(app, /SHEETS = \[[^\]]*elements\.fixedSheet[^\]]*\]/, "고정비 시트가 공통 배선 목록에 있어야 한다");
  assert.match(fn("closeActiveSheet"), /closeFixedSheet\(\)/);
  assert.match(app, /closeOnPress\(elements\.closeFixedSheet, closeFixedSheet\)/);
  assert.match(html, /<dialog class="sheet" id="fixed-sheet"/);
});

test("고정비 수정은 id와 시작월을 유지한다", () => {
  const submit = fn("handleFixedSubmit");
  assert.match(submit, /updateFixedCost\(existing\.id, template\)/, "새로 만들면 반영 기록과 연결이 끊긴다");
  assert.match(submit, /startMonth: existing\?\.startMonth/, "금액만 고쳤는데 반영 일정이 바뀌면 안 된다");
});

test("폼은 등록과 수정 모드를 구분해 보여준다", () => {
  const form = fn("showFormView");
  assert.match(form, /editingFixedId = template\?\.id \|\| null/);
  assert.match(form, /고정비 수정/);
  assert.match(form, /변경사항 저장/);
  assert.match(fn("showListView"), /editingFixedId = null/, "목록으로 돌아가면 수정 상태가 남으면 안 된다");
});

test("고정비 템플릿을 지워도 이미 기록된 지출은 남는다", () => {
  const remove = fn("removeFixedTemplate");
  assert.match(remove, /deleteFixedCost\(id\)/);
  assert.doesNotMatch(remove, /removeExpense\(|deleteExpense\(/, "지난 달 기록을 지우면 가계부가 어긋난다");
});

test("두 목록이 같은 스와이프 구현을 공유한다", () => {
  // 선택자가 갈라지면 한쪽만 고쳐지는 버그가 생긴다.
  assert.match(app, /closest\("\.swipe-row"\)/);
  assert.match(app, /querySelectorAll\("\.swipe-surface, \.swipe-actions"\)/);

  for (const marker of ['expense-item swipe-row', 'fixed-item swipe-row']) {
    assert.ok(app.includes(marker), `${marker} 행이 스와이프 대상이어야 한다`);
  }
  assert.match(app, /elements\.fixedList\.addEventListener\("pointerdown", startSwipe\)/);
  assert.match(app, /elements\.list\.addEventListener\("pointerdown", startSwipe\)/);
});

test("스와이프 구현 자체는 어떤 목록인지 몰라야 한다", async () => {
  // 지출 목록 전용 선택자가 스며들면 고정비 목록에서 조용히 동작이 갈라진다.
  const { readFile } = await import("node:fs/promises");
  const swipe = await readFile(new URL("../src/ui/swipe.js", import.meta.url), "utf8");
  assert.doesNotMatch(swipe, /expense-item|fixed-item/, "스와이프가 특정 목록에 묶여 있다");
});

test("스와이프 기계 CSS는 한곳에만 있다", () => {
  assert.match(css, /\.swipe-row \{[^}]*overflow: hidden/);
  assert.match(css, /\.swipe-actions \{[^}]*left: 100%/, "닫힌 동안 행 밖에 있어야 색이 새지 않는다");
  assert.doesNotMatch(css, /\.expense-item\.is-dragging/, "행 종류별로 중복 정의하면 안 된다");
});

test("미래 날짜는 막지 않되 눈에 띄게 알린다", () => {
  // 예약 결제처럼 정당한 용도가 있어 차단하지 않는다. 대신 연도 오타를 알아채게 한다.
  assert.doesNotMatch(fn("validateExpenseInput"), /isFutureDateKey/, "미래 날짜로 저장을 막으면 안 된다");
  assert.match(fn("syncDateDisplay"), /isFutureDateKey\(value\)/);
  assert.match(fn("syncDateDisplay"), /오늘 이후 날짜예요/);
  assert.match(html, /id="date-notice"/);
  assert.match(css, /\.field-notice:not\(:empty\)\s*\{[^}]*display:\s*block/);
});

test("이번 달이 아닌 곳에 기록하면 어느 달인지 밝힌다", () => {
  const submit = fn("handleSubmit");
  assert.match(submit, /targetMonth === toMonthKey\(new Date\(\)\) \? "" : /, "이번 달이면 문구가 지저분해지지 않아야 한다");
  assert.match(submit, /monthLabel/);
});

test("소스 파일은 800줄 상한을 지킨다", () => {
  for (const [path, lines] of Object.entries(sourceLineCounts)) {
    assert.ok(lines <= 800, `${path}가 ${lines}줄 (상한 800)`);
  }
});

test("알림은 사람이 켠 순간에만 허락을 구한다", () => {
  /*
   * 화면을 열자마자 물으면 브라우저가 아예 막고, 한 번 거절당하면 다시 물을 길이 없다.
   * iOS 는 홈 화면에 추가한 웹앱에서만 푸시를 허용하므로(16.4+), 쓸 수 없는 곳에서는
   * 스위치를 감춘다 — 눌러도 안 되는 것을 보여 주면 고장 난 것처럼 보인다.
   */
  const 켜기 = fn("togglePush");
  assert.match(켜기, /await Notification\.requestPermission\(\)/);
  assert.doesNotMatch(fn("syncPushToggle"), /requestPermission/, "상태만 맞출 때 물으면 안 된다");
  assert.match(fn("canUsePush"), /"PushManager" in window/);
  assert.match(fn("syncPushToggle"), /자리\.hidden = !canUsePush\(\)/);
  // 조용한 푸시는 iOS 가 허용하지 않는다. 늘 보이는 알림이어야 한다.
  assert.match(켜기, /userVisibleOnly: true/);
  // 껐으면 서버 기록도 지운다. 남겨 두면 보내는 쪽이 계속 헛수고한다.
  assert.match(켜기, /removePushSubscription\(구독\.endpoint\)[\s\S]{0,80}구독\.unsubscribe\(\)/);
});

test("고정비가 자동으로 채워질 때는 알리지 않는다", async () => {
  /*
   * 열두 달이 밀린 채 처음 열면 고정비가 한꺼번에 채워진다. 그때마다 알리면
   * 알림이 수십 개 쏟아진다. 사람이 직접 적은 것만 알린다.
   */
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/migration-push-triggers.sql", import.meta.url), "utf8");
  assert.match(sql, /if new\.fixed_cost_id is not null then return new; end if;/);
  // 적은 사람 자신에게는 보내지 않는다.
  assert.match(sql, /where household_id = new\.household_id and id <> new\.created_by/);
  // 알림이 늦거나 실패해도 지출은 저장돼야 한다. pg_net 은 기다리지 않는다.
  assert.match(sql, /perform net\.http_post\(/);
  // service_role 키는 DB 안에만 둔다.
  assert.match(sql, /revoke all on app_secrets from anon, authenticated/);
});

test("거르기와 보기 방식은 오른쪽에 나란히 선다", () => {
  /*
   * 제목 줄은 space-between 이라 아이는 셋이 되면 균등하게 벌어진다.
   * 그러면 필터 버튼만 제목과 토글 한가운데에 떠서 무엇에 딸린 것인지 알 수 없다
   * (계측: 양옆이 63px·62px 로 똑같았다).
   *
   * 남는 자리를 왼쪽 여백이 다 가져가면 둘이 오른쪽에 나란히 선다.
   * 토글과 딱 붙으면 한 덩어리로 보이므로 6px 만 띄운다.
   */
  assert.match(css, /#open-category-sheet \{[^}]*margin-left: auto/);
  assert.match(css, /#open-category-sheet \{[^}]*margin-right: var\(--space-\d+\)/);
  assert.match(css, /\.section-heading \{[^}]*justify-content: space-between/);
});

test("분류로 거르는 자리는 목록 옆에 있다", () => {
  /*
   * 처음에는 분석 화면에서 분류를 누르게 했다. 그런데 누르면 보던 화면에서 튕겨 나와
   * 홈으로 끌려갔고, 무엇이 바뀌었는지 되짚어야 했다. 누를 수 있다는 표시도 없었다.
   * 분석은 이해하는 곳, 목록은 찾는 곳이다 — 거르는 일은 거르는 자리에서 한다.
   *
   * 사람은 요약 카드, 날짜는 캘린더가 이미 홈에 있다. 분류도 같은 자리에 둔다.
   */
  assert.match(html, /<button class="icon-button" type="button" id="open-category-sheet"/);
  assert.match(html, /<dialog class="sheet month-sheet" id="category-sheet"/);
  // 고르면 시트만 닫는다. 보던 화면은 그대로 둔다.
  const 고르기 = fn("pickCategory");
  assert.match(고르기, /closeCategorySheet\(\)/);
  assert.doesNotMatch(고르기, /hidePage/, "화면을 떠나지 않는다");
  // 그 달에 쓴 분류만, 많이 쓴 순. 안 쓴 분류를 늘어놓으면 고를 것이 묻힌다.
  assert.match(fn("이번달분류"), /sort\(\(a, b\) => b\.total - a\.total/);
  // 푸는 길이 시트 안에도 있어야 한다.
  assert.match(fn("그리기"), /data-category=""[\s\S]{0,80}전체/);
  /*
   * 캘린더 숫자에는 분류를 걸지 않는다. 걸면 그 분류가 없는 날이 통째로 비어
   * 달력이 "그날은 안 썼다" 로 읽힌다.
   */
  const 그리기목록 = fn("render");
  assert.match(그리기목록, /filterByCategory\(filterByDate\(byMember, dateFilter\), categoryFilter\)/);
  assert.doesNotMatch(그리기목록, /renderCalendar\([^)]*categoryFilter/);
});

test("분석 화면은 보는 곳으로 되돌렸다", () => {
  // 한 가지 일에 길이 둘이면, 그것도 하나는 순간이동이면 더 헷갈린다.
  assert.match(fn("paintShares"), /<div class="analysis-row">/);
  assert.doesNotMatch(fn("paintShares"), /data-category/);
  assert.doesNotMatch(app, /function toggleCategoryFilter/);
});

test("걸린 조건은 제목에 뜨고 눌러서 풀 수 있다", () => {
  /*
   * 사람은 요약 카드를, 날짜는 달력을 다시 누르면 풀린다 — 화면에 보이는 자리가 있다.
   * 분류만 그런 자리가 없어 분석 화면으로 되돌아가야 했다. 제목에 이미 적혀 있으니
   * 거기가 푸는 자리이기도 하게 둔다.
   */
  assert.match(html, /<button class="ledger-filter" type="button" id="ledger-filter" hidden><\/button>/);
  assert.match(app, /elements\.ledgerFilter\.addEventListener\("click", clearFilters\)/);
  const 지우기 = fn("clearFilters");
  for (const 끄기 of [/setMemberFilter\(null\)/, /setCategoryFilter\(null\)/, /setDateFilter\(null\)/]) {
    assert.match(지우기, 끄기);
  }
  // 무엇이 걸렸는지 보조기술도 알아야 한다.
  assert.match(fn("paintLedgerHeading"), /setAttribute\("aria-label", `\$\{labels\.join\(", "\)\} 조건 지우기`\)/);
});

test("아이콘 버튼은 보이는 크기보다 넓게 눌린다", () => {
  /*
   * 42px 은 애플이 말하는 44px 에 2px 모자란다. 동그라미를 키우면 머리 줄이 두꺼워지므로
   * 자리만 넓힌다. 가로로 크게 넓히면 옆 버튼과 겹쳐 경계에서 어느 쪽이 눌릴지 알 수 없다 —
   * 달 이동은 사이가 4px, 상단 아이콘은 8px 이라 1px 씩이면 겹치지 않는다.
   * 계측: 설정·마이페이지·분석·달 이동 화살표가 42×42 → 44×44 가 됐다.
   *
   * 값이 토큰이 되었으므로 :root 에서 풀어서 센다. 숫자만 보면 토큰을 쓴 순간 깨진다.
   */
  const 토큰 = (이름) => Number(css.match(new RegExp(`${이름}: (\\d+)px`))[1]);
  const 길이 = (글) => (글.startsWith("var(") ? 토큰(글.slice(4, -1)) : Number(글.replace("px", "")));

  const 최소 = 토큰("--tap-min");
  assert.equal(길이(css.match(/\.icon-button \{[^}]*width: (\S+?);/)[1]), 토큰("--control-sm"));
  // 넓히는 만큼을 숫자로 적으면 단추 크기를 바꿀 때 어긋난다. 모자란 만큼을 계산해서 쓴다.
  assert.match(css, /\.icon-button::after \{[^}]*inset: calc\(\(var\(--tap-min\) - var\(--control-sm\)\) \/ -2\)/,
    "넓히는 만큼을 44 에서 역산할 것");
  assert.ok(최소 >= 44, `손이 닿는 최소가 ${최소}px 이다`);

  // 달 라벨은 글자 21px + 위아래 안쪽 여백. 거기에 ::after 로 넓힌 만큼 더한다.
  const 라벨여백 = 길이(css.match(/\n\.month-label \{[^}]*padding: (\S+)/)[1]);
  const 라벨넓힘 = Number(css.match(/\.month-label::after \{[^}]*inset: -(\d+)px 0/)[1]);
  const 라벨높이 = 라벨여백 * 2 + 21 + 라벨넓힘 * 2;
  assert.ok(라벨높이 >= 44, `달 라벨 누를 자리가 ${라벨높이}px 로 44px 에 못 미친다`);
});

test("스위치 손잡이는 판 크기에서 자리를 계산한다", () => {
  /*
   * 판 46×28 에 손잡이 22 면 위아래로 3 씩 남는다. 켰을 때 미는 거리 18 도
   * 46 - 22 - 3*2 다 — 세 숫자가 모두 두 크기에서 나온다.
   *
   * 그래서 3 을 계단에 맞춰 4 로 올리면 손잡이가 위로 1 치우친다(위 4, 아래 2).
   * 숫자로 적어 두면 판 크기를 바꿀 때 한 곳만 고치고 어긋난 것을 못 본다.
   */
  assert.match(css, /--switch-inset: calc\(\(var\(--switch-h\) - var\(--switch-knob\)\) \/ 2\)/,
    "손잡이 자리를 숫자로 적으면 판 크기와 어긋난다");
  assert.match(css, /\.switch::after \{[^}]*top: var\(--switch-inset\)[^}]*left: var\(--switch-inset\)/s);
  assert.match(css, /:checked \+ \.switch::after \{[^}]*translateX\(calc\(var\(--switch-w\) - var\(--switch-knob\) - var\(--switch-inset\) \* 2\)\)/,
    "미는 거리를 숫자로 적으면 판 너비를 바꿀 때 손잡이가 끝에 못 간다");
});

test("토스트의 좌우 여백은 left/right 가 아니라 폭이 정한다", () => {
  /*
   * margin: auto 로 가운데 서므로 left/right 는 설 자리의 경계만 정하고,
   * 실제로 보이는 좌우 여백은 (창 - 폭) / 2 다. 붙박이라 100% 는 창 전체를 가리킨다.
   *
   * left/right 만 고치고 폭을 그대로 두면 화면에서는 아무것도 안 움직인다.
   * 계측: left/right 를 18 에서 16 으로 바꿨는데 x 는 18 그대로였다.
   */
  const 폭뺀값 = css.match(/\.toast \{[^}]*width: min\(calc\(100% - var\((--space-\d+)\)\)/)[1];
  const 옆값 = css.match(/\.toast \{[^}]*left: var\((--space-\d+)\)/)[1];
  const 토큰 = (이름) => Number(css.match(new RegExp(`${이름}: (\\d+)px`))[1]);
  assert.equal(토큰(폭뺀값) / 2, 토큰(옆값),
    "폭에서 빼는 값의 절반과 left/right 가 다르면 둘 중 하나는 아무 일도 하지 않는다");
});

test("시트의 좌우 여백은 본 화면과 같다", () => {
  /*
   * 시트가 열려도 글이 서는 자리는 그대로여야 한다. 다르면 열고 닫을 때마다 좌우로 흔들린다.
   * 본 화면은 main, 시트는 sheet-header 와 sheet-scroll 이 각자 갖고 있다.
   */
  const 본 = css.match(/\nmain \{[^}]*padding: 0 var\((--space-\d+)\)/)[1];
  for (const 규칙 of [/\.sheet-header \{[^}]*padding: 0 var\((--space-\d+)\)/,
                     /\.sheet-scroll \{[^}]*padding: 0 var\((--space-\d+)\)/]) {
    assert.equal(css.match(규칙)[1], 본, "시트 좌우 여백이 본 화면과 어긋난다");
  }
});

test("분석 화면의 달 줄은 높이를 스스로 정한다", () => {
  /*
   * 본 화면에서 달 라벨은 옆 화살표(42px)보다 작아 줄 높이에 관여하지 않는다.
   * 분석 화면은 글자가 19px 이라 그냥 두면 글자의 안쪽 여백이 줄 높이를 정한다 —
   * 공용 여백을 10 에서 8 로 계단에 맞추자 줄이 47 에서 43 이 되고
   * 아래 내용이 통째로 4px 올라갔다(계측: 비교 버튼 y317 → y312).
   *
   * 줄이 제 높이를 갖고 있으면 글자 쪽을 어떻게 고쳐도 아래가 따라 움직이지 않는다.
   */
  assert.match(css, /#analysis-page \.month-control \{[^}]*min-height: var\(--space-\d+\)/,
    "달 줄이 제 높이를 잃으면 글자 여백을 고칠 때마다 화면 전체가 위아래로 움직인다");
  assert.doesNotMatch(css, /#analysis-page \.month-label \{[^}]*padding/,
    "줄이 높이를 정하므로 글자 쪽 여백은 더 필요 없다");
});

test("강조색을 글자로 쓰는 자리는 읽히는 밝기다", () => {
  /*
   * --accent-dark 는 글자로 일곱 곳, 배경으로 세 곳에 쓰인다. 글자 쪽이 기준이다.
   * 예전 #d84d34 는 종이 위에서 4.5:1 에 못 미치는 3.77 이라 "대화 3" 같은
   * 작은 글자가 흐릿했다. 배경으로 쓰는 자리에서는 그 위의 흰 글자가 함께 또렷해진다.
   * 계측(WebKit): 다섯 화면의 강조색 글자 모두 4.94~5.38 로 통과.
   */
  const 명도 = (hex) => {
    const [r, g, b] = hex.match(/\w\w/g)
      .map((x) => parseInt(x, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const 대비 = (a, b) => {
    const [x, y] = [명도(a), 명도(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const 값 = (이름) => css.match(new RegExp(`${이름}: (#[0-9a-f]{6})`))[1];
  for (const 바탕 of ["--paper", "--white"]) {
    assert.ok(대비(값("--accent-dark"), 값(바탕)) >= 4.5,
      `강조 글자색이 ${바탕} 위에서 ${대비(값("--accent-dark"), 값(바탕)).toFixed(2)} 다`);
  }
  // 캘린더의 오늘 표시는 14px 굵은 글자라 큰 글자 기준(3:1)을 못 받는다.
  assert.match(css, /\.month-cell\.is-today \{[^}]*color: var\(--accent-dark\)/);
});

test("디자인 문서는 코드와 어긋나지 않는다", async () => {
  /*
   * 문서가 코드와 어긋나면 없느니만 못하다 — 읽은 사람이 틀린 값을 쓴다.
   * 그래서 세 가지를 본다.
   *  · 문서가 부르는 토큰이 실제로 있나 (--text-14 만 예외. "없다"는 것을 보이려고 적었다)
   *  · 실제 토큰인데 문서가 아예 안 다루는 것이 있나
   *  · 문서가 값까지 적은 것이 코드의 값과 같나
   *
   * 마지막 것은 값 표로 쓴 코드 블록만 본다. 산문의 "글자는 20px"까지 훑으면
   * 어느 숫자가 어느 토큰 값인지 정규식은 알 수 없다. 표에서 이름만 부른 색·그림자와
   * --focus-outline 도 값은 견주지 않고, 위의 존재 검사만 한다.
   *
   * 값 칸은 통째로 견준다. 단위 없는 50·1.6 을 빠뜨렸고(재현: --layer-sheet 52,
   * --leading-text 1.7), 단순 숫자 하나만 보던 것으로는 clamp도 놓쳤다
   * (재현: --text-hero clamp(48px, 14vw, 64px)). 숫자·함수로 시작하는 여러 토막은
   * 공백만 고른 뒤 전부 견주므로 cubic-bezier와 3px solid rgba(...) 같은 값도 잡는다.
   * --font는 문서가 CSS를 그대로 쓰지 않고 글꼴 부류를 화살표로 적었다. 거기서는
   * 두 이름과 그 사이의 애플 시스템 글꼴까지만 견주며, 구체적인 fallback 목록은 못 견준다.
   */
  const 문서 = await readFile(new URL("../DESIGN.md", import.meta.url), "utf8");
  assert.ok(루트블록, "base.css 에 :root 가 없다");
  const root = 스타일별CSS.base.slice(루트블록.open + 1, 루트블록.close);
  const 루트값 = new Map(스타일별구조.base.선언들
    .filter(({ selector, property }) => selector === ":root" && property.startsWith("--"))
    .map(({ property, value }) => [property, value]));

  const 부르는것 = [...new Set([...문서.matchAll(/--[a-z][\w-]*/g)].map((m) => m[0]))];
  const 없는것 = 부르는것.filter((t) => t !== "--text-14" && !root.includes(`${t}:`) && !css.includes(`@property ${t}`));
  assert.deepEqual(없는것, [], "문서가 없는 토큰을 부르고 있다");

  const 실제 = [...root.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]);
  const 빠진것 = 실제.filter((t) => !문서.includes(t));
  assert.deepEqual(빠진것, [], "새 토큰을 만들고 문서에 적지 않았다");

  const 값정리 = (value) => value.trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([(),/])\s*/g, "$1");
  const 코드블록들 = [...문서.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const 어긋남 = [];
  for (const block of 코드블록들) {
    for (const line of block.split("\n")) {
      const 값칸들 = line.matchAll(/(?:^|\s{2,})(--[\w-]+)\s+(.+?)(?=\s{2,}\S|\s+—(?:\s|$)|$)/g);
      for (const [, 이름, 값] of 값칸들) {
        // 설명과 값은 둘 다 낱말일 수 있다. 숫자·함수로 시작한 칸만 CSS 값이라고 믿는다.
        if (!/^(?:-?(?:\d|\.\d)|[a-zA-Z_-][\w-]*\()/.test(값)) continue;
        const 코드값 = 루트값.get(이름);
        if (코드값 && 값정리(코드값) !== 값정리(값)) {
          어긋남.push(`${이름} 문서 ${값} vs 코드 ${코드값}`);
        }
      }
    }
  }

  const 글꼴줄 = 코드블록들.flatMap((block) => block.split("\n"))
    .find((line) => /^--font\s+/.test(line));
  const 문서글꼴 = 글꼴줄?.match(/^--font\s+(.+)$/)?.[1].split(/\s*→\s*/);
  const 코드글꼴 = 루트값.get("--font")?.split(",")
    .map((family) => family.trim().replace(/^(["'])(.*)\1$/, "$2"));
  if (문서글꼴?.length === 3 && 코드글꼴) {
    const [첫글꼴, 시스템글꼴, 마지막글꼴] = 문서글꼴;
    const 첫자리 = 코드글꼴.indexOf(첫글꼴);
    const 마지막자리 = 코드글꼴.indexOf(마지막글꼴);
    const 시스템자리 = 코드글꼴.findIndex((family) =>
      ["-apple-system", "BlinkMacSystemFont", "Apple SD Gothic Neo"].includes(family));
    if (첫자리 !== 0 || !시스템글꼴.includes("애플 시스템")
      || 시스템자리 <= 첫자리 || 시스템자리 >= 마지막자리) {
      어긋남.push(`--font 문서 ${문서글꼴.join(" → ")} vs 코드 ${루트값.get("--font")}`);
    }
  } else {
    어긋남.push("--font의 글꼴 부류를 문서와 코드에서 읽을 수 없다");
  }
  assert.deepEqual(어긋남, [], "문서에 적힌 값이 코드와 다르다");
});

test("움직이는 시간은 토큰으로만 적는다", () => {
  /*
   * 12가지였다 — 180·200·220·260·280·420·480·600·620·650 에 기존 토큰 둘.
   * 20~30ms 차이는 눈으로 구분되지 않는다. 성격이 셋뿐이라 그만큼만 둔다.
   *
   * 시트만 두 개를 쓴다 — 투명도는 240, 올라오는 거리는 420.
   * 같은 시간을 주면 다 올라오기 전에 이미 또렷해져 뚝 끊겨 보인다.
   *
   * 움직임을 줄여 달라는 설정(prefers-reduced-motion)의 0.01ms 는 값이 아니라
   * "사실상 끄기"다. 여기서 세지 않는다.
   *
   * 줄로 훑으면 transition-delay 와 다음 줄에 적은 shorthand 시간을 놓쳤다(재현: 123ms).
   * 선언 전체를 읽어야 var() 뒤에 쉼표로 숫자 시간을 덧붙인 것도 함께 막을 수 있다.
   */
  const 차례 = ["motion", "motion-slow", "motion-slide", "motion-enter"];
  const 값 = 차례.map((이름) => {
    const m = css.match(new RegExp(`--${이름}: (\\d+)ms`));
    assert.ok(m, `--${이름} 토큰이 없다`);
    return Number(m[1]);
  });
  for (let i = 1; i < 값.length; i += 1) {
    assert.ok(값[i] > 값[i - 1], `--${차례[i - 1]}(${값[i - 1]}) 이 --${차례[i]}(${값[i]}) 보다 짧아야 한다`);
  }
  assert.match(css, /--motion-delay: \d+ms/);

  const 날것 = CSS구조.선언들
    .filter(({ selector, property }) => selector !== ":root" && /^(?:transition|animation)(?:-(?:duration|delay))?$/.test(property))
    .flatMap((declaration) => {
      const 토큰오류 = 토큰참조(declaration.value)
        .some(({ name, fallback }) => fallback || !루트토큰.has(name));
      const 줄인움직임 = declaration.contexts
        .some((selector) => selector.includes("prefers-reduced-motion: reduce"));
      const 숫자시간 = [...declaration.value.matchAll(/(?<![\w.-])-?(?:\d*\.)?\d+m?s\b/g)]
        .map((m) => m[0])
        .filter((value) => value !== "0.01ms" || !줄인움직임);
      return 토큰오류 || 숫자시간.length > 0
        ? [`${선언표시(declaration)}${숫자시간.length ? ` · ${숫자시간.join(", ")}` : " · 없는 토큰 또는 fallback"}`]
        : [];
    });
  assert.deepEqual(날것, [], "움직이는 시간을 숫자로 적었다 — --motion-* 을 쓸 것");
});

test("줄 사이와 자간도 토큰으로만 적는다", () => {
  /*
   * 줄 사이가 여섯 가지(1·1.5·1.55·1.6·1.65·1.7)였다. 1.5 와 1.6 은 12px 글자에서
   * 한 줄에 1.2px 차이라 나란히 놓고 봐야 겨우 다르고, 어느 글이 어느 값인지 규칙도 없었다 —
   * 그래프 설명은 1.5, 고정비 안내는 1.6 인데 둘 다 같은 종류의 안내 글이다.
   *
   * 자간은 달랐다. 값이 제각각인 게 아니라 "글자가 클수록 좁힌다"는 규칙이 이미 있었다.
   * 그래서 글자 계단의 띠마다 하나씩 두고 이름으로 묶었다 — 크기를 고르면 자간이 따라온다.
   * 띠에서 벗어나 있던 둘은 제자리로 옮겼다(로고 20px 이 -0.05em, 원 표시 17px 이 -0.04em).
   */
  for (const 이름 of ["flat", "text"]) {
    assert.match(css, new RegExp(`--leading-${이름}:`), `--leading-${이름} 토큰이 없다`);
  }
  const 띠 = ["hero", "title", "heading", "strong", "body", "small", "eyebrow"];
  const 값 = 띠.slice(0, 6).map((이름) => {
    const m = css.match(new RegExp(`--tracking-${이름}: (-?[\\d.]+)em`));
    assert.ok(m, `--tracking-${이름} 토큰이 없다`);
    return Number(m[1]);
  });
  // 큰 글자일수록 더 좁아야 한다. 순서가 뒤집히면 규칙이 아니라 그냥 목록이 된다.
  for (let i = 1; i < 값.length; i += 1) {
    assert.ok(값[i] > 값[i - 1],
      `${띠[i - 1]}(${값[i - 1]}) 이 ${띠[i]}(${값[i]}) 보다 좁아야 한다`);
  }
  assert.match(css, /--tracking-eyebrow: 0\.04em/, "작은 이름표만 거꾸로 벌린다");

  for (const [이름, 속성, 접두] of [["줄 사이", "line-height", "leading"], ["자간", "letter-spacing", "tracking"]]) {
    const 날것 = CSS구조.선언들
      .filter(({ selector, property }) => selector !== ":root" && property === 속성)
      .filter(({ value }) => !단일토큰인가(value, 접두))
      .map(선언표시);
    assert.deepEqual(날것, [], `${이름}을 숫자로 적었다 — --${접두}-* 을 쓸 것`);
  }
});

test("무엇이 무엇 위에 오는지는 한 목록이 정한다", () => {
  /*
   * 1·5·10·15·20·30·50·70·80 이 흩어져 있었다. 숫자만 봐서는 순서를 알 수 없어
   * 새 요소를 넣을 때마다 눈치껏 골랐다 — 토스트가 FAB 뒤로 숨은 적이 있다.
   *
   * 아홉 개처럼 보였지만 실제로 겨루는 것은 일곱이다. 나머지 셋(머리 줄 안의 상단 줄,
   * main 안의 지출 내역 제목, 화면 안의 제목 줄)은 감싼 요소가 이미 제 맥락을 만들어서
   * 형제하고만 겨룬다. 거기에 전역 값을 쓰면 "머리 줄보다 위"처럼 읽히지만 아무 뜻도 없다.
   *
   * 그래서 검사도 두 가지를 본다 — 목록의 차례가 지켜지는지, 그리고 지역 자리에
   * 전역 값이 새어 들어가지 않았는지.
   */
  const 차례 = ["content", "float", "header", "page", "sheet", "toast", "gate"];
  const 값 = 차례.map((이름) => {
    const m = css.match(new RegExp(`--layer-${이름}: (\\d+)`));
    assert.ok(m, `--layer-${이름} 토큰이 없다`);
    return Number(m[1]);
  });
  for (let i = 1; i < 값.length; i += 1) {
    assert.ok(값[i] > 값[i - 1],
      `${차례[i - 1]}(${값[i - 1]}) 이 ${차례[i]}(${값[i]}) 보다 아래에 있어야 한다`);
  }
  // 지역 자리는 형제보다만 위면 된다. 전역 사다리의 맨 아래보다 높으면 잘못 읽힌다.
  const 지역 = Number(css.match(/--layer-above: (\d+)/)[1]);
  assert.ok(지역 <= 값[0], "지역 값이 전역 사다리 위로 올라가 있다");

  /*
   * 접두사만 보면 var(--layer-rogue, 999) 도 목록의 값처럼 보였다(재현).
   * z-index 는 base.css 에 실제로 선언된 --layer-* 하나만 fallback 없이 쓴다.
   */
  const 날것 = CSS구조.선언들
    .filter(({ selector, property }) => selector !== ":root" && property === "z-index")
    .filter(({ value }) => !단일토큰인가(value, "layer"))
    .map(선언표시);
  assert.deepEqual(날것, [], "겹침 순서를 숫자로 적었다 — --layer-* 을 쓸 것");
});

test("색과 그림자는 :root 에서만 정한다", () => {
  /*
   * 23곳이 날것이었다 — 그림자의 rgba, 초점 테두리, 회색 몇 가지.
   * 같은 값이 여러 파일에 흩어져 있으면 한 곳만 바뀐다:
   *  · outline: 3px solid rgba(242, 103, 75, 0.25) 가 base·page·sheet 세 곳에
   *  · box-shadow: 0 2px 8px rgba(35, 31, 26, 0.08) 이 analysis·sheet 두 곳에
   *  · border-top: 1px solid rgba(32, 33, 30, 0.07) 이 ledger·sheet 두 곳에
   *
   * 이 검사는 "값을 어디서 정하나"만 본다 — 어떤 색인지는 사람이 정한다.
   * 합친 CSS 에서 :root 를 몽땅 지우면 다른 파일의 둘째 :root 도 사라졌다(재현: --rogue: #000).
   * 줄 하나에 var() 가 있거나 값이 다음 줄로 내려가도 선언의 나머지 색을 끝까지 본다.
   */
  const 루트위치 = STYLE_FILES.flatMap((name) => 스타일별구조[name].블록들
    .filter(({ selector }) => selector === ":root")
    .map(() => name));
  assert.deepEqual(루트위치, ["base"], "값은 base.css 의 :root 하나에서만 정할 것");

  const 날것 = CSS구조.선언들
    .filter(({ selector, value }) => selector !== ":root"
      && /#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\(|(?:oklch|oklab|lch|lab|color)\(/.test(value))
    .map(선언표시);
  assert.deepEqual(날것, [], ":root 밖에서 색을 정하고 있다 — 토큰을 만들어 쓸 것");
});

test("모서리는 계단 위의 토큰으로만 적는다", () => {
  /*
   * 11가지가 흩어져 있었다 — 2·5·8·9·11·12·13·14·15·16·28.
   * 1px 차이는 눈으로 구분되지 않으면서 나란히 놓인 카드와 단추의 곡률만 어긋나게 한다.
   *
   * 간격과 같은 4의 배수를 쓴다. 모서리와 안쪽 여백이 맞물리기 때문이다 —
   * 안쪽 모서리는 "바깥 모서리 - 안쪽 여백"이라야 두 곡선이 같은 중심을 돈다.
   * 두 값이 같은 계단 위에 있어야 그 뺄셈도 계단 위로 떨어진다.
   *
   * 예전에는 field/card/sheet 라는 이름이 있었는데 아무 데도 쓰이지 않았고
   * 그 값(13·16·28)이 그대로 날것으로 적혀 있었다. 이름에 크기를 적으면 그 일이 안 생긴다.
   */
  for (const 값 of [4, 8, 12, 16, 28]) {
    assert.match(css, new RegExp(`--radius-${값}: ${값}px`), `--radius-${값} 토큰이 없다`);
  }
  assert.match(css, /--radius-pill: 999px/);
  assert.match(css, /--radius-round: 50%/);

  /*
   * var() 하나만 있으면 안전하다고 치면 calc(var(--radius-16) + 3px) 가 통과했다(재현).
   * 계산에는 실제 --radius-*·--space-* 토큰과 단위 없는 0만 남을 수 있다.
   */
  const 날것 = CSS구조.선언들
    .filter(({ selector, property }) => selector !== ":root" && property === "border-radius")
    .filter(({ value }) => {
      const refs = 토큰참조(value);
      if (refs.length === 0 || refs.some(({ name, fallback }) => fallback
        || !루트토큰.has(name)
        || (!name.startsWith("--radius-") && !name.startsWith("--space-")))) return true;
      const 나머지 = value
        .replace(/var\(\s*--[\w-]+\s*\)/g, "")
        .replace(/\bcalc\b/g, "")
        .replace(/(?<![\w.])0(?![\w.])/g, "")
        .replace(/[\s(),/+*-]/g, "");
      return 나머지 !== "";
    })
    .map(선언표시);
  assert.deepEqual(날것, [], "모서리를 숫자로 적었다 — --radius-N 토큰을 쓸 것");

  // 결제자 고르는 칸은 감싼 상자에서 여백을 뺀 값이다. 숫자로 적으면 바깥만 바꿨을 때 어긋난다.
  assert.match(css, /\.segmented-control label > span \{[^}]*border-radius: calc\(var\(--radius-16\) - var\(--space-1\)\)/,
    "안쪽 모서리를 바깥 모서리에서 계산하지 않으면 두 곡선의 중심이 어긋난다");
});

test("글자 크기는 계단 위의 토큰으로만 적는다", () => {
  /*
   * 18가지였다 — 8·10·11·12·13·14·15·16·17·18·19·20·21·27·28·32·34 에 총액의 clamp 까지.
   * 그 사이 1px 차이들은 계단이 아니라 그때그때 눈으로 맞춘 값이다.
   *
   * 간격의 4·8 계단을 글자에 쓰면 안 된다. 작은 쪽에서는 11 다음이 16 이라 너무 성기고
   * 큰 쪽에서는 촘촘하다. 그래서 애플이 아이폰에서 쓰는 계단을 그대로 쓴다 —
   * 이 앱은 아이폰 전용이고, 그 값들은 이 화면에서 눈으로 구분되도록 맞춰진 것이다.
   *
   * 14 는 애플 계단에 없어 15 로 합쳤다(지출 항목·금액 15곳). 목록 한 줄 높이 72 와
   * 보이는 줄 수는 그대로였다.
   */
  const 계단 = [11, 12, 13, 15, 16, 17, 20, 28, 34];
  for (const 값 of 계단) {
    assert.match(css, new RegExp(`--text-${값}: ${값}px`), `--text-${값} 토큰이 없다`);
  }
  // 계단에 없는 이름을 두면 "있는 줄 알고" 쓰게 된다. 14 가 없는 것이 곧 규칙이다.
  for (const 계단밖 of [14, 18, 19, 21, 22, 27, 32]) {
    assert.doesNotMatch(css, new RegExp(`--text-${계단밖}:`), `--text-${계단밖} 은 계단에 없다`);
  }

  /* var(--text-14, 14px) 는 접두사가 맞아도 없는 토큰과 날것 fallback 이다(재현). */
  const 날것 = CSS구조.선언들
    .filter(({ selector, property }) => selector !== ":root" && property === "font-size")
    .filter(({ value }) => !단일토큰인가(value, "text"))
    .map(선언표시);
  assert.deepEqual(날것, [], "글자 크기를 숫자로 적었다 — --text-N 토큰을 쓸 것");
});

test("간격 계단 위의 값은 토큰으로만 적는다", () => {
  /*
   * 여백 값이 35가지였다 — 12·13·14 가 다 있고 17~24 가 통째로 있었다.
   * 그건 계단이 아니라 그때그때 눈으로 맞춘 값들이다.
   *
   * 계단은 4의 배수로만 오른다. 8 이 1×·1.5×·2×·3× 밀도에서 정수 픽셀로 떨어져
   * 흐릿해지지 않기 때문이고, 4 는 그 반 칸이라 부품 안쪽을 더 촘촘히 맞출 수 있다.
   *
   * 계단 밖 값을 꼭 써야 하면 그 자리의 주석으로 이유를 남긴다. 예전 검사는 반대로
   * 계단 위 리터럴만 막아 padding: 18px 를 말없이 써도 통과했다(재현).
   * 계단 위 값은 이유가 있어도 숫자로 다시 적지 않는다 — 그러면 토큰이 있으나 마나가 된다.
   */
  const 계단 = [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 128];
  for (const 값 of 계단) {
    assert.match(css, new RegExp(`--space-(?:05|\\d+): ${값}px`), `${값}px 토큰이 없다`);
  }

  const 날것 = [];
  const 간격선언 = CSS구조.선언들.filter(({ selector, property }) => selector !== ":root"
    && /^(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?$/.test(property));
  for (const declaration of 간격선언) {
    const refs = 토큰참조(declaration.value);
    if (refs.some(({ name, fallback }) => fallback || !루트토큰.has(name) || !name.startsWith("--space-"))) {
      날것.push(`${선언표시(declaration)} · 없는 간격 토큰 또는 fallback`);
    }
    const 숫자들 = [...declaration.value.matchAll(/(?<![\w.-])(-?(?:\d*\.)?\d+)px\b/g)]
      .map((m) => Number(m[1]));
    if (숫자들.some((value) => value < 0)) continue;
    for (const value of 숫자들) {
      if (계단.includes(value) || !declaration.이유주석) {
        날것.push(`${선언표시(declaration)} · ${value}px${계단.includes(value) ? " 는 계단 위" : " 계단 밖 이유 주석 없음"}`);
      }
    }
  }
  assert.deepEqual(날것, [], "간격 숫자는 토큰을 쓰고, 계단 밖 예외는 그 자리에 이유를 적을 것");

  /*
   * 위로 당기는 여백도 같은 계단을 쓴다.
   *
   * 처음 훑을 때 이걸 놓쳤다 — 앞의 정규식은 숫자 앞의 빼기를 글자로 쳐서 음수를 아예 안 봤다.
   * 그래서 본 화면·시트·설정을 "계단 밖 0곳"이라고 적고도 -10·-6 이 남아 있었다.
   *
   * 선언 글자만 허용 목록과 비교했더니 다른 선택자에 그대로 복사해도 통과했고,
   * 정수만 찾던 정규식은 -0.5px 도 놓쳤다(재현). 선택자·값·그 자리의 이유를 함께 본다.
   */
  const 음수날것 = [];
  for (const declaration of 간격선언) {
    const 음수 = [...declaration.value.matchAll(/(?<![\w.-])-(?:\d*\.)?\d+px\b/g)];
    if (음수.length === 0) continue;
    const 눈으로맞춘 = declaration.selector === ".close-button"
      && declaration.property === "margin"
      && declaration.value.replace(/\s+/g, " ") === "-5px -7px 0 0"
      && declaration.이유주석;
    if (!눈으로맞춘) 음수날것.push(선언표시(declaration));
  }
  assert.deepEqual(음수날것, [], "위로 당기는 여백을 숫자로 적었다 — calc(var(--space-N) * -1) 을 쓸 것");
});

test("적는 상자와 손이 닿은 표시는 한 곳에서 정한다", () => {
  /*
   * 로그인 칸, 시트의 입력칸·분류, 날짜 줄, 대화 입력이 같은 상자를 쓴다.
   * 예전에는 각자 적어 두어 높이나 테두리를 바꿀 때마다 서너 곳을 찾아다녀야 했고,
   * 실제로 값이 조금씩 어긋나 있었다.
   */
  const 세기 = (re) => (css.match(re) ?? []).length;
  assert.equal(세기(/height: var\(--field-height\);\n  padding: 0 var\(--space-3\);\n  border: 1px solid var\(--field-line\)/g), 1,
    "상자를 두 곳 이상에서 정하고 있다");
  // 손이 닿은 표시는 :root 에서 한 번만 정하고, 쓰는 자리에서는 이름으로 부른다.
  assert.equal(세기(/0 0 0 3px rgba\(242, 103, 75, 0\.11\)/g), 1,
    "손이 닿은 표시를 두 곳 이상에서 정하고 있다");
  assert.match(css, /box-shadow: var\(--focus-glow\)/);
  assert.equal(세기(/3px solid rgba\(242, 103, 75, 0\.25\)/g), 1,
    "초점 테두리를 두 곳 이상에서 정하고 있다");
  assert.ok(세기(/outline: var\(--focus-outline\)/g) >= 3,
    "초점 테두리를 쓰는 자리가 줄었다 — 어딘가 다시 숫자로 적었을 수 있다");
  // 같은 색을 여러 곳에 적어 두면 한 곳만 바뀐다. :root 밖에는 리터럴을 두지 않는다.
  assert.match(css, /--field-line: #ddd8cf/);
  assert.equal(세기(/#ddd8cf|#fcfaf5|#f7f3eb/g), 3, ":root 밖에 같은 색을 다시 적어 두었다");
});

test("내 프로필을 읽는 열 목록은 한 곳에서 정한다", () => {
  /*
   * 로그인·잔소리 켜기·프로필 수정 세 곳이 같은 목록을 따로 적고 있었다.
   * 열을 하나 더하면 셋을 다 고쳐야 하고, 한 곳을 빠뜨리면 그 경로로 들어온 프로필에만
   * 그 값이 비어 화면이 조용히 어긋난다(avatar_color 를 더할 때 실제로 셋을 고쳐야 했다).
   */
  assert.match(app, /export const MY_PROFILE_COLUMNS = "[^"]*avatar_color[^"]*"/);
  const 손으로적은것 = app.match(/\.select\("id, display_name, avatar_color[^"]*nag_enabled[^"]*"\)/g) ?? [];
  assert.deepEqual(손으로적은것, [], "목록을 손으로 다시 적어 두지 않는다");
  assert.ok((app.match(/\.select\(MY_PROFILE_COLUMNS\)/g) ?? []).length >= 3, "세 곳이 같은 것을 쓴다");
});

test("프로필 수정 권한은 정해진 열로만 열려 있다", async () => {
  // 테이블 전체에 update 를 주면 본인 행의 household_id 를 남의 가구로 바꿔치기할 수 있고,
  // 그러면 "같은 가구만 본다"는 RLS 판단 자체가 뚫린다.
  const { readFile } = await import("node:fs/promises");
  const ALLOWED = ["display_name", "avatar_color", "monthly_goal", "nag_enabled"];

  for (const file of ["schema.sql", "migration-profile.sql", "migration-goal.sql", "migration-nag.sql"]) {
    const sql = await readFile(new URL(`../supabase/${file}`, import.meta.url), "utf8");
    const grants = [...sql.matchAll(/grant update\s*\(([^)]+)\)\s*on profiles/g)];
    assert.ok(grants.length, `${file}에 열 단위 권한이 없다`);

    for (const [, columns] of grants) {
      for (const column of columns.split(",").map((c) => c.trim())) {
        assert.ok(ALLOWED.includes(column), `${file}이 ${column} 수정을 열어 준다`);
      }
    }
    // 괄호 없는 grant 는 모든 열을 연다.
    assert.doesNotMatch(sql, /grant update\s+on profiles/, `${file}이 테이블 전체 수정을 열어 준다`);
  }
});

test("직접 선택 칸은 테두리 없는 단색 원이다", () => {
  /*
   * 미리보기를 흐름 안에 두고 height: 100% 를 주면, 부모 높이는 aspect-ratio 로 정해지는데
   * 자식이 그 높이를 되받아 순환이 생긴다. 이 칸만 40×46 세로 타원이 됐다.
   * 자리에서 빼 두면 부모 높이는 오로지 aspect-ratio 가 정한다.
   */
  // 안에 자리를 차지하는 상자를 두지 않는다. 색은 칸 자체가 입는다.
  assert.doesNotMatch(css, /custom-swatch-preview/);
  assert.doesNotMatch(html, /custom-swatch-preview/);
  // 원 모양은 여섯 개와 한 규칙에서 나온다.
  assert.match(css, /\.swatch,\n\.custom-swatch \{[^}]*aspect-ratio: 1/);
  /*
   * 둘레에 고리를 두르면 자리를 먹어 같은 40px 인데도 눈에는 작아 보인다.
   * 아직 고른 적 없으면 선 색으로 비워 둔다 — 여섯 색 중 무엇과도 겹치지 않는다.
   */
  const 직접칸 = css.match(/\n\.custom-swatch \{[^}]*--custom-color[^}]*\}/)[0];
  assert.doesNotMatch(직접칸, /conic-gradient|border:/);
  assert.match(직접칸, /--custom-color: var\(--line\)/);
  assert.match(fn("markSelectedSwatch"), /else customSwatch\.style\.removeProperty\("--custom-color"\)/,
    "기본 팔레트를 고른 동안 같은 색을 칠하면 옆 동그라미와 구별되지 않는다");
});

test("서버가 준 아바타 색을 그대로 화면에 끼워 넣지 않는다", async () => {
  /*
   * 이 색은 추이 범례에서 style 속성 안에 이스케이프 없이 들어간다.
   * HEX 가 아닌 값이 오면 따옴표를 닫고 나가 태그를 새로 만든다 —
   * `#000"><img src=x onerror=...>` 로 스크립트 실행까지 확인했다.
   *
   * DB 의 check 제약이 막아 주지만, 그것만이 유일한 문이면 마이그레이션을 빠뜨리거나
   * 나중에 제약을 손대는 순간 곧바로 열린다. 들어오는 자리에서도 같은 잣대를 댄다.
   */
  const { toDisplayColor, PALETTE } = await import("../src/members.js");
  for (const 못된값 of ['#000"><img src=x onerror=alert(1)>', "red;background-image:url(//x)", "", null, 12]) {
    assert.equal(toDisplayColor(못된값), PALETTE[0].value, `${못된값} 을 그대로 통과시켰다`);
  }
  assert.equal(toDisplayColor("#12AbEf"), "#12abef");
  // 색이 만들어지는 자리는 서버에서 읽어 오는 곳 한 군데다.
  assert.match(fn("fetchMembers"), /color: toDisplayColor\(row\.avatar_color\)/);
});

test("아바타는 기본 팔레트와 직접 고른 6자리 HEX를 함께 받는다", async () => {
  // 화면만 열어 두거나 DB만 열어 두면 선택과 저장 중 한쪽이 어긋난다.
  const { readFile } = await import("node:fs/promises");
  const { PALETTE, normalizeAvatarColor } = await import("../src/members.js");
  const sql = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("../supabase/migration-avatar-custom-color.sql", import.meta.url),
    "utf8",
  );

  for (const { value } of PALETTE) assert.equal(normalizeAvatarColor(value), value);
  assert.equal(normalizeAvatarColor("#12AbEf"), "#12abef");
  for (const invalid of ["#fff", "12abef", "#12abeg", "#12abcdef", null]) {
    assert.equal(normalizeAvatarColor(invalid), null);
  }

  assert.match(sql, /avatar_color ~ '\^#\[0-9a-f\]\{6\}\$'/);
  assert.match(migration, /avatar_color ~ '\^#\[0-9a-f\]\{6\}\$'/);
  assert.match(html, /type="color"[\s\S]{0,120}id="profile-custom-color"/);
  assert.match(app, /profileCustomColor\.addEventListener\("input", handleCustomColorInput\)/);
});

test("초기화는 확인 문구를 그대로 적어야만 실행된다", () => {
  // 되돌릴 수 없고 상대 기록까지 지운다. 오탭 한 번으로 일어나면 안 된다.
  const handler = fn("handleReset");
  assert.match(handler, /!== CONFIRM_WORD\) return/, "문구가 틀리면 즉시 멈춰야 한다");
  assert.match(app, /const CONFIRM_WORD = "초기화"/);
  assert.match(html, /id="reset-submit" disabled/, "처음에는 버튼이 잠겨 있어야 한다");
  assert.match(fn("openResetSheet"), /님의 기록도 함께 지워집니다/, "상대 기록도 지워진다고 알려야 한다");
});

test("아바타 색은 서버 값에서 오고 막대와 짝을 이룬다", () => {
  const paint = fn("paintMembers");
  assert.match(paint, /slot\.avatar\.style\.background = member\.color/);
  assert.match(paint, /slot\.bar\.style\.background = member\.color/, "막대가 따로 놀면 누구 몫인지 알 수 없다");
  assert.doesNotMatch(css, /#me-bar\s*\{[^}]*background/, "CSS에 색을 박으면 서버 값이 무시된다");
});

test("전체 화면은 시트보다 아래에 깔린다", () => {
  /*
   * 설정 화면에서 고정비 시트를 열 수 있어야 한다.
   * 이제 z-index 로 겨루지 않는다 — showModal 로 연 시트는 top layer 로 올라가
   * 문서 안의 어떤 z-index 보다도 위다. 겹칠 일이 구조적으로 없다.
   */
  assert.match(fn("showSheet"), /showModal\(\)/);
  assert.doesNotMatch(css, /\.sheet-backdrop/, "공용 배경 요소는 없앴다");
  assert.match(css, /\.sheet::backdrop \{/, "배경은 시트마다 브라우저가 그린다");
});

test("스와이프 끝의 click은 대화를 열지 않는다", () => {
  // 손을 뗄 때 click이 따라온다. 이걸 탭으로 오인하면 쓸어넘길 때마다 대화가 열린다.
  const handler = app.match(/elements\.list\.addEventListener\("click"[\s\S]*?\n\}\);/)[0];
  const guardAt = handler.indexOf("didJustSwipe()");
  const closeAt = handler.indexOf("hasOpenRow()");
  const openAt = handler.indexOf("openNotes(");
  assert.ok(guardAt > -1, "스와이프 판별이 없다");
  // 순서가 어긋나면 방금 스와이프로 연 행이 뒤따르는 click에 곧바로 닫힌다.
  assert.ok(guardAt < closeAt, "스와이프 판별이 행 닫기보다 앞에 있어야 한다");
  assert.ok(guardAt < openAt, "스와이프 판별이 대화 열기보다 앞에 있어야 한다");
  assert.match(handler, /hasOpenRow\(\)[\s\S]{0,80}closeOpenRow\(\);\s*return;/, "행이 열려 있으면 그 탭은 닫는 데 쓴다");
});

test("대화는 남의 메시지를 화면에 그대로 넣지 않는다", () => {
  // 상대가 보낸 본문은 우리가 만든 값이 아니다. HTML로 해석되면 스크립트가 실행된다.
  const bubble = fn("createBubble");
  assert.match(bubble, /escapeHtml\(note\.body\)/, "본문을 그대로 넣으면 안 된다");
  assert.match(bubble, /escapeHtml\(getMemberName\(note\.author\)\)/);
});

test("같은 메시지는 응답과 구독 중 어느 쪽이 먼저 와도 한 번만 센다", () => {
  // 내가 보낸 메시지는 두 경로로 돌아온다. 순서를 가정하면 타이밍에 따라 개수가 부풀어 오른다.
  const count = fn("countNote");
  assert.match(count, /countedNoteIds\.has\(note\.id\)\) return false/, "id로 걸러야 순서와 무관해진다");
  assert.match(count, /countedNoteIds\.add\(note\.id\)/);

  const receive = fn("receiveNote");
  assert.match(receive, /const isNew = countNote\(note\)/);
  assert.match(receive, /if \(!isNew\) return/, "이미 센 메시지면 화면도 건드리지 않아야 한다");
});

test("대화를 불러오는 사이 시트가 바뀌면 늦게 온 결과를 버린다", () => {
  // 느린 응답이 뒤늦게 도착해 다른 지출의 대화를 덮어쓰면 안 된다.
  const open = fn("openNotes");
  assert.equal((open.match(/if \(openExpenseId !== expenseId\) return;/g) || []).length, 2,
    "성공·실패 두 경로 모두에서 확인해야 한다");
});

test("대화 입력도 iOS 자동 확대를 막는다", () => {
  const match = css.match(/\.note-form input \{[\s\S]*?font-size:\s*(\S+?);/);
  assert.ok(match, "입력 폰트 규칙을 찾지 못했습니다");
  const 크기 = Number(css.match(new RegExp(`${match[1].slice(4, -1)}: (\\d+)px`))[1]);
  assert.ok(크기 >= 16, `${크기}px (16px 미만이면 iOS가 확대함)`);
});

test("대화 시트는 헤더·입력줄이 고정되고 메시지만 스크롤한다", () => {
  assert.match(css, /#notes-sheet \{[^}]*overflow: hidden/, "시트 자체가 스크롤되면 헤더가 함께 밀린다");
  assert.match(css, /\.note-list \{[^}]*overflow-y: auto/);
  assert.match(html, /<div class="note-list sheet-scroll"/, "시트 끌어 닫기가 스크롤 위치를 존중하려면 sheet-scroll 이어야 한다");
});

test("새로 적을 때 결제자는 두 폼 모두 로그인한 사람이 기본값이다", () => {
  // 두 번째 사람은 매번 결제자를 바꿔야 했다. 자기가 쓴 걸 적는 게 대부분이다.
  // 한쪽만 고치면 같은 화면에서 규칙이 갈라져 더 헷갈린다.
  for (const [name, existing, field] of [
    ["openForm", "expense", "member"],
    ["showFormView", "template", "fixed-member"],
  ]) {
    const body = fn(name);
    assert.match(body, new RegExp(`${existing}\\?\\.member \\|\\| getProfile\\(\\)\\?\\.id`),
      `${name}: 고칠 때는 원래 결제자를 유지해야 한다`);
    assert.match(body, new RegExp(`input\\[name="${field}"\\]\\[value="\\$\\{defaultMember\\}"\\]`),
      `${name}: 기본 결제자를 실제로 선택하지 않는다`);
    // 있을 때만 반영하면 새 기록은 HTML 의 checked(첫 사람)로 남는다.
    assert.doesNotMatch(body, new RegExp(`if \\(${existing}\\) \\{[\\s\\S]*?radio`, "i"),
      `${name}: 수정할 때만 반영하고 있다`);
  }
});

test("남은 목표는 폼에서 고른 결제자를 따라간다", () => {
  // 로그인한 사람으로 고정하면 결제자를 바꿨을 때 엉뚱한 사람의 목표를 보여 준다.
  const sync = fn("syncGoalNotice");
  assert.match(sync, /data\.get\("member"\)/, "결제자를 폼에서 읽어야 한다");
  assert.match(sync, /getMemberGoal\(memberId\)/);
  assert.doesNotMatch(sync, /getProfile\(\)/, "로그인한 사람으로 고정하면 안 된다");
});

test("남은 목표는 이번 달이 아니면 아무 말도 하지 않는다", () => {
  // 목표는 값이 하나뿐이라 지난 달을 '지금의 목표'로 판정하게 된다.
  const sync = fn("syncGoalNotice");
  assert.match(sync, /date\.slice\(0, 7\) === toMonthKey\(new Date\(\)\)/);
  assert.match(sync, /elements\.goalNotice\.hidden = true/);
});

test("수정 중인 지출은 남은 목표에서 두 번 세지 않는다", () => {
  assert.match(fn("syncGoalNotice"), /excludeId: editingExpenseId/);
});

test("금액·날짜·결제자가 바뀌면 남은 목표를 다시 계산한다", () => {
  // 셋 중 하나라도 빠지면 화면의 숫자가 조용히 낡는다.
  assert.match(app, /elements\.amount\.addEventListener\("input"[\s\S]{0,260}?syncGoalNotice\(\)/);
  assert.match(app, /syncDateDisplay\(\);\s*\n\s*syncGoalNotice\(\);/, "날짜가 바뀌면 기준 달이 달라진다");
  assert.match(app, /input\[name="member"\][\s\S]{0,140}?addEventListener\("change", syncGoalNotice\)/);
});

test("마이페이지는 상대 목표를 보여 주되 고치게 하지는 않는다", () => {
  // 둘이 상의해 정하는 금액이라 투명해야 하지만, 남의 프로필을 고칠 수는 없다(RLS도 막는다).
  const paint = fn("paintPartnerGoal");
  assert.match(paint, /member\.id !== getProfile\(\)\?\.id/);
  assert.match(paint, /님의 목표/);
  assert.match(html, /<p class="partner-goal" id="profile-partner-goal" hidden><\/p>/, "읽기 전용이어야 한다");
  assert.doesNotMatch(html, /id="profile-partner-goal"[^>]*<input/);
});

test("목표를 비우면 목표를 쓰지 않는 것으로 저장된다", () => {
  const submit = fn("handleProfileSubmit");
  assert.match(submit, /const goal = typed \? typed : null/, "빈 값은 null 이어야 한다");
  assert.match(submit, /goal !== null && !isValidAmount\(goal\)/, "0원 목표는 DB도 거절한다");
  assert.equal(readAmount(""), 0, "빈 칸은 0으로 읽혀 null 이 된다");
});

test("금액은 DB 가 받을 수 있는 크기를 넘지 못한다", () => {
  /*
   * amount·monthly_goal 은 postgres integer 다. 화면에서 12자리를 받아 두던 때는
   * 30억 원이 검증을 통과한 뒤 "저장에 실패했어요" 로만 끝나, 왜 안 되는지 알 수 없었다.
   */
  assert.equal(MAX_AMOUNT, 2147483647);
  assert.ok(isValidAmount(MAX_AMOUNT));
  assert.ok(!isValidAmount(MAX_AMOUNT + 1), "integer 를 넘으면 DB 가 거절한다");
  assert.ok(!isValidAmount(0));
  assert.ok(!isValidAmount(-1));
  assert.ok(!isValidAmount(1.5));
  // 넘치게 찍어도 입력칸에서 이미 막힌다.
  assert.equal(formatAmountInput("999999999999"), formatMoney(MAX_AMOUNT));
  assert.equal(formatAmountInput("1,234원"), "1,234");
  assert.equal(formatAmountInput(""), "");
});

test("지출·고정비·목표가 같은 금액 규칙을 쓴다", () => {
  // 예전에는 지출·고정비가 12자리, 목표가 10자리로 갈라졌고 셋 다 DB 범위와 어긋났다.
  assert.doesNotMatch(app, /MAX_DIGITS/, "자릿수로 자르던 방식이 남아 있다");
  for (const name of ["handleProfileSubmit", "validateExpenseInput", "validateFixedInput"]) {
    assert.match(fn(name), /isValidAmount/, `${name} 이 공통 규칙을 쓰지 않는다`);
  }
});

test("요약 카드의 목표는 입력 폼과 같은 규칙을 따른다", () => {
  // 같은 화면에서 규칙이 갈라지면 어느 쪽이 맞는지 알 수 없다.
  const renderFn = fn("render");
  assert.match(renderFn, /getSelectedMonth\(\) === toMonthKey\(new Date\(\)\)/, "이번 달에만 말해야 한다");
  const 비중칠하기 = fn("paintMemberShares");
  assert.match(비중칠하기, /summarizeGoal\(\{ monthly, memberId: share\.id, goal: getMemberGoal\(share\.id\) \}\)/);
  assert.match(비중칠하기, /slot\.goal\.hidden = !goal/, "목표가 없으면 아무것도 보이지 않아야 한다");
  // 요약은 항상 그 달 전체 기준이다. 사람 필터가 걸린 목록으로 계산하면 숫자가 흔들린다.
  assert.doesNotMatch(비중칠하기, /summarizeGoal\(\{ monthly: visible/);
});

test("요약 카드의 목표 줄은 카드를 밀어내지 않는다", () => {
  // 금액과 나란히 좁은 칸에 들어간다. 줄바꿈되면 두 카드 높이가 어긋난다.
  assert.match(css, /\.member-goal \{[^}]*white-space: nowrap/);
  assert.match(css, /\.member-goal \{[^}]*text-overflow: ellipsis/);
});

test("스크롤 잠금은 호출 횟수가 아니라 소유자를 센다", () => {
  // 전체 화면과 시트는 함께 잠글 수 있지만, 같은 시트를 두 번 연 것은 한 번이어야 한다.
  const lock = fn("lockPageScroll");
  const unlock = fn("unlockPageScroll");
  assert.match(app, /const owners = new Set\(\)/);
  assert.match(lock, /owners\.has\(owner\)/);
  assert.match(lock, /owners\.add\(owner\)/);
  assert.match(unlock, /owners\.delete\(owner\)/);
  assert.match(unlock, /owners\.size > 0/, "아직 다른 소유자가 있으면 잠금을 유지해야 한다");
});

test("대화가 달린 지출을 지우면 대화도 사라진다고 알린다", () => {
  // 대화는 지출과 함께 DB에서 지워지고(on delete cascade) 되돌리기로도 살아나지 않는다.
  const del = fn("deleteExpense");
  assert.match(del, /const lostNotes = getNoteCount\(id\)/, "지우기 전에 세어야 한다");
  assert.match(del, /지출과 대화 \$\{lostNotes\}개를 지웠어요/);

  const undo = fn("undoDelete");
  assert.match(undo, /pending\.lostNotes/);
  assert.match(undo, /되살릴 수 없어요/, "돌아오지 않는 것을 조용히 넘기면 안 된다");
});

test("지출을 지우면 대화 개수도 함께 버린다", () => {
  // 개수만 남으면 없는 대화를 있다고 표시하게 된다.
  assert.match(fn("removeExpense"), /const \{ \[id\]: removed, \.\.\.rest \} = noteCounts/);
});

test("서버에 못 닿은 것만으로는 로그아웃시키지 않는다", () => {
  // 지하철에서 앱을 열 때마다 비밀번호를 치게 할 수는 없다.
  const restore = fn("restoreSession");
  assert.match(restore, /if \(error\.offline\) throw error/, "세션을 버리기 전에 원인을 갈라야 한다");
  assert.match(restore, /await supabase\.auth\.signOut\(\)/, "프로필이 정말 없으면 되돌려야 한다");
  assert.match(fn("boot"), /catch \(error\)[\s\S]*showDataGate\(error\.message, true\)/);
});

test("고정비 반영이 실패하면 알린다 — 일부만 실패해도", () => {
  // 조용히 넘어가면 이번 달 고정비가 통째로 빠진 걸 모른 채 지나간다.
  assert.match(fn("applyOccurrences"), /failed \+= 1/);
  // 성공만 알리던 때가 있었다. 그때는 2건 중 1건이 빠져도 "1건을 넣었어요"만 떴다.
  assert.match(describeApplied({ created: 1, failed: 1 }), /넣었고 1건은 반영하지 못했어요/);
  assert.match(describeApplied({ created: 0, failed: 2 }), /2건을 반영하지 못했어요/);
  assert.match(describeApplied({ created: 3, failed: 0 }), /3건을 넣었어요/);
  assert.equal(describeApplied({ created: 0, failed: 0 }), null);
});

test("고정비 반영 결과를 두 경로 모두 같은 문구로 알린다", () => {
  // 등록 직후 경로는 failed 를 아예 보지 않던 때가 있었다.
  assert.match(fn("startApp"), /describeApplied\(applied\)/);
  assert.match(fn("handleFixedSubmit"), /describeApplied\(applied\)/);
});

test("메시지 한 건에 목록 전체를 다시 그리지 않는다", () => {
  const receive = fn("receiveNote");
  // 모르는 지출이면 세지도 그리지도 않는다. 버리지 않고 맡아 두는 건 아래 별도 검사에서 본다.
  assert.match(receive, /const expense = getExpenses\(\)\.find[\s\S]{0,120}?if \(!expense\) \{[\s\S]{0,140}?return;\n\s*\}/,
    "우리 가구 지출이 아니면 개수도 건드리면 안 된다");
  // 달라지는 건 그 행의 개수뿐이다. 통째로 갈면 열어 둔 스와이프와 포커스가 사라진다.
  assert.match(receive, /repaintExpenseRow\(expense\)/);
  assert.doesNotMatch(receive, /\brender\(\)/, "메시지 한 건에 전체를 다시 그릴 이유가 없다");
});

test("한 행만 다시 그릴 때 스와이프 상태와 포커스를 잃지 않는다", () => {
  const repaint = fn("repaintExpenseRow");
  // openRow 는 요소를 그대로 가리킨다. 열린 행을 갈아 끼우면 사라진 노드를 가리킨 채 남는다.
  assert.match(repaint, /is-open[\s\S]{0,40}closeOpenRow\(\)/);
  assert.match(repaint, /hadFocus[\s\S]{0,120}\.focus\(\)/);
  // 목록에 없는 행이면 할 일이 없다.
  assert.match(repaint, /if \(!row\) return false/);
});

test("로그아웃하면 예약된 동기화도 취소한다", () => {
  assert.match(app, /unsubscribe\(noteChannel\);\s*\n\s*clearTimeout\(syncTimer\)/);
});

test("id는 문서 전체에서 겹치지 않는다", () => {
  // querySelector 는 먼저 나오는 하나만 돌려준다. id가 겹치면 서로 다른 코드가
  // 같은 요소를 덮어쓰며 값이 왔다 갔다 한다. 화면을 봐야만 알 수 있어 놓치기 쉽다.
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const duplicated = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  assert.deepEqual([...new Set(duplicated)], [], "중복된 id");
});

test("요약 카드와 마이페이지는 서로 다른 요소를 쓴다", () => {
  // 둘 다 '상대의 목표'를 다루지만 보여 주는 값이 다르다 —
  // 카드는 남은 금액, 마이페이지는 목표 금액이다. 같은 요소를 쓰면 번갈아 덮어쓴다.
  assert.match(html, /id="partner-goal"/, "요약 카드 자리");
  assert.match(html, /id="profile-partner-goal"/, "마이페이지 자리");
  assert.match(app, /partnerGoal: document\.querySelector\("#profile-partner-goal"\)/);
});

test("이메일만 기억하고 비밀번호는 저장하지 않는다", () => {
  // 폰을 잃어버리면 가계부가 통째로 열리는 것과 같아진다.
  assert.match(app, /const SAVED_EMAIL_KEY = "dulsallim:saved-email"/);
  const remember = fn("rememberEmail");
  assert.match(remember, /localStorage\.setItem\(SAVED_EMAIL_KEY, email\)/);
  assert.doesNotMatch(app, /setItem\([^)]*password/i, "비밀번호를 저장하면 안 된다");
  assert.doesNotMatch(html, /id="login-password"[^>]*value=/, "비밀번호를 마크업에 박으면 안 된다");
});

test("기억은 로그인에 성공한 이메일만 남긴다", () => {
  // 오타를 기억해 두면 다음에도 그대로 막힌다.
  const handler = app.match(/elements\.loginForm\.addEventListener\("submit"[\s\S]*?\n\}\);/)[0];
  const signInAt = handler.indexOf("await signIn(");
  const rememberAt = handler.indexOf("rememberEmail(");
  assert.ok(signInAt > -1 && rememberAt > signInAt, "성공을 확인한 뒤에 기억해야 한다");
  assert.match(handler, /rememberEmail\(elements\.rememberEmail\.checked \? email : null\)/,
    "체크를 풀면 기억도 지워야 한다");
});

test("기억해 둔 이메일이 있으면 비밀번호부터 입력하게 한다", () => {
  const show = fn("showLoginScreen");
  // reset 이 입력값을 비우므로 순서가 중요하다.
  assert.ok(show.indexOf("loginForm.reset()") < show.indexOf("elements.loginEmail.value = saved"),
    "reset 뒤에 채워야 값이 남는다");
  assert.match(show, /elements\.rememberEmail\.checked = Boolean\(saved\)/);
  assert.match(show, /saved \? elements\.loginPassword : elements\.loginEmail/);
});

test("저장소를 못 쓰는 브라우저에서도 로그인은 된다", () => {
  // 사파리 비공개 모드에서는 localStorage 접근 자체가 예외를 던진다.
  assert.match(fn("readSavedEmail"), /try \{[\s\S]*catch/);
  assert.match(fn("rememberEmail"), /try \{[\s\S]*catch/);
});

test("분류 목록은 화면과 DB 두 곳이 정확히 같다", async () => {
  // 한 곳만 늘리면 고를 수는 있는데 저장이 거절되거나(DB 누락),
  // 저장된 값을 화면이 '기타'로 뭉개 버린다(JS 누락).
  const { readFile } = await import("node:fs/promises");
  const { CATEGORIES } = await import("../src/expenses.js");
  const keys = Object.keys(CATEGORIES);

  for (const file of ["schema.sql", "migration-categories.sql"]) {
    const sql = await readFile(new URL(`../supabase/${file}`, import.meta.url), "utf8");
    const allowed = sql
      .match(/is_valid_category[\s\S]*?select value in \(([\s\S]*?)\)/)[1]
      .match(/'([a-z_]+)'/g)
      .map((quoted) => quoted.slice(1, -1));
    assert.deepEqual(allowed, keys, `${file}의 허용 목록이 CATEGORIES와 다르다`);
  }

  /*
   * 마크업은 더 이상 세 번째 벌이 아니다 — 선택지는 CATEGORIES 에서 만들어 넣는다.
   * 그래서 여기서는 값이 맞는지가 아니라, 채워 넣을 자리가 두 곳 다 있는지만 본다.
   */
  const selects = [...html.matchAll(/<select[^>]*name="category"[^>]*>([\s\S]*?)<\/select>/g)];
  assert.equal(selects.length, 2, "분류 선택 상자는 지출 폼과 고정비 폼 두 곳이다");
  for (const [전체, body] of selects) {
    assert.match(전체, /data-categories=/, "채워 넣을 자리라고 표시해 둬야 한다");
    assert.equal(body.trim(), "", "선택지를 손으로 적어 두지 않는다");
  }
});

test("기타는 언제나 마지막이다", async () => {
  // 목록에서 '기타'가 중간에 끼면 고를 때 눈이 한 번 더 멈춘다.
  // 선택지는 적어 둔 순서 그대로 만들어지므로 순서는 여기서 정해진다.
  const { CATEGORIES } = await import("../src/expenses.js");
  const keys = Object.keys(CATEGORIES);
  assert.equal(keys[keys.length - 1], "etc");
});

test("보낸 메시지는 시트를 다시 열지 않아도 바로 보인다", () => {
  // 보낸 메시지는 응답과 실시간 구독 두 경로로 돌아온다.
  // 양쪽에서 세면 먼저 도착한 쪽이 '이미 아는 메시지'가 되어 화면에 붙는 단계가 통째로 건너뛰어진다.
  const add = fn("addNote");
  assert.doesNotMatch(add, /countNote/, "보내는 쪽에서 세면 그리는 단계가 건너뛰어진다");

  // 세는 곳은 receiveNote 하나뿐이어야 한다(정의 자리는 뺀다).
  const callSites = [...app.matchAll(/countNote\(/g)].length - 1;
  assert.equal(callSites, 1, `countNote 를 부르는 곳이 ${callSites}곳 — 하나여야 한다`);
  assert.match(fn("receiveNote"), /const isNew = countNote\(note\)/);
});

test("복제는 값만 가져오고 새 기록으로 남는다", () => {
  // 수정으로 열리면 지난 기록을 덮어써 버린다.
  const copy = fn("copyExpense");
  assert.match(copy, /\{ editing: false \}/, "수정 모드로 열면 안 된다");
  assert.match(copy, /category: source\.category, item: source\.item, amount: source\.amount/);
  // 날짜와 결제자는 일부러 안 가져온다 — 폼이 오늘·로그인한 사람으로 채운다.
  assert.doesNotMatch(copy, /date: source\.date/, "지난 날짜를 가져오면 안 된다");
  assert.doesNotMatch(copy, /member: source\.member/, "지난 결제자를 가져오면 안 된다");

  const open = fn("openForm");
  assert.match(open, /editingExpenseId = editing \? expense\.id : null/);
  assert.match(open, /editing \? "기록 수정" : "새로운 기록"/, "복제인데 '기록 수정'이 뜨면 안 된다");
});

test("목록 행의 수정·삭제 자리는 그대로다", () => {
  // 손이 기억하는 위치가 바뀌면 삭제를 잘못 누른다. 복제는 맨 왼쪽에 붙인다.
  const row = app.match(/<span class="swipe-actions">[\s\S]*?<\/span>/)[0];
  const order = [...row.matchAll(/data-(copy|edit|delete)-id/g)].map((m) => m[1]);
  assert.deepEqual(order, ["copy", "edit", "delete"]);
});

test("복제는 지출 목록에만 있다", async () => {
  // 고정비는 매월 반복되는 틀이라 같은 것을 하나 더 만들 이유가 없다.
  const { readFile } = await import("node:fs/promises");
  const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

  assert.match(await read("ui/ledger.js"), /data-copy-id/, "지출 행에는 있어야 한다");
  assert.doesNotMatch(await read("features/fixed-sheet.js"), /data-copy|복제/, "고정비 행에는 없어야 한다");
});

test("캘린더 숫자는 사람 필터까지만 반영한다", () => {
  // 날짜까지 걸러 넘기면 고른 날 하나만 숫자가 남고 나머지 칸이 전부 빈다.
  const renderFn = fn("render");
  assert.match(renderFn, /renderCalendar\(\{[^}]*monthly: byMember/);
  assert.doesNotMatch(renderFn, /renderCalendar\(\{[^}]*monthly: visible/);
});

test("달을 옮기면 날짜 필터가 풀린다", () => {
  // 8월 3일을 고른 채 9월로 넘어가면 아무것도 안 보인다.
  assert.match(fn("setSelectedMonth"), /dateFilter = null/);
});

test("목록으로 돌아가면 날짜 필터가 풀린다", () => {
  // 캘린더에서 고른 날인데 캘린더가 사라지면 무엇 때문에 걸린 필터인지 알 수 없다.
  assert.match(fn("toggleView"), /mode === "list"\) setDateFilter\(null\)/);
});

test("사람과 날짜 필터는 함께 걸릴 수 있다", () => {
  const renderFn = fn("render");
  assert.match(fn("paintLedgerHeading"), /labels\.join\(" · "\)/, "둘 다 걸리면 이어 붙여 보여야 한다");
  assert.match(renderFn, /filterByDate\(byMember, dateFilter\)/, "사람 필터 위에 날짜를 더 건다");
});

test("캘린더만 볼 때는 아래 목록을 접는다", () => {
  // 날을 고르지 않았는데 그 달 전체가 아래 늘어서면 화면이 끝없이 길어진다.
  assert.match(fn("render"), /elements\.list\.hidden = calendarMode && !dateFilter/);
});

test("캘린더는 그 달이 아닌 칸을 누를 수 없게 둔다", () => {
  // 옆 달 날짜를 흐리게 보여주면 잘못 눌러 엉뚱한 달로 필터가 걸린다.
  const grid = fn("renderCalendar");
  assert.match(grid, /if \(!date\) \{[\s\S]{0,160}?is-blank/);
  assert.match(app, /closest\("\.calendar-cell\[data-date\]"\)/, "빈 칸은 애초에 선택자에 안 걸린다");
});

test("빈 화면 문구는 무엇 때문에 비었는지 알려준다", () => {
  // 어디를 눌러 풀어야 하는지 모르면 갇힌 것처럼 느껴진다.
  const empty = fn("fillEmptyState");
  assert.match(empty, /if \(!member && !date\) return empty/, "필터가 없으면 기본 문구 그대로");
  assert.match(empty, /날짜를 다시 눌러/, "날짜로 걸렸으면 날짜를 풀라고 해야 한다");
  assert.match(empty, /위 카드를 다시 눌러/, "사람으로 걸렸으면 카드를 풀라고 해야 한다");
});

test("아이콘만 있는 버튼에는 읽어 줄 이름이 붙는다", () => {
  // 글자가 사라지면 화면 낭독기에는 아무것도 안 들린다.
  const toggle = html.match(/<div class="view-toggle"[\s\S]*?<\/div>/)[0];
  for (const [, button] of toggle.matchAll(/<button([^>]*)>/g)) {
    assert.match(button, /aria-label="[^"]+"/, `이름 없는 버튼: ${button}`);
    assert.match(button, /aria-pressed="(true|false)"/, "고른 쪽을 알려야 한다");
  }
  assert.match(toggle, /aria-label="목록으로 보기"/);
  assert.match(toggle, /aria-label="캘린더로 보기"/);
});

test("전환 버튼은 손가락이 닿을 만큼 크다", () => {
  // 글자를 아이콘으로 바꾸면 누를 자리가 같이 줄어든다.
  const width = Number(css.match(/\.view-toggle button \{[^}]*width:\s*(\d+)px/)[1]);
  const height = Number(css.match(/\.view-toggle button \{[^}]*height:\s*(\d+)px/)[1]);
  assert.ok(width >= 36 && height >= 28, `${width}×${height}px — 너무 작다`);
});

test("캘린더도 목록과 같은 높이에서 시작한다", () => {
  /*
   * 목록은 첫 행의 안쪽 여백 덕에 글자가 제목에서 28px 아래에서 시작한다.
   * 캘린더는 요일 줄이 곧바로 붙으므로 그만큼을 margin 으로 벌어 준다.
   *
   * 이 관계가 두 번 깨졌다. 처음 맞출 때는 둘 다 41 이었는데,
   *  · 제목이 margin-bottom 에서 padding 으로 바뀌어 합쳐질 것이 없어졌고(+11)
   *  · 목록의 안쪽 여백이 좁아져 41 이 28 이 됐다(-13)
   * 캘린더만 24px 아래에 남았다. 계측: 제목 글자 아래에서 목록 28, 캘린더 52.
   *
   * 그래서 숫자 하나가 아니라 더해지는 두 값을 함께 본다.
   * 제목의 아래 여백 + 캘린더의 위 여백 = 목록의 첫 글자까지 거리(28).
   */
  const 토큰 = (이름) => Number(css.match(new RegExp(`${이름}: (\\d+)px`))[1]);
  const 제목아래 = 토큰(css.match(/\.section-heading \{[^}]*padding: var\(--space-\d+\) 0 var\((--space-\d+)\)/)[1]);
  const 캘린더위 = 토큰(css.match(/\.calendar \{[^}]*margin-top: var\((--space-\d+)\)/)[1]);
  assert.equal(제목아래 + 캘린더위, 28,
    `제목 아래 ${제목아래} + 캘린더 위 ${캘린더위} = ${제목아래 + 캘린더위}px — 목록의 28px 과 어긋난다`);
});

test("진행 중인 달은 몇 일까지 본 숫자인지 밝힌다", () => {
  // 3일치를 31일치와 견주면 90% 줄었다고 나온다. 같은 날짜까지만 보고, 그 사실을 적는다.
  assert.match(fn("comparableDay"), /monthKey === toMonthKey\(today\) \? today\.getDate\(\) : null/);
  assert.match(fn("paintAnalysis"), /compared\.maxDay \? ` · \$\{compared\.maxDay\}일까지` : ""/);
});

test("견줄 기록이 없으면 증감을 꾸며내지 않는다", () => {
  // 0원 대비 -100% 는 그럴듯한 거짓말이다.
  assert.match(fn("compareMonth"), /expenses\.some[\s\S]{0,90}?return null/);
  assert.match(fn("paintCompare"), /비교할 기록이 없어요/);
  // 상대가 0원이면 % 를 낼 수 없다. 금액 차이만 말한다.
  assert.match(fn("formatDiff"), /percent === null \? amount/);
});

test("분석은 본 화면과 같은 달·같은 사람 필터를 쓴다", () => {
  const paint = fn("paintAnalysis");
  assert.match(paint, /getSelectedMonth\(\)/);
  assert.match(paint, /getMemberFilter\(\)/);
  assert.match(fn("shiftAnalysisMonth"), /setSelectedMonth\(next\)/, "분석에서 옮긴 달이 본 화면에도 적용된다");
  // 열어 둔 채 달이나 사람을 바꿔도 같은 자리에서 함께 맞춰진다.
  assert.match(fn("render"), /!elements\.analysisPage\.hidden\) paintAnalysis\(\)/);
});

test("분석의 달 이동은 허용 범위를 벗어나지 않는다", () => {
  assert.match(fn("shiftAnalysisMonth"), /isValidMonthKey\(next\)\) return/);
  assert.match(fn("paintAnalysis"), /elements\.analysisPrev\.disabled/, "경계에서 버튼도 잠가야 한다");
});

test("사람 탭은 머리 아래에 붙어 있어 어디까지 내려가도 누를 수 있다", () => {
  /*
   * 안 붙여 두면 scrollTop 72 부터 붙어 있는 머리 밑으로 들어가고 122 부터는 통째로 덮인다.
   * 덮인 탭은 눌리지 않는다 — 그 자리를 짚으면 머리가 잡혀서, 사람을 바꾸려던 손이
   * 뒤로나 추이를 누른다(계측: 스크롤 122 에서 탭은 y16 인데 머리가 66 까지 덮는다).
   */
  assert.match(css, /#analysis-members \{[^}]*position: sticky/, "탭 줄은 붙어 있어야 한다");
  assert.match(css, /#analysis-members \{[^}]*top: var\(--head-height\)/, "머리 바로 아래에 붙는다");
  // .page 가 세로 flex 라 본문이 넘치면 머리도 눌린다. 그러면 붙는 자리가 10px 어긋난다.
  assert.match(css, /#analysis-page \.page-head \{[^}]*flex-shrink: 0/, "머리가 줄면 붙는 자리가 어긋난다");
});

test("사람 탭은 다시 그려도 버튼을 갈아 끼우지 않는다", () => {
  // 통째로 갈아 끼우면 방금 누른 버튼이 사라져 커서가 <body> 로 떨어진다.
  // 키보드로 고른 사람은 그 순간 자리를 놓치고 다음 Tab 이 화면 처음부터 다시 짚는다.
  const picker = fn("paintMemberPicker");
  assert.match(picker, /childElementCount !== options\.length/, "사람 수가 달라졌을 때만 새로 만든다");
  assert.match(picker, /picker\.children\[index\]/, "있는 버튼을 고쳐 쓴다");
  assert.match(picker, /aria-pressed", String\(current === id\)/, "누른 탭 표시는 매번 다시 적는다");
});

test("분석 페이지도 다른 전체 화면과 같은 처리를 받는다", () => {
  assert.match(app, /pages: \[[\s\S]*?#analysis-page[\s\S]*?\]/, "닫기·스크롤 잠금 목록에 있어야 한다");
  assert.match(html, /<section class="page" id="analysis-page"[^>]*aria-labelledby/);
});

test("분석 막대는 줄마다 같은 길이를 쓴다", () => {
  // 줄마다 격자를 따로 계산하면 오른쪽 금액의 글자 수만큼 막대가 짧아져 끝이 어긋난다.
  assert.match(css, /#analysis-list \{[^}]*grid-template-columns/, "열 너비는 목록 전체가 함께 정한다");
  assert.match(css, /\.analysis-row \{[^}]*display: contents/, "줄이 스스로 격자를 만들면 안 된다");
  assert.doesNotMatch(css, /\.analysis-row \{[^}]*grid-template-columns/);

  // 금액과 비중이 한 칸에 뭉쳐 있으면 열 너비를 나눌 수 없다.
  assert.match(app, /class="analysis-amount"/);
  assert.match(app, /class="analysis-percent"/);
});

test("막대 길이는 옆에 적힌 %와 같은 것을 가리킨다", () => {
  // 1등 분류 기준으로 그리면 47%인데 꽉 찬 막대가 되어 '거의 다 식비'로 읽힌다.
  const paint = fn("paintShares");
  assert.match(paint, /width:\$\{\(category\.total \/ total\) \* 100\}%/);
  assert.doesNotMatch(paint, /categories\[0\]\.total/, "1등을 기준으로 삼으면 안 된다");
  // 회색 트랙이 100% 자리를 지켜야 비교 대상이 생긴다.
  assert.match(css, /\.analysis-bar \{[^}]*background: var\(--paper-deep\)/);
  const floor = Number(css.match(/\.analysis-bar i \{[^}]*min-width:\s*(\d+)px/)[1]);
  assert.ok(floor >= 8, `min-width ${floor}px — 작은 분류가 안 보인다`);
});

test("비중을 나타내는 막대는 화면이 달라도 같은 두께다", () => {
  // 같은 뜻의 그림이 화면마다 두께가 다르면 서로 다른 것으로 읽힌다.
  const 분석 = css.match(/\.analysis-bar \{[^}]*?height:\s*(\S+?);/);
  const 본화면 = css.match(/\.ratio-bar \{[^}]*?height:\s*(\S+?);/);
  assert.ok(분석 && 본화면, "두 막대의 height 규칙을 찾지 못했다");
  assert.equal(분석[1], 본화면[1], `분석 ${분석[1]} vs 본 화면 ${본화면[1]}`);
  // 같은 숫자를 두 번 적는 것으로는 부족하다. 한쪽만 고치면 조용히 어긋난다.
  assert.match(분석[1], /^var\(--bar-thin\)$/, "두께를 이름 하나로 정할 것");
});

test("비교 막대 둘은 같은 자로 잰다", () => {
  // 각자 자기 달의 비중으로 그리면 같은 금액을 써도 총액이 큰 달의 막대가 짧아져
  // "줄였다"로 읽힌다. 길이 차이가 곧 금액 차이여야 한다.
  const paint = fn("paintCompared");
  assert.match(paint, /const scale = Math\.max\([\s\S]{0,120}?row\.total, row\.otherTotal/);
  // 두 막대가 같은 fill\(\)을 지나며 같은 scale 로 나뉜다.
  assert.match(paint, /amount \/ scale/);
  assert.match(paint, /fill\(row\.total, row\.color\)/);
  assert.match(paint, /fill\(row\.otherTotal, row\.color\)/);
  assert.doesNotMatch(paint, /compared\.total/, "각 달 총액으로 나누면 비중 비교가 되어 버린다");
});

test("비교를 켜면 오른쪽 숫자도 증감으로 바뀐다", () => {
  // 같은 자로 잰 막대 옆에 비중(%)이 남아 있으면 둘이 다른 말을 한다.
  const paint = fn("paintCompared");
  assert.match(paint, /row\.diff > 0 \? "\+" : "−"/);
  assert.doesNotMatch(paint, /category\.percent|row\.percent/, "비교 중에는 비중을 쓰지 않는다");
  // 비교를 끄면 원래대로 비중을 보여준다.
  assert.match(fn("paintShares"), /category\.percent/);
});

test("견줄 기록이 없는 달은 고를 수 없다", () => {
  const picker = fn("paintComparePicker");
  assert.match(picker, /button\.disabled = !가능\[mode\]/);
  assert.match(app, /button && !button\.disabled/, "막힌 버튼을 눌러도 켜지면 안 된다");
});

test("0원인 분류에는 막대를 그리지 않는다", () => {
  // 최소 굵기 8px 이 0에까지 적용되면 안 썼는데 쓴 것처럼 보인다.
  assert.match(fn("paintCompared"), /amount \? `<i style="width:.*?" : ""/s);
});

test("비교를 고를 수 있다는 것이 눈에 보인다", () => {
  // 잠긴 것과 안 잠긴 것이 똑같이 보이면 눌러볼 생각조차 안 든다.
  assert.match(html, /class="compare-mark"/, "고를 수 있다는 표식이 있어야 한다");
  assert.match(css, /button\[aria-pressed="true"\] \.compare-mark \{[^}]*background: var\(--accent\)/);
  assert.match(css, /\.compare-list button:disabled \{[^}]*opacity/, "잠긴 줄은 흐려야 한다");

  // 고를 게 있는데 아직 안 골랐을 때만 안내한다.
  assert.match(fn("paintComparePicker"), /elements\.compareHint\.hidden = !고를수있음 \|\| Boolean\(active\)/);
});

test("잔소리 문구는 쓴 사람만 읽을 수 있다", async () => {
  // 대상이 미리 읽으면 잔소리가 아니다. 같은 가구라고 열어 주면 안 된다.
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/migration-nag.sql", import.meta.url), "utf8");
  assert.match(sql, /create policy nags_own on nags\s*\n\s*for all using \(author_id = auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /on nags[\s\S]*?using \(household_id = current_household_id\(\)\)/,
    "가구 전체에 열면 대상이 읽을 수 있다");
});

test("잔소리는 서버가 판단하고 서버가 적는다", async () => {
  // 화면에서 계산하려면 대상의 폰이 문구를 먼저 읽어야 한다. 그 순간 숨긴 뜻이 사라진다.
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/migration-nag.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function fire_nags[\s\S]*?security definer/);
  assert.match(sql, /household_id = current_household_id\(\)/, "남의 가구 지출로는 부를 수 없어야 한다");
  assert.match(fn("addExpense"), /remote\.fireNags\(created\.id\)/);
});

test("잔소리는 한 달에 구간마다 한 번만 울린다", async () => {
  // 없으면 80%를 넘긴 뒤 지출할 때마다 매번 붙는다.
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/migration-nag.sql", import.meta.url), "utf8");
  assert.match(sql, /primary key \(target_id, month, percent\)/);
  assert.match(sql, /on conflict \(target_id, month, percent\) do nothing/);
  // 40%에서 85%로 뛰면 50·70·80을 모두 지난 것으로 표시하고, 말은 가장 높은 하나만 한다.
  assert.match(sql, /n\.percent <= v_ratio/);
  assert.match(sql, /select max\(percent\) into v_top from newly/);
  assert.match(sql, /where target_id = v_paid_by and percent = v_top/);
});

test("잔소리는 이번 달 지출에만 울린다", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/migration-nag.sql", import.meta.url), "utf8");
  assert.match(sql, /if v_month <> date_trunc\('month', current_date\)::date then return; end if;/);
});

test("울린 기록은 화면이 직접 손댈 수 없다", async () => {
  // 지웠다 다시 울리게 만들 수 있으면 한 번만 울린다는 약속이 깨진다.
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/migration-nag.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke all on nag_fires from authenticated, anon/);
  assert.doesNotMatch(sql, /create policy[^;]*on nag_fires/, "정책을 두면 함수 밖에서도 손댈 수 있다");
});

test("잔소리는 다섯 개까지, 같은 구간에 둘을 둘 수 없다", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/migration-nag.sql", import.meta.url), "utf8");
  assert.match(sql, /unique index[^;]*nags \(author_id, percent\)/);
  assert.match(app, /const MAX_NAGS = 5/);
  assert.match(fn("paintList"), /elements\.addNag\.disabled = full/, "다 찼으면 추가 버튼이 잠겨야 한다");
  assert.match(fn("addNag"), /nags\.length >= MAX_NAGS\) return/);
});

test("잔소리 스위치는 저장에 실패하면 되돌아간다", () => {
  // 켠 줄 알았는데 안 켜져 있으면 안 된다.
  assert.match(fn("toggleNagEnabled"), /catch \(error\)[\s\S]*elements\.nagEnabled\.checked = !enabled/);
});

test("잔소리 입력은 목록에 밀리지 않는 자리에 있다", () => {
  // 목록 아래에 폼을 두면 다섯 개가 쌓였을 때 화면 밖으로 밀린다.
  assert.match(html, /<header class="page-head">[\s\S]*?id="add-nag"[\s\S]*?<\/header>/, "머리에 추가 버튼이 있어야 한다");
  assert.match(css, /\.page-head \{[^}]*position: sticky/, "머리가 붙어 있어야 늘 닿는다");
  assert.match(html, /<dialog class="sheet" id="nag-sheet"/);
  assert.match(app, /SHEETS = \[[\s\S]*?elements\.nagSheet[\s\S]*?\]/, "다른 시트와 같은 처리를 받아야 한다");
  assert.match(app, /closeOnPress\(elements\.closeNagSheet, closeNagSheet\)/);
});

test("잔소리 스위치는 보기만 토글이고 알맹이는 체크박스다", () => {
  // 화면 낭독기와 키보드에는 그대로 체크박스로 보여야 한다.
  assert.match(html, /<input type="checkbox" id="nag-enabled" class="switch-input"/);
  assert.match(css, /\.switch-input:checked \+ \.switch \{[^}]*background: var\(--accent\)/);
  assert.match(css, /\.switch-input:focus-visible \+ \.switch \{[^}]*outline/, "키보드 포커스가 보여야 한다");
});

test("잠긴 아이콘 버튼은 어느 화면에서든 잠겨 보인다", () => {
  // 화면마다 따로 정하면 새 화면에서 빠뜨린다.
  assert.match(css, /\.icon-button:disabled \{[^}]*opacity/);
  assert.doesNotMatch(css, /#[a-z-]+ \.icon-button:disabled/, "특정 화면에만 걸어 두면 안 된다");
});

test("시트 안 항목 간격은 폼마다 따로 정하지 않는다", () => {
  // id 로 하나씩 걸어 두면 새 시트를 만들 때 빠뜨려 라벨이 서로 붙는다.
  assert.match(css, /\.sheet-scroll \{[\s\S]*?gap:\s*var\(--space-\d+\)/);
  assert.doesNotMatch(css, /#expense-form,\s*\n#fixed-form \{[^}]*gap/);
});

/* ── 코드 리뷰 후속 ───────────────────────────────────────────── */

test("README 는 새 프로젝트에 마이그레이션을 실행하라고 하지 않는다", async () => {
  // migration-profile.sql 은 그 시점의 권한만 열어 둔다. 새 프로젝트에 나중에 실행하면
  // monthly_goal·nag_enabled 수정 권한이 도로 닫혀 마이페이지 저장과 잔소리 토글이 깨진다.
  const { readFile, readdir } = await import("node:fs/promises");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const 신규 = readme.split("이미 쓰고 있는 프로젝트")[0];

  assert.doesNotMatch(신규, /migration-\w+\.sql \|/, "새 프로젝트 표에 마이그레이션이 있으면 안 된다");

  // 있는 마이그레이션은 하나도 빠짐없이 안내돼야 한다.
  const files = (await readdir(new URL("../supabase", import.meta.url)))
    .filter((name) => name.startsWith("migration-"));
  assert.ok(files.length, "마이그레이션 파일을 찾지 못했다");
  for (const file of files) {
    assert.ok(readme.includes(file), `README 에 ${file} 안내가 없다`);
  }
});

test("schema.sql 하나로 새 프로젝트가 완성된다", async () => {
  // 마이그레이션에만 있고 schema.sql 에 없으면, 새로 깐 사람은 그 기능이 통째로 빠진다.
  const { readFile } = await import("node:fs/promises");
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");

  for (const 조각 of ["nags", "nag_fires", "fire_nags", "reset_household", "apply_fixed_cost"]) {
    assert.ok(schema.includes(조각), `schema.sql 에 ${조각} 이 없다`);
  }
});

test("verify.sql 의 기대 개수는 schema.sql 의 실제 개수와 같다", async () => {
  // 숫자를 손으로 적어 두면 표나 정책이 늘 때마다 어긋나고, 멀쩡한 설치가 FAIL 로 보인다.
  const { readFile } = await import("node:fs/promises");
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const verify = await readFile(new URL("../supabase/verify.sql", import.meta.url), "utf8");

  const 표 = schema.match(/create table if not exists/g).length;
  const 정책 = schema.match(/^create policy/gm).length;

  assert.equal(Number(verify.match(/'테이블 생성'[\s\S]{0,80}?' \/ (\d+)'/)[1]), 표);
  assert.equal(Number(verify.match(/'접근 정책'[\s\S]{0,80}?' \/ (\d+)'/)[1]), 정책);
});

test("대화는 반드시 자기 이름으로만 남길 수 있다", async () => {
  // author_id 를 안 보면 API 를 직접 불러 상대 이름으로 메시지를 지어낼 수 있다.
  const { readFile } = await import("node:fs/promises");
  for (const file of ["schema.sql", "migration-hardening.sql"]) {
    const sql = await readFile(new URL(`../supabase/${file}`, import.meta.url), "utf8");
    const 정책 = sql.match(/create policy expense_notes_all[\s\S]*?;/)[0];
    const 검사부 = 정책.split("with check")[1];
    assert.match(검사부, /author_id = auth\.uid\(\)/, `${file} 이 작성자를 확인하지 않는다`);
  }
});

test("대화를 고치거나 지울 권한은 주지 않는다", async () => {
  // 정책의 using 은 같은 가구면 통과시키므로, 권한을 열어 두면 상대 말을 지울 수 있다.
  const { readFile } = await import("node:fs/promises");
  for (const file of ["schema.sql", "migration-hardening.sql"]) {
    const sql = await readFile(new URL(`../supabase/${file}`, import.meta.url), "utf8");
    assert.match(sql, /revoke update, delete on expense_notes from authenticated/, file);
    assert.doesNotMatch(
      sql,
      /grant[^;]*update[^;]*\bon\b[^;]*expense_notes[^;]*to authenticated/,
      `${file} 이 대화 수정 권한을 연다`,
    );
  }
});

test("publication 등록은 이미 들어 있는지 보고 한다", async () => {
  // alter publication 에는 if not exists 가 없어, 그냥 쓰면 두 번째 실행에서 멈춘다.
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /^alter publication/m, "맨 앞에 두면 재실행이 깨진다");
  assert.match(sql, /pg_publication_tables[\s\S]*?alter publication supabase_realtime add table/);
});

test("절반만 적용되면 안 되는 일은 서버 함수 하나로 부른다", () => {
  // 요청을 나누면 중간에 끊겼을 때 고정비만 사라지거나 같은 지출이 두 번 생긴다.
  assert.match(app, /rpc\("reset_household"\)/);
  assert.match(app, /rpc\("apply_fixed_cost"/);
  assert.doesNotMatch(app, /from\("fixed_cost_applications"\)\s*\.insert/, "직접 표시하면 안 된다");
  assert.doesNotMatch(app, /from\("expenses"\)\.delete\(\)\.eq\("household_id"/, "직접 지우면 안 된다");
});

test("목표를 넘기는 모든 길에서 잔소리를 판정한다", () => {
  // 새 지출만 보면 금액 수정이나 고정비 반영으로 넘긴 경우를 놓친다.
  for (const 함수 of ["addExpense", "editExpense", "applyOccurrences"]) {
    assert.match(fn(함수), /fireNags/, `${함수} 가 잔소리를 판정하지 않는다`);
  }
});

test("아직 모르는 지출의 메시지는 버리지 않고 맡아 둔다", () => {
  // 지출은 모아서 읽고 메시지는 즉시 온다. 버리면 개수가 새로고침 전까지 어긋난다.
  assert.match(fn("receiveNote"), /pending\.set/, "모르는 지출이면 맡아 둬야 한다");
  assert.match(app, /export function flushPendingNotes/);
  // 다시 읽은 "뒤", 그리기 "전"이어야 개수가 맞는다.
  assert.match(fn("repaintAfterSync"), /flushPendingNotes\(\);[\s\S]{0,120}?render\(\);/);
  assert.match(app, /await reloadHousehold\(\);\s*\n\s*repaintAfterSync\(\);/);
});

test("서버 함수는 비로그인이 부를 수 없다", async () => {
  // 표와 달리 함수는 실행 권한이 기본으로 PUBLIC 에 열려 있다.
  // grant 만 적어 두면 anon key 를 아는 누구나 부를 수 있고, 이 셋은 definer 라 소유자로 돈다.
  const { readFile } = await import("node:fs/promises");
  const 함수 = ["reset_household", "apply_fixed_cost", "fire_nags"];

  for (const file of ["schema.sql", "migration-hardening.sql", "migration-nag.sql"]) {
    const sql = await readFile(new URL(`../supabase/${file}`, import.meta.url), "utf8");
    for (const name of 함수) {
      if (!sql.includes(`grant execute on function ${name}`)) continue;
      assert.match(
        sql,
        new RegExp(`revoke execute on function ${name}\\([^)]*\\)\\s*from public`),
        `${file}: ${name} 의 PUBLIC 실행 권한을 닫지 않았다`,
      );
    }
  }
});

/* ── 한 해 추이 시트 ──────────────────────────────────────────── */

test("추이 시트도 다른 시트와 같은 처리를 받는다", () => {
  assert.match(html, /<dialog class="sheet" id="trend-sheet"/);
  assert.match(app, /SHEETS = \[[\s\S]*?elements\.trendSheet[\s\S]*?\]/, "공통 배선 목록에 있어야 한다");
  assert.match(fn("closeActiveSheet"), /closeTrendSheet\(\)/);
  assert.match(app, /closeOnPress\(elements\.closeTrendSheet, closeTrendSheet\)/);
});

test("그래프는 분석 페이지를 건드리지 않고 머리 오른쪽에서 연다", () => {
  // 분석 페이지는 한 달을 깊이 보는 곳이라 그대로 두기로 했다.
  assert.match(
    html,
    /<section class="page" id="analysis-page"[\s\S]*?<header class="page-head">[\s\S]*?id="open-trend"[\s\S]*?<\/header>/,
    "분석 페이지 머리에 그래프 버튼이 있어야 한다",
  );
  assert.match(css, /\.page-action \{[^}]*margin-left: auto/, "오른쪽 끝에 붙어야 한다");
});

test("짚은 달을 자세히 보면 그 달로 옮겨 가고 시트는 닫힌다", () => {
  // ‹ › 로 넘겨 가며 찾던 일을, 눈에 띈 달을 짚는 일로 바꾸는 것이 이 시트의 존재 이유다.
  assert.match(fn("openScrubbedMonth"), /setSelectedMonth\(data\.months\[scrubIndex\]\)/);
  assert.match(fn("openScrubbedMonth"), /closeTrendSheet\(\)/);
  // 기록이 없는 달로는 갈 데가 없다.
  assert.match(fn("openScrubbedMonth"), /recorded\[scrubIndex\]\) return false/);
});

test("세로 점선은 끌어서 옮기고, 옮기는 동안 다시 그리지 않는다", () => {
  // 매번 SVG를 통째로 만들면 손가락을 따라오지 못한다.
  assert.match(fn("setScrub"), /moveScrubLine\(/);
  assert.doesNotMatch(fn("setScrub"), /drawTrend\(/, "짚을 때마다 다시 그리면 안 된다");
  assert.match(app, /trendChart\.addEventListener\("pointerdown", startScrub\)/);
  assert.match(css, /\.trend-chart \{[^}]*touch-action: none/, "브라우저가 스크롤로 채가면 겨눌 수 없다");
});

test("세로 축은 언제나 0부터 그린다", () => {
  // 0에서 시작하지 않으면 20만 차이가 절벽처럼 보여 그래프가 거짓말을 한다.
  assert.match(fn("drawGrid"), /\[0, max \/ 2, max\]/);
});

test("추이 금액 단위는 캘린더와 같은 자를 쓴다", () => {
  // 같은 앱에서 한쪽은 46.3만, 다른 쪽은 463,000원이면 크기 비교가 눈으로 안 된다.
  assert.match(app, /import \{ formatCompactMoney \} from "\.\.\/calendar\.js"/);
});

test("추이 그래프의 좌우 여백은 같다", () => {
  // 세로 축 숫자를 왼쪽에 세우면 그 자리만큼 격자가 밀려 왼쪽만 휑해 보인다.
  assert.match(app, /PAD = \{ left: (\d+), right: \1,/, "좌우 여백이 달라졌다");
  assert.doesNotMatch(fn("drawGrid"), /PAD\.left - /, "숫자를 격자 왼쪽 밖으로 빼면 안 된다");
});

test("세로 축에는 숫자를 달지 않는다", () => {
  // 이 화면이 답하는 질문은 "얼마"가 아니라 "어떻게 변했나"다.
  // 정확한 금액은 점선을 짚으면 나오고, 기준이 되는 목표 금액은 범례에 있다.
  assert.doesNotMatch(fn("drawGrid"), /<text/, "축에 숫자를 달면 눈이 모양을 못 본다");
  assert.match(fn("drawLegend"), /목표 \$\{escapeHtml\(\s*formatCompactMoney\(line\.goal\)/);
});

test("가로축에는 열두 달을 다 적는다", () => {
  assert.doesNotMatch(fn("drawMonthLabels"), /index % 2/, "건너뛰면 몇 월인지 세어야 한다");
});

test("범례의 목표 표시는 그래프의 점선과 같은 모양이다", () => {
  // 색만 옅게 하면 "흐린 실선"으로 보여 목표선인지 알 수 없다.
  // 무늬를 인라인으로 그리는 이유: CSS 로 두면 색을 지정하는 인라인 스타일이 덮어쓴다.
  assert.match(fn("drawLegend"), /repeating-linear-gradient/);
  assert.doesNotMatch(css, /\.trend-key i\.is-goal \{[^}]*background-image/);
});

test("범례는 한 줄로 흐른다", () => {
  // 사람마다 줄을 나누면 넉 줄짜리 표처럼 보여 그래프보다 무거워진다.
  assert.match(css, /\.trend-row \{[^}]*display: contents/);
  assert.match(css, /\.trend-legend \{[^}]*flex-wrap: wrap/, "자리가 모자라면 넘어갈 수는 있어야 한다");
});

test("월 이동 줄은 스스로 아래 여백을 갖지 않는다", () => {
  // 기본값을 갖고 있으면 새로 쓰는 곳마다 0으로 되돌려야 하고, 한 번 빠뜨리면
  // 그 화면만 훌쩍 벌어진다. 추이 시트에서 실제로 38px 이 그대로 남아 있었다.
  const 기본 = css.match(/\n\.month-control \{[^}]*\}/)[0];
  assert.doesNotMatch(기본, /margin-bottom|margin:\s*[^;]*\d+px/, "여백은 쓰는 자리가 정한다");
  assert.match(css, /\.month-bar \{[^}]*padding: var\(--space-\d+\) var\(--space-\d+\) var\(--space-\d+\)/,
    "본 화면에서는 감싸는 줄이 띄운다");
});

test("추이 그래프로 달을 옮기면 본 화면도 함께 따라온다", () => {
  // 보고 있는 달은 본 화면과 나눠 쓰는 상태다. 한쪽만 다시 그리면 화면과 상태가 어긋나,
  // 본 화면에서 "다음 달"을 눌렀는데 과거로 가는 일이 생긴다(실제로 8월 → 7월이 나왔다).
  // render() 가 본 화면과 분석 페이지를 함께 그리므로 그것 하나만 부르면 된다.
  assert.match(app, /if \(openScrubbedMonth\(\)\) render\(\)/);
  assert.doesNotMatch(fn("openScrubbedMonth"), /paintAnalysis/, "render 가 이미 한다");
});

test("시트를 열어 둔 채 기록이 바뀌면 그래프도 다시 그린다", () => {
  // 분석 페이지가 이미 이 방식으로 갱신된다. 화면이 늘 때마다 여기 한 줄씩 붙는다.
  assert.match(app, /analysisPage\.hidden\) paintAnalysis\(\)/);
  assert.match(app, /trendSheet\.hidden\) refreshTrend\(\)/);
});

test("점선은 키보드로도 옮길 수 있다", () => {
  // 이 앱은 포커스 가두기와 focus-visible 을 챙겨 왔다. 여기만 포인터 전용이면 안 된다.
  assert.match(html, /id="trend-chart"[^>]*tabindex="0"/);
  assert.match(html, /id="trend-chart"[^>]*role="slider"/);
  assert.match(app, /trendChart\.addEventListener\("keydown", scrubByKey\)/);
  assert.match(css, /\.trend-chart:focus-visible \{[^}]*outline/);
});

test("굵게 칠할 달을 그리는 순서로 찾지 않는다", () => {
  // querySelectorAll 의 N번째가 N월이라고 가정하면, 나중에 같은 클래스를 쓰는 글자가
  // 하나만 늘어도 조용히 엉뚱한 달이 굵어진다. 터지지 않고 틀리는 쪽이라 더 나쁘다.
  assert.match(fn("moveScrubLine"), /data-month-index/);
  assert.doesNotMatch(fn("moveScrubLine"), /forEach\(\(label, index\)/, "순서에 기대면 안 된다");
});

test("한 해 데이터는 한 번만 계산한다", () => {
  // 열 때 두 번 계산해도 결과는 같지만, 읽는 사람이 "왜 두 번이지" 하고 멈춘다.
  assert.equal((app.match(/buildYearSeries\(getExpenses\(\)/g) || []).length, 1);
});

test("각 시트는 자기 수명주기와 닫기 타이머를 따로 가진다", () => {
  // 전역 타이머 하나를 나눠 쓰면 다른 시트를 여는 순간 먼저 닫던 시트의 정리가 취소된다.
  assert.match(app, /const sheetStates = new WeakMap\(\)/);
  assert.match(fn("getSheetState"), /stopWaiting: null/);
  assert.match(fn("showSheet"), /phase === "opening" \|\| state\.phase === "open"/);
  assert.match(fn("hideSheet"), /phase === "closed" \|\| state\.phase === "closing"/);
  assert.match(fn("hideSheet"), /state\.stopWaiting = afterMotion\(sheet/);
  assert.match(fn("showSheet"), /lockPageScroll\(sheet\)/);
  assert.match(fn("hideSheet"), /unlockPageScroll\(sheet\)/);
});

test("닫히는 중인 시트는 아무것도 눌리지 않는다", () => {
  // 키보드가 내려가면 시트가 움직인다. 그 사이 손을 뗀 자리의 히트테스트가 다시 일어나,
  // 닫기를 누른 손가락 밑에 다른 요소가 들어와 대신 눌린다.
  // (분류 select 는 닫기 버튼에서 330px 아래, 아이폰 키보드 높이와 거의 같다.
  //  select 가 눌리면 iOS 는 포커스만으로도 분류 피커를 띄운다)
  // 어느 요소가 들어오는지 맞히는 대신, 닫히는 동안은 시트를 통째로 막는다.
  assert.match(fn("hideSheet"), /classList\.add\("is-closing"\)/);
  assert.match(fn("hideSheet"), /classList\.remove\("is-closing"\)/);
  assert.match(css, /\.sheet\.is-closing \{[^}]*pointer-events: none/);
  // 닫는 도중 다시 열면 막아 둔 것을 풀어야 한다.
  assert.match(fn("showSheet"), /is-closing/);
});

test("숨기는 시점을 JS 가 따로 세지 않는다", async () => {
  /*
   * 예전에는 CSS 에 적은 시간을 JS 에도 한 번 더 적어 두고 setTimeout 으로 맞췄다
   * (시트 420, 화면 280, 토스트 220). 같은 숫자가 두 곳에 있으면 한쪽만 고치게 되고,
   * JS 가 짧으면 애니메이션이 잘려 툭 사라지고 길면 닫힌 뒤에도 한참 잠긴 채 남는다.
   * 이제 브라우저에게 직접 묻는다 — 계측: CSS 를 900ms 로 바꾸니 908ms 에 정리됐다.
   */
  const { readFile } = await import("node:fs/promises");
  for (const path of ["src/ui/sheet.js", "src/ui/page.js", "src/ui/toast.js"]) {
    const 소스 = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(소스, /afterMotion\(/, `${path} 가 움직임이 끝나기를 기다리지 않는다`);
    // 머무는 시간(VISIBLE_MS)은 움직임이 아니라 읽는 시간이라 JS 가 정한다.
    const 굳은시간 = [...소스.matchAll(/const (\w*(?:CLOSE|FADE|ANIM)\w*_MS) = \d+/g)];
    assert.deepEqual(굳은시간.map((m) => m[1]), [], `${path} 에 애니메이션 시간이 굳어 있다`);
  }
  // 물어보는 곳은 한 군데뿐이다.
  assert.match(fn("afterMotion"), /element\.getAnimations\(\)/);
  assert.match(fn("afterMotion"), /Promise\.allSettled/, "취소된 전환도 뒤처리는 해야 한다");
});

test("README 기능 목록이 실제 화면과 어긋나지 않는다", async () => {
  // 기능을 붙이면서 README 를 잊으면, 처음 보는 사람은 있는 줄도 모르고 지나간다.
  // 화면을 여는 버튼이 있는데 안내에 없으면 잡는다.
  const { readFile } = await import("node:fs/promises");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const 기능 = readme.split("## 준비")[0];

  const 화면 = [
    ["open-analysis", "분석"],
    ["open-trend", "추이"],
    ["open-nag", "소비 잔소리"],
    ["open-profile", "마이페이지"],
    ["open-settings", "설정"],
    ["notes-sheet", "대화"],
  ];
  for (const [id, 낱말] of 화면) {
    assert.ok(html.includes(id), `화면에 ${id} 가 없다 — 목록을 고칠 게 아니라 이 검사를 고쳐야 한다`);
    assert.ok(기능.includes(낱말), `README 기능 목록에 "${낱말}" 안내가 없다`);
  }
});

/* ── 머리는 높이가 변하지 않는다 ──────────────────────────────── */

test("머리 높이를 바꾸는 규칙이 없다", () => {
  /*
   * 이 한 줄이 버그 여덟 개의 뿌리였다. 스크롤에 따라 머리를 접으면
   * 머리 높이 → 문서 길이 → 스크롤 위치 → 다시 머리 높이 로 도는 고리가 생긴다.
   * 짧은 달·사람 필터·캘린더·시트 열림에서 그 고리가 갇히거나 튕겼다.
   *
   * 그래서 머리 안의 줄은 높이가 고정이고, 상태 클래스는 자리를 건드리지 않는다.
   * 바뀌는 것은 색과 투명도뿐이다.
   */
  /*
   * 값 자체가 아니라 "고정 높이여야 한다"가 규칙이다. 여백을 손보다 값이 바뀌어도
   * 스크롤에 따라 변하지만 않으면 된다.
   */
  assert.match(css, /\.month-bar \{[^}]*height: \d+px/);
  assert.doesNotMatch(css, /is-condensed/, "접는 장치는 통째로 걷어냈다");

  const 상태규칙 = css.match(/\.is-(?:scrolled|stuck)[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(상태규칙.length > 0, "상태 규칙을 하나도 못 찾았다면 정규식이 틀린 것이다");
  for (const 규칙 of 상태규칙) {
    // ::after 는 절대 위치라 자리를 밀지 않는다.
    if (규칙.includes("::")) continue;
    assert.doesNotMatch(규칙, /height:|padding|margin|display:|font-size/,
      `상태가 자리를 바꾸면 스크롤이 밀린다: ${규칙}`);
  }
});

test("머리는 스크롤 값을 읽지 않는다", () => {
  /*
   * scrollY 로 판단하면 그 값을 바꾸는 것이 무엇이든 — 시트가 잠글 때, 캘린더로 바꿔
   * 문서가 짧아질 때, 브라우저가 스스로 되감을 때 — 머리에 영향을 준다.
   * 관찰자는 "화면에 보이나"만 알려 주므로 그런 경로가 아예 없다.
   */
  const 감시 = fn("watch") + fn("rewatch") + fn("watchHeaderSummary");
  assert.match(감시, /new IntersectionObserver\(/);
  assert.doesNotMatch(감시, /scrollY|scrollHeight|getBoundingClientRect/);
  assert.doesNotMatch(app, /window\.addEventListener\("scroll"/, "스크롤 이벤트는 쓰지 않는다");
});

test("총액이 어디에도 없는 순간이 없다", () => {
  /*
   * 지켜보는 것은 큰 금액 그 자체다. 감싸는 블록을 보면 아래 여백만큼 어긋나,
   * 큰 금액이 머리 뒤로 숨은 뒤에도 작은 총액이 아직 안 뜬 구간이 생긴다.
   * 계측: 캘린더 화면에서 끝까지 내렸을 때 총액이 어디에도 없었다.
   *
   * 머리는 불투명하게 붙어 있으므로 창을 머리 높이만큼 깎아 두고 본다.
   * SLACK 만큼 미리 바꿔 둘 다 잠깐 보이게 한다 — 껌뻑임도 이걸로 막는다.
   */
  assert.match(fn("rewatch"), /watch\(elements\.totalAmount, headerHeight/);
  assert.match(app, /const SLACK = \d+;/);
  assert.match(fn("watch"), /rootMargin: `-\$\{headerHeight \+ SLACK\}px 0px 0px 0px`/);
});

test("달 이동은 스크롤해도 남는다", () => {
  // 월 라벨은 달 선택 시트를 여는 버튼이기도 하다. 사라지면 달을 바꾸려고 스크롤을 도로 올려야 한다.
  assert.match(html, /<div class="app-header">[\s\S]*?<div class="month-bar"[\s\S]{0,300}?class="month-control"/,
    "머리 안에 있어야 늘 보인다");
  assert.doesNotMatch(css, /\.month-bar[^{]*\{[^}]*display: none/);
});

test("머리 높이는 화면이 바뀌면 다시 잰다", () => {
  // 지출 내역 제목은 머리 바로 밑에 붙는다. 가로로 돌리거나 글자 크기가 바뀌어
  // 머리가 두꺼워지면, 옛 높이로는 제목이 머리 밑에 깔리거나 빈 띠가 생긴다.
  assert.match(fn("watchHeaderSummary"), /sizeObserver = new ResizeObserver\(rewatch\);\s*sizeObserver\.observe\(appHeader\)/);
  assert.match(fn("rewatch"), /const headerHeight = syncHeaderHeight\(\)/);
  assert.match(css, /\.section-heading \{[^}]*top: var\(--header-h/);
});

test("검사에서 빠진 소스 파일이 없다", async () => {
  // helpers/source.mjs 의 목록은 손으로 관리한다. 새 파일을 빠뜨리면 그 파일을 겨냥한
  // 검사가 통째로 조용히 통과한다 — 실패하지 않으니 알아채기가 어렵다.
  // (추이 그래프와 접힘에서 두 번 겪었다)
  const { readdir } = await import("node:fs/promises");
  const 실제 = [];
  const 훑기 = async (dir, prefix = "") => {
    for (const entry of await readdir(new URL(`../src/${dir}`, import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) await 훑기(`${dir}${entry.name}/`, `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".js")) 실제.push(`src/${prefix}${entry.name}`);
    }
  };
  await 훑기("");

  const 빠진것 = 실제.filter((path) => !Object.hasOwn(sourceLineCounts, path));
  assert.deepEqual(빠진것, [], `helpers/source.mjs 에 등록되지 않은 파일: ${빠진것.join(", ")}`);
});

test("머리 밑으로 들어가는 줄은 글자 한가운데서 잘리지 않는다", () => {
  // 요약 카드가 머리 밑으로 밀려 들어가면 이름 줄이 반쯤 잘린 채 삐져나왔다.
  assert.match(css, /\.is-scrolled:not\(\.is-stuck\) \.app-header::after \{[^}]*linear-gradient\(var\(--paper\), transparent\)/);
  /*
   * 맨 위에서는 걸지 않는다. 머리 바로 아래가 "함께 쓴 금액" 이라 이 그림자가
   * 그 글자를 14px 덮어 흐릿하게 만들었다(계측: 최대 21단계).
   * 제목이 붙은 뒤에도 걸지 않는다 — 불투명한 제목 위에 얹혀 같은 일이 벌어진다.
   */
  assert.doesNotMatch(css, /\n\.app-header::after/);
  assert.doesNotMatch(css, /\.app-shell:not\(\.is-stuck\) \.app-header::after/);
});

test("배선은 도메인별 파일에 있고 app.js 에는 남지 않는다", async () => {
  /*
   * 예전에는 배선 300줄이 app.js 한 파일에 있었고, 구간 이름과 내용이 어긋나 있었다 —
   * 잔소리가 "마이페이지 · 설정" 아래에, 지출 폼 입력이 "고정비" 아래에 있었다.
   * 한 파일이 커질수록 그런 어긋남이 눈에 안 띈다.
   *
   * app.js 에 남는 것은 앱을 띄우고 내리는 일뿐이다 — 로그인·로그아웃·다시 시도.
   */
  const { readFile } = await import("node:fs/promises");
  const appOnly = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  const 배선수 = (appOnly.match(/addEventListener/g) ?? []).length;
  assert.ok(배선수 <= 4, `app.js 에 배선이 ${배선수}개 있다 — 앱을 띄우고 내리는 것만 남긴다`);
  for (const 이름 of ["shell", "ledger", "forms", "pages"]) {
    assert.match(appOnly, new RegExp(`import "\\./wiring/${이름}\\.js"`), `${이름} 배선을 불러오지 않는다`);
  }
});

test("시작이 실패해도 화면이 말없이 멈추지 않는다", () => {
  /*
   * boot 는 아무도 기다리지 않는다. 안에서 터지면 잡히지 않은 거부가 되어
   * 화면은 "불러오는 중…" 에 멈춘 채 조용하다. 실제로 그렇게 한 번 놓쳤다 —
   * 모듈을 나누다 변수 하나가 딸려 가 wireOnce 가 죽었는데 아무 표시가 없었다.
   */
  assert.match(app, /boot\(\)\.catch\(\(error\) => showDataGate\(error\.message, true\)\)/);

  /*
   * startApp 도 마찬가지다. 예전에는 loadAll 만 감싸서, 그 뒤에서 터지면
   * 로그인 폼의 catch 가 대신 받아 이미 숨겨진 로그인 화면에 글자를 썼다.
   */
  const start = fn("startApp");
  assert.doesNotMatch(start, /\} catch \(error\) \{\s*showDataGate\(error\.message, true\);\s*return;/,
    "불러오기만 감싸면 그 뒤의 실패가 새어 나간다");
  assert.match(start, /watchForChanges\(profile\.household_id\);[\s\S]*\} catch \(error\) \{/);
});

test("실시간 맞춤은 한 모듈이 맡는다", () => {
  // 로그아웃이 채널 변수 세 개를 직접 만지고 있었다. 그 상태를 가진 쪽이 정리도 맡는다.
  assert.match(fn("stopSync"), /unsubscribe\(channel\)[\s\S]*unsubscribe\(noteChannel\)[\s\S]*clearTimeout\(syncTimer\)/);
  assert.match(app, /elements\.signOut\.addEventListener\("click", async \(\) => \{\s*stopSync\(\);/);
});

test("분류 선택지는 한 곳에서 만든다", () => {
  /*
   * 예전에는 같은 목록이 세 벌이었다 — CATEGORIES, 지출 폼의 <option> 10개, 고정비 폼의 10개.
   * 분류를 하나 더하려면 세 곳을 고쳐야 하고, 한 곳을 빠뜨리면 그 화면에서만 조용히 안 보인다.
   * 셋이 같은지 봐 주는 것도 없었다.
   */
  assert.doesNotMatch(html, /<option value="food"/, "선택지를 손으로 적어 두지 않는다");
  assert.match(html, /<select id="expense-category"[^>]*data-categories=""/);
  assert.match(fn("fillCategoryOptions"), /Object\.entries\(CATEGORIES\)/);
  // 고정비는 주거가 처음부터 골라져 있었다. 옮기면서 잃으면 안 된다.
  assert.match(html, /<select id="fixed-category"[^>]*data-categories="housing"/);
  assert.match(fn("fillCategoryOptions"), /option\.selected = value === 처음값/);
  // 비어 있는 select 에 값을 넣으면 조용히 무시된다. 폼을 건드리기 전에 채워야 한다.
  assert.match(fn("boot"), /^function boot\(\) \{[^;]*fillCategoryOptions\(\);/);
});

test("JS 가 넣는 길이 값에는 타입이 밝혀져 있다", () => {
  /*
   * 이름만 있는 커스텀 속성은 아무 글자나 들어가고, 이상한 값이 들어오면 그 값을 쓰는
   * 선언이 통째로 무효가 된다 — 제목의 top 이 죽으면 머리 밑에 깔린다.
   * 타입을 밝히면 이상한 값은 무시되고 initial-value 로 돌아간다.
   * 계측: 쓰레기값을 넣어도 제목 top 이 132 → 0px 로 돌아갈 뿐 규칙은 살아 있다.
   */
  const 넣는것 = [...new Set([...app.matchAll(/setProperty\("(--[a-z-]+)"/g)].map((m) => m[1]))];
  /*
   * --custom-color 만 빼 둔다. 기본값이 var(--line) 인데 initial-value 에는 var() 를
   * 쓸 수 없어, 등록하려면 선 색을 한 번 더 적어야 한다. 값이 두 곳이 되느니 안 밝힌다.
   */
  const 밝힐것 = 넣는것.filter((이름) => 이름 !== "--custom-color");
  for (const 이름 of 밝힐것) {
    assert.match(css, new RegExp(`@property ${이름} \\{[^}]*syntax: "<(?:length|number)>"`),
      `${이름} 에 타입이 없다`);
    assert.match(css, new RegExp(`@property ${이름} \\{[^}]*initial-value:`));
  }
  assert.ok(밝힐것.length >= 5, `밝힐 값이 ${밝힐것.length}개뿐이다 — 정규식을 확인할 것`);
});

test("목록과 캘린더는 툭 바뀌지 않고 이어진다", () => {
  /*
   * 같은 자리를 완전히 다른 그림으로 갈아 끼운다. 브라우저가 바꾸기 전후를 스냅숏으로
   * 떠서 겹쳐 주면 "같은 자리가 모양을 바꿨다"로 읽힌다.
   * 지원하지 않는 브라우저에서는 그냥 즉시 바뀐다 — 잃는 것은 연출뿐이다.
   */
  assert.match(fn("toggleView"), /withViewTransition\(\(\) => \{/);
  assert.match(fn("withViewTransition"), /document\.startViewTransition\?\./, "없으면 그냥 바꾼다");
  assert.match(fn("withViewTransition"), /prefers-reduced-motion: reduce/);
  /*
   * 이름을 하나로 묶으면 안 된다. 캘린더에서 날짜를 고르면 목록과 캘린더가 함께 보이는데,
   * 같은 시점에 같은 이름이 둘이면 브라우저가 연출을 통째로 건너뛴다.
   */
  assert.match(css, /#expense-calendar \{[^}]*view-transition-name: ledger-calendar/);
  assert.match(css, /\.expense-list \{[^}]*view-transition-name: ledger-list/);
});

test("본 화면 단락 사이 여백은 머리를 바꾸기 전과 같다", () => {
  /*
   * 머리 구조를 바꾸면서 여백이 함께 줄었다 — 달 이동 줄과 "함께 쓴 금액" 사이가
   * 38 → 15px, 총액과 사용자별 지출 사이가 30 → 26px. 구조를 바꿨다고 자간까지
   * 바뀔 이유는 없는데, 여백이 여러 규칙에 흩어져 있어 눈에 띄지 않았다.
   *
   * 머리 안쪽에서 달 이동 줄 아래로 11px 이 이미 남는다. 그래서 27 + 11 = 38 이다.
   * 숫자를 고칠 일이 생기면 실제 간격을 재서 이 주석도 함께 고칠 것.
   */
  assert.match(css, /\.month-bar \{[^}]*padding: var\(--space-2\) var\(--space-6\) var\(--space-2\)/);
  assert.match(css, /\n\.hero \{[^}]*padding: var\(--space-6\) 0 var\(--space-8\)/, "휴대폰: 위로 35px, 아래로 32px");
  // 요약 블록이 지출 내역 제목과 너무 벌어져 있어 아래쪽을 당겼다.
  assert.match(css, /\.member-summary \{[^}]*padding: var\(--space-5\) 0 var\(--space-2\)/);
  assert.match(css, /\.hero \{\n    \/\*[^*]*\*\/\n    padding: var\(--space-8\) 0 var\(--space-8\)/,
    "넓은 화면: 위아래 32px");
  // 사용자별 지출 단락과 지출 내역 사이. 22px 은 넉넉해서 목록을 8px 끌어올렸다.
  assert.match(css, /\.ledger \{[^}]*padding-top: var\(--space-3\)/);
});

test("맨 위에서 달 이동 줄은 가운데에 선다", () => {
  /*
   * 작은 총액이 안 보일 때도 자리를 잡고 있으면 달 이동이 그만큼 왼쪽으로 밀린다.
   * 화면의 나머지가 다 가운데 정렬이라 이 줄만 쏠려 보였다 — 계측: 66px 왼쪽.
   */
  assert.match(css, /\.compact-total \{[^}]*flex: 0 0 0/, "안 보일 때는 폭도 0 이어야 한다");
  assert.match(css, /\.month-bar \.month-control \{[^}]*margin-inline: auto/, "남는 자리를 양옆으로 나눈다");
  // space-between 이면 총액이 0폭이어도 달 이동은 왼쪽 끝에 붙는다.
  assert.doesNotMatch(css.match(/\n\.month-bar \{[^}]*\}/)[0], /justify-content/);
});

test("내려가면 달 이동은 왼쪽 끝까지 간다", () => {
  /*
   * 총액이 남는 자리를 다 가져가야 달 이동이 끝까지 밀려난다. 폭만 딱 차지하면
   * 남는 자리가 그대로 있어 달 이동은 어중간하게 조금만 옮겨 간다(계측: 왼쪽 끝 22 대신 67).
   * flex-grow 는 0 에서 1 로 흐르므로 그 사이가 이어진다 — 66px 을 한 프레임에 뛰지 않는다.
   */
  assert.match(css, /\.is-scrolled \.compact-total \{[^}]*flex-grow: 1/);
  assert.match(css, /\.compact-total \{[^}]*transition: flex-grow/);
  // 자리를 다 차지하므로 숫자는 오른쪽 끝에 붙여야 오른쪽 정렬로 보인다.
  assert.match(css, /\.compact-total \{[^}]*text-align: right/);
});

test("한 줄에 선 달 이름은 두 줄로 깨지지 않는다", () => {
  // 작은 총액과 한 줄에 서면 폭이 좁아진다. 실제로 "2026년 8 / 월" 로 깨졌다.
  assert.match(css, /\.month-label \{[^}]*white-space: nowrap/);
});

test("붙어 있는 제목 아래로 목록이 비치지 않는다", () => {
  // margin 은 투명하다. 아래 여백을 margin 으로 주면 그 틈으로 지나가는 줄이 보인다.
  // 그리고 목록 한 줄(72px)이 이 머리(44px)보다 커서 아랫부분이 늘 삐져나오므로,
  // 붙어 있는 동안에는 선을 그어 "여기 아래는 지나가는 목록"임을 알린다.
  const 규칙 = css.match(/\n\.section-heading \{[^}]*\}/)[0];
  assert.match(규칙, /background: var\(--paper\)/);
  assert.doesNotMatch(규칙, /margin-bottom/, "여백은 padding 으로 줘야 배경이 덮는다");
  // 딱 자르면 반쯤 잘린 글자가 남는다. 배경색으로 녹여 보낸다.
  // 붙기 전에는 지나가는 줄이 없는데도 첫 줄 위 20px 이 흐려져 까닭 없이 잘려 보인다.
  assert.match(css, /\.is-stuck \.section-heading::after \{[^}]*linear-gradient\(var\(--paper\), transparent\)/);
  // 머리 높이만큼 깎은 창에서 제목이 온전히 보이지 않으면 붙은 것이다.
  assert.match(fn("rewatch"), /watch\(elements\.sectionHeading, headerHeight/);
  assert.match(fn("붙었나"), /intersectionRatio >= 1\) return false/);
  /*
   * "온전히 보이지 않는다"만으로는 모자라다. 화면보다 아래에 있어 아직 보이지도 않는
   * 제목도 그 조건에 걸린다. 계측: 844×390 가로 화면과 390×400 짧은 화면에서
   * 맨 위인데도 붙은 것으로 읽혀, 흐림이 잘못 걸리고 머리 밑 그림자는 반대로 꺼졌다.
   */
  assert.match(fn("붙었나"), /entry\.boundingClientRect\.top <= 창\.top/);
});

test("제목 글자가 바뀌면 붙어 있는 제목을 다시 그리게 한다", () => {
  // 제목은 붙어 있어 iOS 가 따로 떼어 그리는데, 안의 글자가 바뀌어도 그 그림이
  // 갱신되지 않는 일이 있다. "(9)" 가 "(13)" 이 되면 넓어진 만큼이 네모나게 잘려
  // 닫는 괄호가 반쯤 사라져 보였다. 스크롤하면 멀쩡해지는 것도 그래서다.
  assert.match(fn("repaintLedgerTitle"), /display = "none"[\s\S]*?offsetHeight[\s\S]*?display = ""/);
  assert.match(fn("repaintLedgerTitle"), /title === paintedTitle\) return/, "안 바뀌었으면 건드리지 않는다");

  // 건수만 보면 모자란다 — 제목에는 고른 사람 이름도 붙어서, 건수가 그대로여도
  // 필터를 바꾸면 글자 폭이 달라진다. 제목 전체를 봐야 한다.
  assert.match(fn("repaintLedgerTitle"), /elements\.ledgerTitle\?\.textContent/);
  const 제목칠하기 = fn("paintLedgerHeading");
  const 필터 = 제목칠하기.indexOf("ledgerFilter.hidden");
  const 다시그리기 = 제목칠하기.indexOf("repaintLedgerTitle()");
  assert.ok(다시그리기 > 필터, "건수와 필터를 모두 적은 뒤에 봐야 한다");
});

test("시트를 열면 포커스가 모달 안으로 들어간다", () => {
  const focus = fn("moveFocusIntoSheet");
  assert.match(focus, /sheet\.focus\(\{ preventScroll: true \}\)/);
  assert.match(focus, /sheet\.contains\(document\.activeElement\)/);
  assert.match(fn("showSheet"), /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => moveFocusIntoSheet\(sheet\)\)\)/,
    "이미 열린 시트의 내부 화면을 바꿔도 포커스를 되돌려야 한다");
});

test("목록·캘린더 토글은 보이는 크기보다 넓게 눌린다", () => {
  // 알약을 크게 그리면 제목 줄이 두꺼워진다. 보이는 크기는 두고 누를 자리만 넓힌다.
  // 가로로도 넓히면 두 버튼의 자리가 겹쳐 경계에서 어느 쪽이 눌릴지 알 수 없어진다.
  assert.match(css, /\.view-toggle button \{[^}]*--pill-height: \d+px/, "알약 높이를 이름으로 둘 것");
  assert.match(css, /\.view-toggle button::after \{[^}]*inset: calc\(\(var\(--tap-min\) - var\(--pill-height\)\) \/ -2\) 0/,
    "넓히는 만큼을 44 에서 역산할 것 — 알약 높이를 바꾸면 자리도 따라와야 한다");
});

test("밀린 고정비를 한 건씩 줄 세우지 않는다", () => {
  // 고정비 10개가 열두 달 밀리면 백스무 번을 차례로 기다려 첫 화면이 몇 초 늦는다.
  const apply = fn("applyOccurrences");
  assert.match(apply, /Promise\.all\(occurrences\.slice\(from, from \+ APPLY_BATCH\)\.map\(applyOne\)\)/);
  // 그렇다고 전부 한꺼번에 던지지도 않는다.
  assert.match(app, /const APPLY_BATCH = \d+;/);
  assert.ok(APPLY_BATCH_SIZE > 1 && APPLY_BATCH_SIZE <= 12, `한 번에 ${APPLY_BATCH_SIZE}건은 과하다`);
  // 한 건이 실패해도 나머지는 살린다.
  assert.match(fn("applyOne"), /catch \{[\s\S]*?return null/);
});

test("전체 화면을 열면 뒤의 가계부는 탭에서 빠진다", () => {
  // 시트는 <dialog> 라 브라우저가 가둬 주지만 화면은 아니라, 커서가 덮인 목록 속으로 사라졌다.
  assert.match(fn("showPage"), /elements\.appShell\.inert = true/);
  assert.match(fn("showPage"), /page\.focus\(\{ preventScroll: true \}\)/);
  assert.match(fn("hidePage"), /elements\.appShell\.inert = false/);
  assert.match(fn("closePageNow"), /elements\.appShell\.inert = false/);
});

test("지출 내용면은 키보드로도 누를 수 있다", () => {
  // div 였을 때는 클릭 위임으로만 대화가 열려, 키보드·스위치 사용자는 대화를 못 열었다.
  assert.match(fn("createExpenseRow"), /<button class="expense-surface swipe-surface" type="button"/);
  // 버튼 기본 모양(가운데 정렬·테두리)을 걷어내지 않으면 div 였을 때와 달라 보인다.
  assert.match(css, /\.expense-surface \{[^}]*text-align: left/);
  assert.match(css, /\.expense-surface \{[^}]*border: 0/);
});

test("고정비를 채우기 전에 구독을 건다", () => {
  // 뒤에 두면 그 사이 상대가 남긴 말이 어느 쪽에도 안 잡힌다.
  // 이미 불러온 개수에도 없고, 구독은 지나간 일을 들려주지 않는다.
  const start = fn("startApp");
  assert.ok(
    start.indexOf("watchForChanges") < start.indexOf("applyDueFixedCosts"),
    "구독이 고정비 반영보다 뒤에 있다",
  );
});

test("상대가 초기화하면 내 고정비 목록도 비워진다", () => {
  /*
   * reset_household() 는 fixed_costs 와 expenses 를 함께 지운다.
   * 지출만 다시 읽으면 목록에는 지운 고정비가 그대로 남고,
   * 그 목록으로 반영을 시도하면 서버가 "고정비를 찾을 수 없습니다"로 막는다.
   */
  assert.match(fn("reloadHousehold"), /remote\.fetchFixedCosts\(session\.householdId\)/);
  assert.match(fn("reloadHousehold"), /fixedTemplates = nextTemplates/);
  // 실시간 대상에 fixed_costs 가 없으면 삭제 사실 자체가 상대에게 오지 않는다.
  assert.match(fn("subscribeHousehold"), /table: "fixed_costs"/);
  assert.match(fn("subscribeHousehold"), /table: "expenses"/);
  // render 는 고정비 목록을 그리지 않는다. 열어 둔 채라면 따로 맞춰야 한다.
  assert.match(app, /refreshFixedSheet\(\)/);
});

test("고정비 목록을 맞출 때 쓰던 폼은 건드리지 않는다", () => {
  // 적던 내용이 사라지면 안 된다. 그 사이 지워진 고정비면 저장할 때 서버가 막고 까닭을 알려 준다.
  assert.match(fn("refreshFixedSheet"), /elements\.fixedSheet\.hidden \|\| !elements\.fixedForm\.hidden/);
});

test("실시간 대상에 세 표가 모두 들어 있다", async () => {
  // 빠져도 앱은 조용히 돌아간다. 어긋난 것을 알아채려면 verify.sql 이 짚어 줘야 한다.
  const { readFile } = await import("node:fs/promises");
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const verify = await readFile(new URL("../supabase/verify.sql", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migration-fixed-sync.sql", import.meta.url), "utf8");
  for (const table of ["expenses", "expense_notes", "fixed_costs"]) {
    assert.match(schema, new RegExp(`add table ${table};`), `schema.sql 에 ${table} 이 빠졌다`);
  }
  // 이미 쓰고 있는 프로젝트는 schema.sql 을 다시 돌리지 않는다. 따라잡을 파일이 따로 있어야 한다.
  assert.match(migration, /alter publication supabase_realtime add table fixed_costs;/);
  assert.match(verify, /pubname = 'supabase_realtime'[\s\S]{0,200}fixed_costs/);
});

test("초기화는 설정 화면에 펼쳐 두지 않는다", () => {
  /*
   * 자주 하는 일이 아닌 데다 되돌릴 수 없다. 늘 보이면 손이 스치고,
   * 지나칠 때마다 "지운다"는 말이 눈에 들어와 설정 화면이 경고판이 된다.
   * 따로 열어야 나오게 두면 여는 행동 자체가 첫 번째 확인이 된다.
   */
  const 설정 = html.match(/<section class="page" id="settings-page"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(설정, /id="reset-confirm"/, "확인 입력칸이 설정 화면에 그대로 있다");
  assert.doesNotMatch(설정, /id="reset-submit"/, "삭제 버튼이 설정 화면에 그대로 있다");
  assert.match(설정, /id="open-reset-sheet"[\s\S]{0,200}데이터 초기화/, "여는 메뉴가 없다");
  // 폼은 시트 안으로 갔다.
  const 시트 = html.match(/<dialog class="sheet" id="reset-sheet"[\s\S]*?<\/dialog>/)[0];
  assert.match(시트, /id="reset-form"/);
  assert.match(시트, /id="reset-submit" disabled/, "처음에는 버튼이 잠겨 있어야 한다");
  // role·aria-modal 은 <dialog> 가 스스로 갖는다.
});

test("초기화 시트도 다른 시트와 같은 장치를 받는다", () => {
  // SHEETS 에 넣지 않으면 끌어 닫기·Tab 가두기·바깥 누르기가 이 시트에만 빠진다.
  assert.match(app, /elements\.trendSheet,\s*\n\s*elements\.resetSheet,/);
  assert.match(fn("closeActiveSheet"), /resetSheet\.hidden\) closeResetSheet\(\)/);
  assert.match(app, /closeOnPress\(elements\.closeResetSheet, closeResetSheet\)/);
});

test("다 지우면 시트와 설정 화면을 함께 닫는다", () => {
  // 지운 자리에 남아 있을 이유가 없다. 시트만 닫으면 빈 설정 화면이 덩그러니 남는다.
  const handler = fn("handleReset");
  assert.match(handler, /closeResetSheet\(\);[\s\S]{0,80}hidePage\(\)/);
  assert.match(handler, /showToast\("모든 기록을 지웠어요"\)/);
});

test("화면으로 돌아오면 다시 읽는다", () => {
  /*
   * 폰이 앱을 재우면 실시간 연결이 끊긴다. 다시 이어져도 자는 동안 있었던 일은
   * 들려주지 않아, 상대가 그사이 적은 지출이 다음 변경 때까지 화면에 없었다.
   */
  assert.match(app, /visibilitychange[\s\S]{0,140}visibilityState === "visible"\) catchUp\(\)/);
  // 얼려 둔 페이지를 되살릴 때는 visibilitychange 없이 이쪽만 울리는 경우가 있다.
  assert.match(app, /pageshow[\s\S]{0,120}event\.persisted\) catchUp\(\)/);
});

test("돌아왔을 때는 통째로 다시 읽는다", () => {
  const catchUp = fn("catchUp");
  /*
   * reloadHousehold 는 대화 개수와 구성원을 읽지 않는다.
   * 그것만 부르면 자는 동안 상대가 남긴 말이 목록에 나타나지 않는다.
   */
  assert.match(catchUp, /await loadAll\(profile\)/);
  assert.doesNotMatch(catchUp, /reloadHousehold/, "구성원과 대화 개수까지 읽어야 한다");
  assert.match(catchUp, /paintMembers\(\)/);
  assert.match(catchUp, /repaintAfterSync\(\)/);
});

test("돌아왔는데 못 읽어도 보던 화면은 지키다", () => {
  const catchUp = fn("catchUp");
  // 로그아웃하면 profile 이 빈다. 로그인 화면에서 돌아온 것과 구분된다.
  assert.match(catchUp, /if \(!profile \|\| catchingUp\) return/);
  // 돌아오자마자 오류 화면을 띄우지 않는다.
  assert.match(catchUp, /catch \{[\s\S]{0,140}?return;\n\s*\} finally \{[\s\S]{0,60}catchingUp = false/);
  assert.doesNotMatch(catchUp, /showDataGate/);
});

test("무엇을 그리든 머리 상태는 건드리지 않는다", () => {
  /*
   * 예전에는 캘린더로 바꾸면 문서가 짧아져 브라우저가 스크롤을 0 으로 되감았고,
   * 그 0 을 "맨 위로 올렸다"로 읽어 머리가 저절로 펴졌다. 사람 필터도 같은 길이었다.
   * 지금은 머리 상태를 정하는 곳이 관찰자 두 개뿐이라, 그리는 쪽에서 닿을 길이 없다.
   */
  const 손대는곳 = app.match(/classList\.(?:toggle|add|remove)\("is-(?:scrolled|stuck)"/g) ?? [];
  assert.deepEqual(손대는곳.length, 2, `머리 상태를 ${손대는곳.length} 군데서 바꾼다 — 관찰자 둘만이어야 한다`);
  assert.doesNotMatch(app, /condense|recheckAfterRender/i, "옛 이름이 남아 있으면 무엇을 하는지 오해한다");
});

test("키보드가 올라오면 시트를 그 위로 올린다", () => {
  /*
   * iOS Safari 는 키보드가 뜰 때 레이아웃 뷰포트를 통째로 밀어 올린다.
   * "밀지 마라"고 지정하는 viewport 의 interactive-widget 은 Safari 가 아직 없다(26.5까지).
   * 가려진 채로 두면 Safari 가 입력칸을 보이게 하려고 화면을 밀고, 미는 동안 누른 자리에
   * 다른 요소가 들어온다 — 닫기를 눌렀는데 그 자리로 올라온 분류 목록이 열리던 것이 이것이다.
   */
  const sync = fn("sync");
  assert.match(sync, /window\.innerHeight - viewport\.height - viewport\.offsetTop/);
  // 주소창이 오르내리는 정도를 키보드로 오해하면 시트 밑에 까닭 없는 틈이 생긴다.
  assert.match(sync, /inset > KEYBOARD_MIN/);
  assert.match(app, /const KEYBOARD_MIN = \d+;/);
  // 시트는 그만큼 올라가고, 키보드 위 공간을 넘지 않는다.
  assert.match(css, /\.sheet \{[^}]*bottom: var\(--keyboard-inset, 0px\)/);
  assert.match(css, /\.sheet \{[^}]*max-height: min\(92svh, 760px, var\(--viewport-h, 100svh\)\)/);
  // 없는 브라우저에서는 변수를 두지 않는다 — CSS 기본값이 지금까지의 동작이다.
  assert.match(fn("watchKeyboard"), /if \(!viewport\) return/);
  assert.match(fn("watchKeyboard"), /addEventListener\("resize", sync\)[\s\S]{0,80}addEventListener\("scroll", sync\)/);
});
