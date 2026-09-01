/**
 * 목 서버가 낼 dist 를 굽는다.
 *
 * 굽는 주소와 내는 주소가 어긋나면 로그인부터 안 된다 — CLAUDE.md §7 이 "재는 자리는
 * 하나로 둔다" 고 적어 둔 그 자리다. 손으로 환경변수를 붙이다 어긋나던 것을 여기 묶는다.
 *
 * 키는 .env.local 에서 읽는다. 목 서버는 값을 안 보지만, 없으면 앱이 설정 오류 화면을 띄운다.
 */
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const 읽기 = async () => {
  try {
    return await readFile(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return "";
  }
};
const 글 = await 읽기();
const 값 = (이름) => (글.match(new RegExp(`^${이름}=(.*)$`, "m"))?.[1] ?? "").trim();

const { status } = spawnSync("npx", ["vite", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_SUPABASE_URL: "http://localhost:4180",
    VITE_SUPABASE_ANON_KEY: 값("VITE_SUPABASE_ANON_KEY") || "mock-anon-key",
    VITE_VAPID_PUBLIC_KEY: 값("VITE_VAPID_PUBLIC_KEY") || "",
  },
});
process.exit(status ?? 1);
