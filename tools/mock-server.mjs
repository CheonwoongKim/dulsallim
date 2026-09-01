/**
 * 브라우저로 재려고 앱을 띄우는 자리.
 *
 * CLAUDE.md §7 이 "목 서버는 화면과 가짜 API 를 같은 포트에서 낸다" 고 적어 두었는데
 * 정작 그 파일이 저장소에 없었다. 사람마다 제 것을 만들어 쓰다 보니 굽는 주소와 내는
 * 주소가 어긋나 로그인부터 안 되는 일이 반복됐다. 여기에 둔다.
 *
 * 진짜 서버가 아니다 — 제약도 RLS 도 없다. 그건 tests/server-*.test.mjs 가 PGlite 로 본다.
 * 여기는 "화면이 실제 브라우저에서 어떻게 도는가" 만 보려고 둔 것이다.
 *
 *   node tools/mock-server.mjs dist 4180
 */

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const [, , 낼자리 = "dist", 포트 = "4180"] = process.argv;

const 사람 = {
  우리: "bbbbbbbb-0000-0000-0000-000000000001",
  너와: "bbbbbbbb-0000-0000-0000-000000000002",
};
const 집 = "aaaaaaaa-0000-0000-0000-000000000001";

/** 화면을 재기에 넉넉한 만큼. 달을 넘나들 수 있게 지난달 것도 둔다. */
function 밑자료() {
  const 이번달 = new Date().toISOString().slice(0, 7);
  const 날 = (일) => `${이번달}-${String(일).padStart(2, "0")}`;
  return {
    profiles: [
      { id: 사람.우리, household_id: 집, display_name: "우리", avatar_color: "#20211e", monthly_goal: 800000, nag_enabled: true, created_at: "2026-01-01T00:00:00Z" },
      { id: 사람.너와, household_id: 집, display_name: "너와", avatar_color: "#f2674b", monthly_goal: 600000, nag_enabled: true, created_at: "2026-01-02T00:00:00Z" },
    ],
    households: [{ id: 집, name: "우리집" }],
    expenses: [
      { id: "e1", household_id: 집, paid_by: 사람.우리, spent_on: 날(3), category: "food", item: "장보기", amount: 42000, created_at: "2026-01-01T00:00:00Z", fixed_cost_id: null },
      { id: "e2", household_id: 집, paid_by: 사람.너와, spent_on: 날(5), category: "transport", item: "택시", amount: 12800, created_at: "2026-01-02T00:00:00Z", fixed_cost_id: null },
      { id: "e3", household_id: 집, paid_by: 사람.우리, spent_on: 날(12), category: "housing", item: "월세", amount: 700000, created_at: "2026-01-03T00:00:00Z", fixed_cost_id: "f1" },
    ],
    fixed_costs: [
      { id: "f1", household_id: 집, paid_by: 사람.우리, category: "housing", item: "월세", amount: 700000, day_of_month: 12, start_month: "2026-01-01" },
    ],
    fixed_cost_applications: [{ fixed_cost_id: "f1", month: `${이번달}-01`, expense_id: "e3" }],
    expense_notes: [
      { id: "n1", expense_id: "e2", author_id: 사람.우리, body: "이건 뭐야?", created_at: "2026-01-04T00:00:00Z" },
    ],
    wish_items: [
      { id: "w1", household_id: 집, name: "책상 의자", url: null, note: "허리가 아파서", estimated_price: 320000, image_url: null, created_by: 사람.우리, created_at: "2026-01-05T00:00:00Z", state: "proposed", pursuing_at: null, expense_id: null, achieved_on: null, achieved_at: null, is_goal: true },
    ],
    wish_agreements: [{ wish_id: "w1", user_id: 사람.우리, agreed_at: "2026-01-05T00:00:00Z" }],
    nags: [],
    push_subscriptions: [],
  };
}

let 자료 = 밑자료();

const 사용자 = { id: 사람.우리, email: "we@example.com", aud: "authenticated", role: "authenticated" };
const 세션 = () => ({
  access_token: "mock-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "mock-refresh-token",
  user: 사용자,
});

const 형식 = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".ico": "image/x-icon" };

const 보내기 = (res, code, 몸) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(몸));
};

/** PostgREST 의 `열=eq.값` 만 안다. 화면이 쓰는 것이 그것뿐이다. */
function 거르기(줄들, params) {
  return 줄들.filter((줄) =>
    [...params].every(([열, 값]) => {
      if (["select", "order", "limit", "offset", "on_conflict"].includes(열)) return true;
      const [연산, ...나머지] = String(값).split(".");
      const 원하는 = 나머지.join(".");
      if (연산 === "eq") return String(줄[열]) === 원하는;
      if (연산 === "in") return 원하는.replace(/[()]/g, "").split(",").includes(String(줄[열]));
      return true;
    }),
  );
}

const 몸읽기 = (req) => new Promise((풀기) => {
  let 글 = "";
  req.on("data", (조각) => (글 += 조각));
  req.on("end", () => 풀기(글 ? JSON.parse(글) : null));
});

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${포트}`);
  const 길 = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
    return res.end();
  }

  /* ── 인증 ─────────────────────────────────────────────── */
  if (길.startsWith("/auth/v1/token")) {
    const 값 = await 몸읽기(req);
    // 아무 비밀번호나 받지 않는다 — 로그인 실패 화면도 재야 한다.
    if (값?.password && 값.password !== "swordfish") {
      return 보내기(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    }
    return 보내기(res, 200, 세션());
  }
  if (길 === "/auth/v1/user") return 보내기(res, 200, 사용자);
  if (길 === "/auth/v1/logout") { res.writeHead(204); return res.end(); }

  /* ── 검사가 판을 되돌릴 때 ────────────────────────────── */
  if (길 === "/__reset") { 자료 = 밑자료(); return 보내기(res, 200, { ok: true }); }

  /* ── 표 ───────────────────────────────────────────────── */
  if (길.startsWith("/rest/v1/rpc/")) return 보내기(res, 200, []);
  if (길.startsWith("/rest/v1/")) {
    const 표 = 길.slice("/rest/v1/".length);
    const 줄들 = 자료[표] ?? [];
    if (req.method === "GET") return 보내기(res, 200, 거르기(줄들, url.searchParams));
    if (req.method === "POST") {
      const 값 = await 몸읽기(req);
      const 새것 = (Array.isArray(값) ? 값 : [값]).map((줄, i) => ({
        id: `${표}-${Date.now()}-${i}`, created_at: new Date().toISOString(), ...줄,
      }));
      자료[표] = [...줄들, ...새것];
      return 보내기(res, 201, 새것);
    }
    if (req.method === "PATCH") {
      const 값 = await 몸읽기(req);
      const 고칠것 = 거르기(줄들, url.searchParams);
      고칠것.forEach((줄) => Object.assign(줄, 값));
      return 보내기(res, 200, 고칠것);
    }
    if (req.method === "DELETE") {
      const 지울것 = new Set(거르기(줄들, url.searchParams));
      자료[표] = 줄들.filter((줄) => !지울것.has(줄));
      return 보내기(res, 200, [...지울것]);
    }
  }

  /* ── 화면 ─────────────────────────────────────────────── */
  const 이름 = 길 === "/" ? "/index.html" : 길;
  const 자리 = join(process.cwd(), 낼자리, normalize(이름).replace(/^(\.\.[/\\])+/, ""));
  try {
    const 정보 = await stat(자리);
    if (!정보.isFile()) throw new Error("not a file");
    res.writeHead(200, { "content-type": 형식[extname(자리)] ?? "application/octet-stream" });
    return createReadStream(자리).pipe(res);
  } catch {
    // 앱은 한 장짜리다. 모르는 길은 index.html 로 돌린다.
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(await readFile(join(process.cwd(), 낼자리, "index.html")));
  }
}).listen(Number(포트), () => console.log(`목 서버 http://localhost:${포트} — ${낼자리} 를 낸다`));
