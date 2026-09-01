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

test("견줄 것이 실제로 있다", () => {
  // 위 검사는 정규식이 아무것도 못 찾아도 통과한다. 헛돌고 있지 않은지 본다.
  assert.ok(이름들(스키마, 갈래.표).length >= 11, "schema.sql 에서 표를 못 찾았다");
  assert.ok(이름들(스키마, 갈래.함수).length >= 13, "schema.sql 에서 함수를 못 찾았다");
  assert.ok(마이그레이션들.length >= 20, `마이그레이션이 ${마이그레이션들.length}개뿐이다`);
  const 마이그것 = 마이그레이션들.flatMap(([, 글]) => 이름들(글, 갈래.표));
  assert.ok(마이그것.length >= 3, "마이그레이션에서 표를 못 찾았다");
});
