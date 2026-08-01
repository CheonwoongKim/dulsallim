import assert from "node:assert/strict";
import test from "node:test";

import { css, fn, html, source as app, sourceLineCounts, sw } from "./helpers/source.mjs";

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
  assert.match(start, /return;/);
  assert.match(app, /elements\.retryLoad\.addEventListener\("click", startApp\)/, "다시 시도할 방법이 있어야 한다");
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
  assert.match(hide, /hideTimer = setTimeout/, "추적되지 않으면 새 토스트를 즉시 지워버린다");
  assert.match(hide, /clearTimeout\(hideTimer\)/);
  assert.match(show, /clearTimeout\(hideTimer\)/, "새 토스트를 띄울 때 이전 숨김 예약을 취소해야 한다");
});

test("연도와 월 이동에는 상한·하한이 있다", () => {
  assert.match(fn("shiftPickerYear"), /clampYear\(/);
  assert.match(fn("openMonthSheet"), /clampYear\(/);
  assert.match(fn("selectMonth"), /isValidMonthKey\(monthKey\)/);
  assert.match(fn("shiftMonth"), /isValidMonthKey\(nextMonth\)/);
  assert.match(app, /elements\.prevYear\.disabled/, "경계에서 버튼을 비활성화해 시각적으로도 알려야 한다");
});

test("모달 시트에 포커스 트랩이 있다", () => {
  assert.match(html, /aria-modal="true"/);
  assert.match(fn("trapTab"), /event\.preventDefault\(\)/);
  assert.match(fn("keepFocusInSheet"), /sheet\.contains\(event\.target\)/);
  assert.match(app, /document\.addEventListener\("focusin", keepFocusInSheet\)/);
});

test("로그아웃하면 앞사람 기록이 화면에 남지 않는다", () => {
  const clear = fn("clearData");
  for (const line of [/expenses = \[\]/, /fixedTemplates = \[\]/, /context = null/, /setMembers\(\[\]\)/]) {
    assert.match(clear, line);
  }
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

test("닫기 버튼은 레이아웃이 흔들리기 전에 눌린 지점에서 동작한다", () => {
  // click은 손을 뗄 때 좌표를 다시 히트테스트하므로, 키보드가 내려가며 시트가 움직이면 엉뚱한 요소가 눌린다.
  assert.match(app, /elements\.closeForm\.addEventListener\("pointerdown"/);
  assert.match(app, /elements\.closeMonthSheet\.addEventListener\("pointerdown"/);
  assert.match(app, /elements\.closeForm\.addEventListener\("click"/, "키보드 사용자를 위해 click도 유지해야 한다");
});

test("닫기 버튼 누름은 시트 드래그로 오인되지 않는다", () => {
  assert.match(app, /closest\("\.close-button"\)/, "닫기 버튼 위 누름은 onBegin에서 걸러야 한다");
});

test("키보드가 내려가는 동안 폼은 입력을 받지 않는다", () => {
  assert.match(fn("beginSettle"), /is-settling/);
  assert.match(fn("beginSettle"), /clearTimeout\(formSettleTimer\)/);
  assert.match(app, /form\.addEventListener\("focusout"/);
  assert.match(css, /\.sheet-scroll\.is-settling\s*\{[^}]*pointer-events:\s*none/);
});

test("사람별 필터는 목록에만 적용되고 상단 요약은 그 달 전체를 유지한다", () => {
  const renderFn = fn("render");
  assert.match(renderFn, /const stats = summarize\(monthly, getMembers\(\)\)/, "요약은 필터 이전 목록으로 계산해야 한다");
  assert.match(renderFn, /filterByMember\(monthly, memberFilter\)/);
  assert.match(renderFn, /renderList\(visible\)/);
  assert.match(renderFn, /elements\.count\.textContent = `\(\$\{visible\.length\}\)`/, "건수는 필터된 목록 기준");
  assert.doesNotMatch(renderFn, /summarize\(visible\)/, "요약을 필터된 목록으로 계산하면 합계가 흔들린다");
});

test("요약 카드는 눌림 상태를 알리는 버튼이다", () => {
  assert.match(html, /<button class="member-row"[^>]*aria-pressed="false"/);
  assert.match(fn("render"), /slot\.row\.setAttribute\("aria-pressed", String\(memberFilter === share\.id\)\)/);
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

test("고정비는 반영 표시를 먼저 찍어 두 폰이 같은 달을 두 번 넣지 못하게 한다", () => {
  const apply = fn("applyOccurrence");
  const claimAt = apply.indexOf('from("fixed_cost_applications").insert');
  const insertAt = apply.indexOf("await insertExpense");
  assert.ok(claimAt > -1 && insertAt > claimAt, "지출을 먼저 만들면 상대 폰이 같은 지출을 또 만든다");
  assert.match(apply, /claimError\?\.code === DUPLICATE\) return null/, "이미 반영된 달은 오류가 아니라 건너뛸 일이다");
  assert.match(apply, /catch \(error\)[\s\S]*fixed_cost_applications"\)\s*\.delete\(\)/, "지출을 못 만들었으면 표시도 지워야 그 달을 건너뛰지 않는다");
  assert.match(fn("applyDueFixedCosts"), /applyOccurrences\(due\)/);
});

test("고정비 시트도 다른 시트와 같은 처리를 받는다", () => {
  assert.match(app, /SHEETS = \[[^\]]*elements\.fixedSheet[^\]]*\]/, "고정비 시트가 공통 배선 목록에 있어야 한다");
  assert.match(fn("closeActiveSheet"), /closeFixedSheet\(\)/);
  assert.match(app, /elements\.closeFixedSheet\.addEventListener\("pointerdown"/);
  assert.match(html, /<section class="sheet" id="fixed-sheet"[^>]*aria-modal="true"/);
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

test("프로필 수정 권한은 이름과 색 두 열로만 열려 있다", async () => {
  // 테이블 전체에 update 를 주면 본인 행의 household_id 를 남의 가구로 바꿔치기할 수 있고,
  // 그러면 "같은 가구만 본다"는 RLS 판단 자체가 뚫린다.
  const { readFile } = await import("node:fs/promises");
  for (const file of ["schema.sql", "migration-profile.sql"]) {
    const sql = await readFile(new URL(`../supabase/${file}`, import.meta.url), "utf8");
    assert.match(sql, /grant update \(display_name, avatar_color\) on profiles/, `${file}에 열 단위 권한이 없다`);
    assert.doesNotMatch(sql, /grant update on profiles/, `${file}이 테이블 전체 수정을 열어 준다`);
  }
});

test("아바타 팔레트는 DB가 허용하는 색과 정확히 같다", async () => {
  // 화면에만 색을 추가하면 사용자가 고르는 순간 저장이 거절된다.
  const { readFile } = await import("node:fs/promises");
  const { PALETTE } = await import("../src/members.js");
  const sql = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const allowed = sql.match(/avatar_color in \(([^)]+)\)/)[1].match(/#[0-9a-f]{6}/g);
  assert.deepEqual(PALETTE.map((c) => c.value), allowed);
});

test("초기화는 확인 문구를 그대로 적어야만 실행된다", () => {
  // 되돌릴 수 없고 상대 기록까지 지운다. 오탭 한 번으로 일어나면 안 된다.
  const handler = fn("handleReset");
  assert.match(handler, /!== CONFIRM_WORD\) return/, "문구가 틀리면 즉시 멈춰야 한다");
  assert.match(app, /const CONFIRM_WORD = "초기화"/);
  assert.match(html, /id="reset-submit" disabled/, "처음에는 버튼이 잠겨 있어야 한다");
  assert.match(fn("openSettingsPage"), /님의 기록도 함께 지워집니다/, "상대 기록도 지워진다고 알려야 한다");
});

test("아바타 색은 서버 값에서 오고 막대와 짝을 이룬다", () => {
  const paint = fn("paintMembers");
  assert.match(paint, /slot\.avatar\.style\.background = member\.color/);
  assert.match(paint, /slot\.bar\.style\.background = member\.color/, "막대가 따로 놀면 누구 몫인지 알 수 없다");
  assert.doesNotMatch(css, /#me-bar\s*\{[^}]*background/, "CSS에 색을 박으면 서버 값이 무시된다");
});

test("전체 화면은 시트보다 아래에 깔린다", () => {
  // 설정 화면에서 고정비 시트를 열 수 있어야 한다.
  const pageZ = Number(css.match(/\.page \{[^}]*z-index:\s*(\d+)/)[1]);
  const backdropZ = Number(css.match(/\.sheet-backdrop \{[^}]*z-index:\s*(\d+)/)[1]);
  assert.ok(pageZ < backdropZ, `page(${pageZ})가 시트 배경(${backdropZ})보다 위에 있으면 고정비를 열 수 없다`);
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

test("같은 메시지가 두 번 그려지지 않는다", () => {
  // 내가 보낸 것도 실시간 구독으로 되돌아온다. id로 거르지 않으면 매번 두 줄이 된다.
  const receive = fn("receiveNote");
  assert.match(receive, /messages\.some\(\(current\) => current\.id === note\.id\)/);
  assert.match(receive, /!known/, "이미 아는 메시지면 개수도 다시 세면 안 된다");
});

test("대화를 불러오는 사이 시트가 바뀌면 늦게 온 결과를 버린다", () => {
  // 느린 응답이 뒤늦게 도착해 다른 지출의 대화를 덮어쓰면 안 된다.
  const open = fn("openNotes");
  assert.equal((open.match(/if \(openExpenseId !== expenseId\) return;/g) || []).length, 2,
    "성공·실패 두 경로 모두에서 확인해야 한다");
});

test("대화 입력도 iOS 자동 확대를 막는다", () => {
  const match = css.match(/\.note-form input \{[\s\S]*?font-size:\s*(\d+)px/);
  assert.ok(match, "입력 폰트 규칙을 찾지 못했습니다");
  assert.ok(Number(match[1]) >= 16, `${match[1]}px (16px 미만이면 iOS가 확대함)`);
});

test("대화 시트는 헤더·입력줄이 고정되고 메시지만 스크롤한다", () => {
  assert.match(css, /#notes-sheet \{[^}]*overflow: hidden/, "시트 자체가 스크롤되면 헤더가 함께 밀린다");
  assert.match(css, /\.note-list \{[^}]*overflow-y: auto/);
  assert.match(html, /<div class="note-list sheet-scroll"/, "시트 끌어 닫기가 스크롤 위치를 존중하려면 sheet-scroll 이어야 한다");
});

test("새 지출의 결제자는 로그인한 사람이 기본값이다", () => {
  // 두 번째 사람은 매번 결제자를 바꿔야 했다. 자기가 쓴 걸 적는 게 대부분이다.
  const open = fn("openForm");
  assert.match(open, /expense\?\.member \|\| getProfile\(\)\?\.id/, "수정할 때는 원래 결제자를 유지해야 한다");
  assert.match(open, /input\[name="member"\]\[value="\$\{defaultMember\}"\]/);
  // HTML 의 checked 는 자리 표시일 뿐이다. 실제 선택은 로그인한 사람을 따른다.
  assert.doesNotMatch(open, /if \(expense\) \{[\s\S]*?memberRadio/, "수정할 때만 반영하면 새 기록은 첫 사람으로 남는다");
});
