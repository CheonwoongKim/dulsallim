import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

/*
 * 마이그레이션에만 있고 schema.sql 에 없는 것이 있으면 안 된다.
 *
 * schema.sql 은 "새 프로젝트가 한 번에 갖는 마지막 모습" 이라고 README 가 말한다.
 * 표 하나가 마이그레이션에만 있어도 새로 만든 집에는 그 표가 없고, 그것을 쓰는 화면이
 * 조용히 안 된다 — 실제로 push_subscriptions 가 그랬다. 알림 켜기가 새 프로젝트에서
 * 말없이 안 됐고, 아무 검사도 그것을 안 봤다.
 *
 * 왜 글자로 보나. 두 길을 진짜로 밟아 견주려면 schema.sql 을 깐 위에 마이그레이션을
 * 얹어야 하는데, 그 길은 막혀 있다 — 옛 마이그레이션이 지금과 반환 모양이 다른 함수를
 * 다시 만들려 해서 Postgres 가 거절한다. README 가 "새 프로젝트에는 마이그레이션을
 * 실행하지 마세요" 라고 적어 둔 것이 그 뜻이다. 그래서 세운 것을 견주는 대신
 * 세우겠다고 적은 것을 견준다.
 *
 * 반대 방향은 안 본다. schema.sql 에만 있는 것은 있어도 된다.
 */

const 스키마 = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const 마이그레이션들 = await Promise.all(
  (await readdir(new URL("../supabase/migrations", import.meta.url)))
    .filter((이름) => 이름.endsWith(".sql"))
    .sort()
    .map(async (이름) => [이름, await readFile(new URL(`../supabase/migrations/${이름}`, import.meta.url), "utf8")]),
);

/** 주석을 걷는다. 주석 속 예시를 선언으로 세면 헛돈다. */
const 알맹이 = (글) => 글.replace(/--[^\n]*/g, "");

const 이름들 = (글, 규칙) => [...알맹이(글).matchAll(규칙)].map((m) => m[1]);

const 갈래 = {
  표: /create table (?:if not exists )?([a-z_][a-z0-9_]*)/gi,
  정책: /create policy ("[^"]+"|[a-z_][a-z0-9_]*)/gi,
  함수: /create (?:or replace )?function ([a-z_][a-z0-9_]*)/gi,
  색인: /create (?:unique )?index (?:if not exists )?([a-z_][a-z0-9_]*)/gi,
};

/**
 * 여기 있는 것만 schema.sql 에 없어도 된다. 까닭을 함께 적는다 —
 * 적을 까닭이 없으면 그것은 예외가 아니라 빠뜨린 것이다.
 */
const 까닭있는예외 = {
  // 알림 발송은 운영자가 비밀값 둘(함수 주소·service_role 키)을 손으로 채워야 도는 단계다.
  // 그 값을 저장소에 적을 수 없으니 schema.sql 에 못 넣는다. README §2 가 따로 안내한다.
  app_secrets: "알림 발송 준비 — README §2 의 선택 단계",
  notify_push: "알림 발송 준비 — README §2 의 선택 단계",
  on_expense_inserted: "알림 발송 준비 — README §2 의 선택 단계",
  on_nag_fired: "알림 발송 준비 — README §2 의 선택 단계",
  send_month_summary: "알림 발송 준비 — README §2 의 선택 단계",

  // 위시 줄 세우기. 20260807030000_wish_goal.sql 이 "지금 목표" 로 갈아 끼우며 지웠다.
  move_wish: "20260807030000 이 지웠다",
  wish_items_order_idx: "20260807030000 이 지웠다",
};

test("예외로 둔 것은 정말 그 까닭이 있다", async () => {
  // 지웠다고 적은 것은 정말 지우는 줄이 있어야 한다. 적당히 예외에 넣고 넘어가지 못하게.
  const 지움 = await readFile(new URL("../supabase/migrations/20260807030000_wish_goal.sql", import.meta.url), "utf8");
  assert.match(지움, /drop index if exists wish_items_order_idx/);
  assert.match(지움, /drop function if exists move_wish/);

  // 선택 단계라고 적은 것은 README 가 그렇게 안내하고 있어야 한다.
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /20260101000009_push_triggers\.sql[\s\S]{0,120}비워 둔 두 줄/);
});

test("마이그레이션이 세우는 것은 schema.sql 에도 다 있다", () => {
  const 빠진것 = [];
  for (const [무엇, 규칙] of Object.entries(갈래)) {
    const 스키마것 = new Set(이름들(스키마, 규칙).map((이름) => 이름.replaceAll('"', "")));
    for (const [파일, 글] of 마이그레이션들) {
      for (const 이름 of new Set(이름들(글, 규칙).map((n) => n.replaceAll('"', "")))) {
        if (!스키마것.has(이름) && !(이름 in 까닭있는예외)) {
          빠진것.push(`${무엇} ${이름} — ${파일} 에만 있다`);
        }
      }
    }
  }
  assert.deepEqual(빠진것, [], "새 프로젝트가 schema.sql 만 실행하면 이것이 없다");
});

/* ── 칼럼 ───────────────────────────────────────────────────
 *
 * 이름만 견주던 때는 칼럼이 통째로 사각지대였다. `alter table ... add column` 줄을
 * 지워도, smallint 를 integer 로 바꿔도, 칼럼 이름에 오타를 내도 검사 전체가 통과했다.
 * CLAUDE.md §6.5 는 "검사가 schema.sql 의 몸통과 마이그레이션의 몸통이 글자까지 같은지
 * 본다" 고 적어 두었는데, 칼럼에는 그 문이 없었다.
 *
 * 사람들이 이 마이그레이션을 운영 DB 에 올린다. 마이그레이션이 세우는 칼럼과 schema.sql 이
 * 세우는 칼럼이 어긋나면, 운영 DB 와 새로 깐 DB 가 서로 다른 모양이 되고 그 차이는
 * 아무 데서도 안 보인다.
 */

/** `alter table T add column [if not exists] <정의>;` — 줄바꿈을 건너뛴다(goal.sql 이 그렇다). */
const 더하는칼럼 = /alter\s+table\s+([a-z_][a-z0-9_]*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([^;]+);/gi;

const 한칸으로 = (글) => 글.replace(/\s+/g, " ").trim().toLowerCase();

/** 괄호 짝을 세어 `check (...)` 를 통째로 뜯는다. 안에 괄호가 또 있어 정규식만으로는 못 자른다. */
function 검사조각들(정의) {
  const 조각 = [];
  for (let i = 정의.toLowerCase().indexOf("check ("); i > -1; i = 정의.toLowerCase().indexOf("check (", i + 1)) {
    let 깊이 = 0;
    for (let j = 정의.indexOf("(", i); j < 정의.length; j += 1) {
      if (정의[j] === "(") 깊이 += 1;
      else if (정의[j] === ")") { 깊이 -= 1; if (깊이 === 0) { 조각.push(한칸으로(정의.slice(i, j + 1))); break; } }
    }
  }
  return 조각;
}

/** schema.sql 의 `create table T (...)` 를 칼럼 이름 → 정의로 푼다. 표 수준 제약은 건너뛴다. */
function 스키마칼럼들(글) {
  const 표들 = {};
  for (const m of 글.matchAll(/create table (?:if not exists )?([a-z_][a-z0-9_]*)\s*\(/gi)) {
    let 깊이 = 0, 끝 = -1;
    for (let i = m.index + m[0].length - 1; i < 글.length; i += 1) {
      if (글[i] === "(") 깊이 += 1;
      else if (글[i] === ")") { 깊이 -= 1; if (깊이 === 0) { 끝 = i; break; } }
    }
    const 몸통 = 알맹이(글.slice(m.index + m[0].length, 끝));

    // 깊이 0 의 쉼표에서만 쪼갠다. check(...) 안의 쉼표에서 자르면 정의가 두 동강 난다.
    const 조각들 = [];
    let 깊이2 = 0, 시작 = 0;
    for (let i = 0; i < 몸통.length; i += 1) {
      if (몸통[i] === "(") 깊이2 += 1;
      else if (몸통[i] === ")") 깊이2 -= 1;
      else if (몸통[i] === "," && 깊이2 === 0) { 조각들.push(몸통.slice(시작, i)); 시작 = i + 1; }
    }
    조각들.push(몸통.slice(시작));

    표들[m[1]] = {};
    for (const 조각 of 조각들) {
      const 정리 = 조각.trim();
      if (!정리 || /^(constraint|primary key|unique|check|foreign key|exclude)\b/i.test(정리)) continue;
      표들[m[1]][정리.split(/\s+/)[0]] = 정리;
    }
  }
  return 표들;
}

const 스키마표들 = 스키마칼럼들(스키마);

/** 지워진 칼럼은 schema.sql 에 없는 것이 맞다. 무엇이 지웠는지 적는다. */
const 지워진칼럼 = {
  "wish_items.sort_order": "20260807030000_wish_goal.sql 이 drop column 했다",
};

test("마이그레이션이 세우는 칼럼은 schema.sql 의 것과 같다", () => {
  const 어긋난것 = [];
  let 견준수 = 0;

  for (const [파일, 글] of 마이그레이션들) {
    for (const [, 표, 정의원본] of 알맹이(글).matchAll(더하는칼럼)) {
      const 정의 = 정의원본.trim();
      const 이름 = 정의.split(/\s+/)[0];
      if (`${표}.${이름}` in 지워진칼럼) continue;

      const 스키마정의 = 스키마표들[표]?.[이름];
      if (!스키마정의) {
        어긋난것.push(`${파일}: ${표}.${이름} 이 schema.sql 에 없다`);
        continue;
      }
      견준수 += 1;

      const 마이그 = 한칸으로(정의), 스키마것 = 한칸으로(스키마정의);
      const 형 = (글) => 글.split(" ")[1];
      if (형(마이그) !== 형(스키마것)) {
        어긋난것.push(`${파일}: ${표}.${이름} 의 형이 다르다 — 마이그 ${형(마이그)} · schema ${형(스키마것)}`);
      }
      if (마이그.includes(" not null") && !스키마것.includes(" not null")) {
        어긋난것.push(`${파일}: ${표}.${이름} — 마이그만 not null 이다`);
      }
      const 기본값 = /\bdefault\s+('[^']*'|[^\s,]+)/.exec(마이그);
      if (기본값 && !스키마것.includes(기본값[0])) {
        어긋난것.push(`${파일}: ${표}.${이름} 의 ${기본값[0]} 이 schema.sql 에 없다`);
      }
      for (const 검사 of 검사조각들(정의)) {
        if (!스키마것.includes(검사)) 어긋난것.push(`${파일}: ${표}.${이름} 의 ${검사} 가 schema.sql 에 없다`);
      }
    }
  }

  assert.deepEqual(어긋난것, [], "운영 DB 와 새로 깐 DB 의 칼럼이 서로 달라진다");
  // 정규식이 아무것도 못 잡아도 위 단언은 통과한다. 헛돌고 있지 않은지 본다.
  assert.ok(견준수 >= 6, `견준 칼럼이 ${견준수}개뿐이다 — 정규식이 헛돌고 있다`);
});

test("마이그레이션 파일에는 실행할 것이 들어 있다", () => {
  /*
   * 주석만 남은 파일은 README 가 안내하는 그 단계를 아무것도 안 한다. 올린 사람은 올렸다고
   * 믿고, 화면은 없는 칼럼을 고르며 400 을 받는다. 실제로 이 PR 의 alter 줄을 통째로 지워도
   * 검사 570건이 전부 통과했다.
   */
  const 빈것 = 마이그레이션들.filter(([, 글]) => !알맹이(글).includes(";")).map(([파일]) => 파일);
  assert.deepEqual(빈것, [], "주석뿐이라 실행되는 것이 없다");
});

test("견줄 것이 실제로 있다", () => {
  // 위 검사는 정규식이 아무것도 못 찾아도 통과한다. 헛돌고 있지 않은지 본다.
  assert.ok(이름들(스키마, 갈래.표).length >= 11, "schema.sql 에서 표를 못 찾았다");
  assert.ok(이름들(스키마, 갈래.함수).length >= 13, "schema.sql 에서 함수를 못 찾았다");
  assert.ok(마이그레이션들.length >= 20, `마이그레이션이 ${마이그레이션들.length}개뿐이다`);
  const 마이그것 = 마이그레이션들.flatMap(([, 글]) => 이름들(글, 갈래.표));
  assert.ok(마이그것.length >= 3, "마이그레이션에서 표를 못 찾았다");
});
