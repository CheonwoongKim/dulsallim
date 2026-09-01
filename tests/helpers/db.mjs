import { readFile } from "node:fs/promises";
import { after } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * schema.sql 을 진짜 Postgres 에 올려 놓고 찔러 보는 자리.
 *
 * 여태 서버 쪽은 아무 그물도 없었다. schema.sql 을 글자로 읽어 정규식으로 보는 검사는
 * 있었지만, 그것은 "이렇게 적혀 있다" 를 볼 뿐 "이렇게 막힌다" 를 못 본다.
 * CLAUDE.md §6.5 가 적어 둔 그대로다 — "목 서버에는 제약도 RLS 도 없다.
 * 브라우저에서 되는 것을 봤다는 말은 서버가 맞다는 뜻이 아니다."
 *
 * PGlite 는 Postgres 를 그대로 WASM 으로 컴파일한 것이라 제약도 RLS 도 진짜로 돈다.
 * Docker 도 서버도 필요 없어 npm test 안에서 그냥 돈다.
 *
 * Supabase 가 미리 만들어 두는 것(auth 스키마·역할·publication)은 여기서 세워 준다.
 * auth.uid() 는 Supabase 와 같은 방식으로 세션 설정값을 읽는다.
 */

const 밑자리 = `
  create role anon;
  create role authenticated;
  create role service_role;

  create schema auth;
  -- Supabase 가 관리하는 표. 여기서는 참조만 하므로 열쇠만 있으면 된다.
  create table auth.users (id uuid primary key);

  /*
   * 지금 누구로 부르고 있나. Supabase 와 같이 요청에 실린 값을 읽는다.
   * 아무도 아니면 null 이고, 그때 정책들이 전부 막는다.
   */
  create function auth.uid() returns uuid language sql stable as $fn$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $fn$;

  -- 실시간 구독이 붙는 자리. schema.sql 이 여기에 표를 얹는다.
  create publication supabase_realtime;
`;

/** 가구 하나와 그 안의 두 사람. 검사마다 새로 세운다. */
export const 가구 = {
  집: "aaaaaaaa-0000-0000-0000-000000000001",
  남의집: "aaaaaaaa-0000-0000-0000-000000000002",
  우리: "bbbbbbbb-0000-0000-0000-000000000001",
  너와: "bbbbbbbb-0000-0000-0000-000000000002",
  남: "bbbbbbbb-0000-0000-0000-000000000003",
};

/*
 * 판은 파일마다 하나만 세운다.
 *
 * 검사마다 새로 세우면 스키마를 매번 올려 한 건에 900ms 가 든다 — 스물여섯 건이면
 * 24초다. npm test 는 늘 도는 문이라(CLAUDE.md §7) 그만큼 느려지면 사람이 안 돌린다.
 * 한 판을 두고 검사마다 트랜잭션을 열었다 되돌리면 서로 안 섞이면서 1초 안에 끝난다.
 *
 * node --test 는 한 파일 안의 검사를 차례로 돌리므로 판 하나를 나눠 써도 엉키지 않는다.
 */
let 바탕 = null;

async function 바탕판() {
  if (바탕) return 바탕;
  바탕 = new PGlite();
  await 바탕.exec(밑자리);
  await 바탕.exec(await readFile(new URL("../../supabase/schema.sql", import.meta.url), "utf8"));
  return 바탕;
}

/*
 * 다 끝나면 닫는다.
 *
 * 안 닫으면 열어 둔 트랜잭션을 든 채로 십 초를 더 붙들고 있다 — 검사는 1초에 끝나는데
 * 프로세스가 11초에 끝났다. 거는 자리는 여기, 모듈을 읽는 그때여야 한다.
 * 검사가 도는 중에 걸면 node:test 가 이미 이 파일의 뒤처리를 정해 둔 뒤라 안 잡힌다.
 */
after(async () => {
  if (!바탕) return;
  const 판 = 바탕;
  바탕 = null;
  await 판.exec("rollback;").catch(() => {});
  await 판.close();
});

/**
 * 이 검사만의 깨끗한 판. 앞 검사가 남긴 것은 되돌려져 있다.
 * @returns {Promise<object>} 아래 손잡이가 달린 PGlite
 */
export async function 판세우기({ 사람들 = true } = {}) {
  const db = await 바탕판();
  // 앞 검사가 열어 둔 것을 접는다. 없으면 조용히 넘어간다.
  await db.exec("rollback;").catch(() => {});
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); begin;");

  /** 이 사람으로서 부른다. 역할까지 바꿔야 RLS 가 실제로 걸린다. */
  db.로서 = async (userId) => {
    await db.exec("reset role;");
    await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false);`);
    await db.exec("set role authenticated;");
  };

  /** 서버 몫으로 돌아온다. 검사가 판을 차릴 때 쓴다. */
  db.주인으로 = async () => {
    await db.exec("reset role;");
    await db.exec("select set_config('request.jwt.claim.sub', '', false);");
  };

  /**
   * 그 문장이 막히나. 막히면 이유를 돌려주고, 안 막히면 null.
   *
   * 세이브포인트로 감싼다. 트랜잭션 안에서 한 번 터지면 그 뒤가 통째로 막히는데,
   * 여기서는 일부러 터뜨리는 것이 일이라 감싸지 않으면 한 검사에서 한 번밖에 못 묻는다.
   */
  db.막히나 = async (sql, 값 = []) => {
    await db.exec("savepoint 시험;");
    try {
      await db.query(sql, 값);
      await db.exec("release savepoint 시험;");
      return null;
    } catch (error) {
      await db.exec("rollback to savepoint 시험;");
      return error.message;
    }
  };

  if (사람들) {
    await db.exec(`
      insert into auth.users (id) values
        ('${가구.우리}'), ('${가구.너와}'), ('${가구.남}');
      insert into households (id, name) values
        ('${가구.집}', '우리집'), ('${가구.남의집}', '남의집');
      insert into profiles (id, household_id, display_name, avatar_color) values
        ('${가구.우리}', '${가구.집}', '우리', '#20211e'),
        ('${가구.너와}', '${가구.집}', '너와', '#f2674b'),
        ('${가구.남}', '${가구.남의집}', '남', '#8da697');
    `);
  }
  return db;
}
