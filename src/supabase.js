import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** 설정이 빠졌는지 여부. 빈 화면 대신 이유를 보여주기 위해 던지지 않고 상태로 남긴다. */
export const isConfigured = Boolean(url && key);

export const CONFIG_ERROR =
  ".env.local 에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 넣고 개발 서버를 다시 시작해 주세요.";

export const supabase = isConfigured
  ? createClient(url, key, {
      auth: {
        // 한 번 로그인하면 오래 유지된다. 매번 비밀번호를 넣게 하면 아무도 안 쓴다.
        persistSession: true,
        autoRefreshToken: true,
        // URL 해시로 세션을 주고받는 흐름(OAuth 등)을 쓰지 않는다.
        detectSessionInUrl: false,
      },
    })
  : null;
