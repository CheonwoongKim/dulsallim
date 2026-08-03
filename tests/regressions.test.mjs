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

test("닫기 버튼은 누른 순간 닫고, 뒤따르는 click은 삼킨다", () => {
  // click은 손을 뗄 때 좌표를 다시 히트테스트한다. 그때 시트는 이미 내려가 있어
  // 그 자리의 다른 것(요약 카드, 목록 행)이 대신 눌린다.
  const helper = fn("closeOnPress");
  assert.match(helper, /addEventListener\("pointerdown"/);
  assert.match(helper, /swallowNextClick = true/, "닫기만 하고 click을 막지 않으면 뒤 요소가 눌린다");
  assert.match(helper, /addEventListener\("click", close\)/, "키보드 사용자는 click만 보낸다");
  assert.match(app, /document\.addEventListener\(\s*"click",[\s\S]{0,220}?stopPropagation\(\)[\s\S]{0,40}?true,/,
    "삼키려면 캡처 단계에서 잡아야 한다");

  // 네 개의 닫기 버튼이 모두 같은 처리를 받아야 한다. 하나만 빠지면 그 시트에서만 재발한다.
  for (const button of ["closeForm", "closeMonthSheet", "closeNotes", "closeFixedSheet"]) {
    assert.match(app, new RegExp(`closeOnPress\\(elements\\.${button},`), `${button}이 공통 처리를 받지 않는다`);
  }
});

test("닫기 버튼 누름은 시트 드래그로 오인되지 않는다", () => {
  assert.match(app, /closest\("\.close-button"\)/, "닫기 버튼 위 누름은 onBegin에서 걸러야 한다");
});

test("키보드가 내려가는 동안 폼은 입력을 받지 않는다", () => {
  assert.match(fn("beginSettle"), /is-settling/);
  // 굳히기는 "폼 밖을 눌러" 포커스가 빠졌을 때만. 폼 안 버튼을 누른 것까지 굳히면
  // 그 버튼의 click 이 사라진다(iOS 는 버튼에 포커스를 주지 않아 relatedTarget 이 빈다).
  assert.match(fn("settleOnFocusLeave"), /lastPress\.target/);
  assert.doesNotMatch(app, /focusout[\s\S]{0,120}?beginSettle\(form\)/,
    "focusout 만 보고 굳히면 안 된다");
  assert.match(fn("beginSettle"), /clearTimeout\(settleTimers\.get\(scroller\)\)/);
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
  const match = css.match(/\.note-form input \{[\s\S]*?font-size:\s*(\d+)px/);
  assert.ok(match, "입력 폰트 규칙을 찾지 못했습니다");
  assert.ok(Number(match[1]) >= 16, `${match[1]}px (16px 미만이면 iOS가 확대함)`);
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
  assert.match(submit, /digits \? Number\(digits\) : null/, "빈 값은 null 이어야 한다");
  assert.match(submit, /goal !== null && goal <= 0/, "0원 목표는 DB도 거절한다");
});

test("요약 카드의 목표는 입력 폼과 같은 규칙을 따른다", () => {
  // 같은 화면에서 규칙이 갈라지면 어느 쪽이 맞는지 알 수 없다.
  const renderFn = fn("render");
  assert.match(renderFn, /getSelectedMonth\(\) === toMonthKey\(new Date\(\)\)/, "이번 달에만 말해야 한다");
  assert.match(renderFn, /summarizeGoal\(\{ monthly, memberId: share\.id, goal: getMemberGoal\(share\.id\) \}\)/);
  assert.match(renderFn, /slot\.goal\.hidden = !goal/, "목표가 없으면 아무것도 보이지 않아야 한다");
  // 요약은 항상 그 달 전체 기준이다. 사람 필터가 걸린 목록으로 계산하면 숫자가 흔들린다.
  assert.doesNotMatch(renderFn, /summarizeGoal\(\{ monthly: visible/);
});

test("요약 카드의 목표 줄은 카드를 밀어내지 않는다", () => {
  // 금액과 나란히 좁은 칸에 들어간다. 줄바꿈되면 두 카드 높이가 어긋난다.
  assert.match(css, /\.member-goal \{[^}]*white-space: nowrap/);
  assert.match(css, /\.member-goal \{[^}]*text-overflow: ellipsis/);
});

test("스크롤 잠금은 몇 겹인지 세어야 한다", () => {
  // 전체 화면 위에 시트를 열 수 있다. 세지 않으면 시트가 닫히며 잠금을 풀어
  // 아직 열려 있는 화면 뒤로 배경이 움직이고 원래 스크롤 위치도 잃는다.
  const lock = fn("lockPageScroll");
  const unlock = fn("unlockPageScroll");
  assert.match(lock, /depth \+= 1/);
  assert.match(lock, /if \(depth > 1\) return/, "이미 잠겼으면 위치를 다시 읽으면 안 된다(그때 scrollY는 0)");
  assert.match(unlock, /depth = Math\.max\(0, depth - 1\)/);
  assert.match(unlock, /if \(depth > 0\) return/, "아직 열린 게 있으면 잠금을 유지해야 한다");
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

test("고정비가 하나도 반영되지 않으면 알린다", () => {
  // 조용히 넘어가면 이번 달 고정비가 통째로 빠진 걸 모른 채 지나간다.
  assert.match(fn("applyOccurrences"), /failed \+= 1/);
  assert.match(fn("startApp"), /applied\.failed > 0[\s\S]{0,160}반영하지 못했어요/);
});

test("보이지 않는 지출의 메시지로는 목록을 다시 그리지 않는다", () => {
  // 괜히 그리면 열어 둔 스와이프가 닫힌다.
  const receive = fn("receiveNote");
  // 모르는 지출이면 세지도 그리지도 않는다. 버리지 않고 맡아 두는 건 아래 별도 검사에서 본다.
  assert.match(receive, /expense\.id === note\.expenseId\)\) \{[\s\S]{0,140}?return;\n\s*\}/,
    "우리 가구 지출이 아니면 개수도 건드리면 안 된다");
  assert.match(receive, /elements\.list\.querySelector\([\s\S]{0,80}\) render\(\)/);
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

test("분류 목록은 화면·마크업·DB 세 곳이 정확히 같다", async () => {
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

  // 지출 폼과 고정비 폼 두 곳 모두
  const selects = [...html.matchAll(/<select[^>]*name="category"[^>]*>([\s\S]*?)<\/select>/g)];
  assert.equal(selects.length, 2, "분류 선택 상자는 지출 폼과 고정비 폼 두 곳이다");
  for (const [, body] of selects) {
    const options = [...body.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)];
    assert.deepEqual(options.map((o) => o[1]), keys, "선택지 값이 CATEGORIES와 다르다");
    assert.deepEqual(options.map((o) => o[2]), keys.map((k) => CATEGORIES[k].label), "선택지 이름이 다르다");
  }
});

test("기타는 언제나 마지막이다", () => {
  // 목록에서 '기타'가 중간에 끼면 고를 때 눈이 한 번 더 멈춘다.
  for (const [, body] of html.matchAll(/<select[^>]*name="category"[^>]*>([\s\S]*?)<\/select>/g)) {
    const keys = [...body.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(keys[keys.length - 1], "etc");
  }
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
  assert.match(renderFn, /labels\.join\(" · "\)/, "둘 다 걸리면 이어 붙여 보여야 한다");
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
  // 목록은 첫 행 안쪽 여백 덕에 41px 아래에서 글자가 시작한다.
  // 캘린더는 요일 줄이 곧바로 붙어 그만큼을 margin 으로 벌어 준다. 빠지면 답답해 보인다.
  // 인접 margin 은 큰 쪽으로 합쳐지므로 이 값이 그대로 최종 간격이 된다.
  const top = Number(css.match(/\.calendar \{[^}]*margin-top:\s*(\d+)px/)[1]);
  assert.ok(top >= 38 && top <= 44, `margin-top ${top}px — 목록의 41px 과 어긋난다`);
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
  const 분석 = css.match(/\.analysis-bar \{[^}]*?height:\s*(\d+)px/);
  const 본화면 = css.match(/\.ratio-bar \{[^}]*?height:\s*(\d+)px/);
  assert.ok(분석 && 본화면, "두 막대의 height 규칙을 찾지 못했다");
  assert.equal(분석[1], 본화면[1], `분석 ${분석[1]}px vs 본 화면 ${본화면[1]}px`);
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
  assert.match(html, /<section class="sheet" id="nag-sheet"[^>]*aria-modal="true"/);
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
  assert.match(css, /\.sheet-scroll \{[\s\S]*?gap:\s*\d+px/);
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
  assert.match(app, /await reloadExpenses\(\);[\s\S]{0,200}?flushPendingNotes\(\);[\s\S]{0,80}?render\(\);/);
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
  assert.match(html, /<section class="sheet" id="trend-sheet"[^>]*aria-modal="true"/);
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
  assert.match(css, /\.overview-head \.month-control \{[^}]*margin-bottom/, "본 화면에서만 띄운다");
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

test("굳히기 타이머는 폼마다 따로 둔다", () => {
  // 타이머를 하나로 쓰면 두 폼이 잇달아 굳을 때 뒤엣것이 앞엣것의 해제를 취소한다.
  // 그러면 앞 폼은 pointer-events: none 인 채로 영영 남아 입력 자체가 안 된다.
  // (브라우저에서 재현했다 — 900ms 뒤에도 지출 폼이 굳어 있었다)
  assert.match(app, /const settleTimers = new WeakMap\(\)/);
  assert.match(fn("beginSettle"), /settleTimers\.get\(scroller\)/);
  assert.match(fn("beginSettle"), /settleTimers\.set\(\s*scroller/);
});

test("닫기 버튼을 누를 때는 폼을 굳히지 않는다", () => {
  // 굳히기는 "다음 탭이 엉뚱한 입력에 떨어지는 것"을 막으려는 것이다.
  // 시트가 통째로 사라지는 중이면 잘못 눌릴 입력 자체가 없다.
  assert.match(fn("settleOnFocusLeave"), /close-button/);
});

test("시트를 열 때 굳은 상태를 풀고 시작한다", () => {
  // 어떤 경로로든 굳은 채 남았다면, 다시 열었을 때만큼은 멀쩡해야 한다.
  assert.match(fn("showSheet"), /is-settling/);
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

test("숨기는 시점은 닫히는 애니메이션보다 늦다", async () => {
  // 애니메이션이 420ms 인데 320ms 에 hidden 을 걸면 남은 100ms 가 잘려 툭 사라진다.
  // CLOSE_MS 는 시트와 페이지에 하나씩 있어 파일을 직접 짝지어 읽는다.
  const { readFile } = await import("node:fs/promises");
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

  for (const [js, cssFile, rule] of [
    ["src/ui/sheet.js", "src/styles/sheet.css", "\\.sheet"],
    ["src/ui/page.js", "src/styles/page.css", "\\.page"],
  ]) {
    const 닫힘 = Number((await read(js)).match(/const CLOSE_MS = (\d+)/)[1]);
    const 전환 = Number(
      (await read(cssFile)).match(new RegExp(`\n${rule} \\{[\\s\\S]*?transform (\\d+)ms`))[1],
    );
    assert.ok(닫힘 >= 전환, `${js}: 숨김 ${닫힘}ms 가 전환 ${전환}ms 보다 빠르다`);
  }
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

/* ── 스크롤하면 머리를 접는다 ─────────────────────────────────── */

test("접는 지점과 펴는 지점이 다르다", () => {
  // 같으면 경계에서 폈다 접었다를 반복한다. 접히면 문서가 짧아지므로 더 잘 터진다.
  const 접기 = Number(app.match(/const CONDENSE_AT = (\d+)/)[1]);
  const 펴기 = Number(app.match(/const EXPAND_AT = (\d+)/)[1]);
  assert.ok(펴기 < 접기, `펴는 지점 ${펴기} 이 접는 지점 ${접기} 보다 낮아야 한다`);
});

test("목록 길이와 상관없이 내리면 접는다", () => {
  // 전에는 "접고도 스크롤 여유가 남을 때만" 접었는데, 그러면 목록이 짧은 달에는
  // 아예 접히지 않았다. 짧은 목록일수록 접으면 다 보이므로, 정작 쓸모 있는 경우를 막은 셈이다.
  assert.match(fn("onScroll"), /!condensed && y > CONDENSE_AT\) setCondensed\(true\)/);
});

test("되감긴 것을 사용자가 올린 것으로 읽지 않는다", () => {
  // 접히면 문서가 짧아져 브라우저가 스크롤을 되감는다. 그걸 "위로 올렸다"로 읽으면
  // 곧바로 도로 펴진다 — 접었다 펴지는 튕김이다. 막을 곳은 접는 쪽이 아니라 펴는 쪽이다.
  //
  // 스크롤할 수 있는 거리가 펴는 지점에도 못 미치면 밀려난 것이지 올린 것이 아니다.
  assert.match(fn("userIsAtTop"), /maxScroll >= EXPAND_AT && window\.scrollY < EXPAND_AT/);
  assert.match(fn("onScroll"), /condensed && userIsAtTop\(\)\) setCondensed\(false\)/);
  // 목록이 바뀔 때도 같은 잣대를 쓴다.
  assert.match(fn("recheckCondense"), /userIsAtTop\(\)/);
});

test("접어도 달 이동은 남긴다", () => {
  // 월 라벨은 달 선택 시트를 여는 버튼이기도 하다. 감추면 달을 바꾸려고 스크롤을 도로 올려야 한다.
  assert.doesNotMatch(css, /\.is-condensed[^{]*\.month-control \{[^}]*display: none/);
  assert.match(css, /\.is-condensed \.eyebrow \{[^}]*height: 0/, "설명 문구는 접을 때 없어도 된다");
});

test("머리 높이는 접히는 동안에도 따라 잰다", () => {
  // 클래스를 바꾼 직후 한 번만 재면 애니메이션 도중의 값을 잡아,
  // 지출 내역 제목이 머리보다 아래에 붙어 빈 띠가 생긴다(실제로 194px 을 쟀다).
  assert.match(app, /new ResizeObserver\(\(\) => \{\s*syncHeaderHeight\(\);\s*syncStuck\(\);\s*\}\)\.observe\(elements\.appHeader\)/);
  assert.match(css, /\.section-heading \{[^}]*top: var\(--header-h/);
});

test("스크롤 감시는 화면을 붙잡지 않는다", () => {
  assert.match(fn("watchScroll"), /"scroll", onScroll, \{ passive: true \}/);
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

test("접히는 높이는 글자 크기가 아니라 px 이 끌고 간다", () => {
  // font-size 를 애니메이션하면 글자 상자 높이가 폰트 지표 단위로 끊긴다.
  // 프레임은 멀쩡한데 높이가 2px 갔다 13px 가는 식이라 "단계별로 끊어지는" 느낌이 된다.
  // 상자에 명시적 height 를 주면 px→px 라 선형으로 흐른다. (측정: 가장 큰 걸음 13px → 6px)
  assert.match(css, /\n\.total-amount \{[^}]*\n  height: \d+px;/, "min-height 면 글자 지표를 따라간다");
  assert.match(css, /\.is-condensed \.total-amount \{[^}]*height: \d+px/);
  assert.match(css, /\n\.eyebrow \{[^}]*\n  height: \d+px;/);
  // 한 프레임에 사라지면 그 높이만큼 툭 끊긴다.
  assert.doesNotMatch(css, /\.is-condensed \.eyebrow \{[^}]*display: none/);
});

test("접힌 줄에서 달 이름은 두 줄로 깨지지 않는다", () => {
  // 총액과 한 줄에 서면 폭이 좁아진다. 실제로 "2026년 8 / 월" 로 깨졌다.
  assert.match(css, /\.is-condensed \.month-label \{[^}]*white-space: nowrap/);
});

test("시트가 열려 있는 동안에는 머리를 건드리지 않는다", () => {
  // 시트를 열면 본 화면 스크롤이 잠겨 scrollY 가 0 이 된다. 그걸 "맨 위"로 읽으면
  // 달 선택 시트를 여는 순간 뒤에서 머리가 펴진다 — 닫고 돌아오면 화면이 커져 있다.
  assert.match(fn("onScroll"), /if \(isPageScrollLocked\(\)\) return/);
  assert.match(app, /export function isPageScrollLocked/);
});

test("붙어 있는 제목 아래로 목록이 비치지 않는다", () => {
  // margin 은 투명하다. 아래 여백을 margin 으로 주면 그 틈으로 지나가는 줄이 보인다.
  // 그리고 목록 한 줄(72px)이 이 머리(44px)보다 커서 아랫부분이 늘 삐져나오므로,
  // 붙어 있는 동안에는 선을 그어 "여기 아래는 지나가는 목록"임을 알린다.
  const 규칙 = css.match(/\n\.section-heading \{[^}]*\}/)[0];
  assert.match(규칙, /background: var\(--paper\)/);
  assert.doesNotMatch(규칙, /margin-bottom/, "여백은 padding 으로 줘야 배경이 덮는다");
  // 딱 자르면 반쯤 잘린 글자가 남는다. 배경색으로 녹여 보낸다.
  // 조건은 "접혔나"가 아니라 "붙었나"다 — 접힘은 72px 부터인데 제목이 붙는 건 180px 쯤부터라,
  // 그 사이에는 지나가는 줄이 없는데도 첫 줄 위 20px 이 흐려져 까닭 없이 잘려 보였다.
  assert.match(css, /\.is-stuck \.section-heading::after \{[^}]*linear-gradient\(var\(--paper\), transparent\)/);
  assert.doesNotMatch(css, /\.is-condensed \.section-heading::after/);
  assert.match(fn("syncStuck"), /getBoundingClientRect\(\)\.top - headerHeight/);
  assert.match(fn("onScroll"), /syncStuck\(\)/);
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
  const renderFn = fn("render");
  const 필터 = renderFn.indexOf("ledgerFilter.hidden");
  const 다시그리기 = renderFn.indexOf("repaintLedgerTitle()");
  assert.ok(다시그리기 > 필터, "건수와 필터를 모두 적은 뒤에 봐야 한다");
});

test("키보드가 오르내리는 순간에는 시트 안 입력을 막는다", () => {
  // 키보드가 뜨면 시트가 그만큼 밀린다. 그 순간 노린 곳과 눌리는 곳이 어긋나,
  // 닫기 버튼을 보고 눌렀는데 327px 아래의 분류 select 가 그 자리에 올라와 대신 눌렸다
  // (아이폰 키보드 높이가 291~336px 이라 거리가 거의 같다).
  //
  // focusout 으로는 이 순간을 잡을 수 없다 — 키보드가 뜰 때 포커스는 폼 안에 그대로 있어
  // 아무 신호도 나지 않는다. 화면 크기 변화가 유일하게 정확한 신호다.
  assert.match(app, /visualViewport\?\.addEventListener\("resize"/);
  assert.match(app, /getOpenSheet\(\)\?\.querySelector\("\.sheet-scroll"\)[\s\S]{0,80}beginSettle/);
});
