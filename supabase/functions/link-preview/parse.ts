/*
 * 주소를 보고 판단하는 부분만 따로 둔다.
 *
 * index.ts 는 Deno 위에서만 돌아 시험할 수 없다. 여기 있는 것은 오가는 것이 없는
 * 순수한 판단뿐이라 node 가 그대로 불러 시험한다 — 가장 틀리기 쉬운 자리가 여기다.
 */

/**
 * 안쪽 망으로 가는 주소를 걸러 낸다.
 *
 * 이름으로 오는 것(localhost, *.internal)과 숫자로 오는 것(10.·192.168.·169.254.)을
 * 모두 본다. 169.254.169.254 는 클라우드가 제 열쇠를 내주는 자리라 특히 막는다.
 */
export function 갈수있나(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const 집 = url.hostname.toLowerCase();
  // 대괄호가 있으면 IPv6 리터럴이다. 그 안쪽 규칙은 이름에 대면 안 된다.
  const 여섯 = 집.startsWith("[") && 집.endsWith("]") ? 집.slice(1, -1) : null;
  if (여섯 !== null) return IPv6가안쪽인가(여섯) ? false : true;

  if (집 === "localhost" || 집.endsWith(".localhost")) return false;
  if (집.endsWith(".local") || 집.endsWith(".internal") || 집.endsWith(".home.arpa")) return false;

  return !넷토막이안쪽인가(집);
}

/**
 * IPv6 리터럴이 안쪽 망인가.
 *
 * fc00::/7·fe80::/10 을 이름에 대고 보던 때가 있었다. 그러면 fc2.com·fdn.fr·fe80shop.com
 * 처럼 멀쩡한 곳이 막힌다 — 실제로 셋 다 막혀 있었다. 대괄호 안일 때만 본다.
 *
 * IPv4 를 감싼 꼴(::ffff:169.254.169.254)도 본다. 이것을 안 보던 때는 클라우드가 제 열쇠를
 * 내주는 자리가 그대로 열렸다. WHATWG URL 이 그 꼴을 16진수로 바꿔 두므로(::ffff:a9fe:a9fe)
 * 점 넷짜리만 찾아서는 못 잡는다.
 */
function IPv6가안쪽인가(여섯: string): boolean {
  if (여섯 === "::1" || 여섯 === "::") return true;
  if (/^f[cd]/.test(여섯)) return true;                    // fc00::/7 (고유 로컬)
  if (/^fe[89ab]/.test(여섯)) return true;                 // fe80::/10 (링크 로컬)

  /*
   * IPv4 를 감싼 것을 도로 펴서 같은 잣대를 댄다. ::ffff:a9fe:a9fe 처럼 16진수 두 토막으로
   * 오기도 하고 ::ffff:169.254.169.254 처럼 그대로 오기도 한다.
   */
  const 점넷 = 여섯.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (점넷) return 넷토막이안쪽인가(점넷[1]);

  const 열여섯 = 여섯.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (열여섯) {
    const 위 = parseInt(열여섯[1], 16);
    const 아래 = parseInt(열여섯[2], 16);
    return 넷토막이안쪽인가(`${위 >> 8}.${위 & 255}.${아래 >> 8}.${아래 & 255}`);
  }
  return false;
}

/** 점 넷짜리 주소가 안쪽 망인가. */
function 넷토막이안쪽인가(집: string): boolean {
  const 넷토막 = 집.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!넷토막) return false;
  const [a, b] = [Number(넷토막[1]), Number(넷토막[2])];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;                 // 클라우드가 제 열쇠를 내주는 자리
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return a >= 224;
}

/**
 * 대표 그림을 찾는다. 순서가 곧 우선순위다.
 *
 * 속성 차례는 사이트마다 다르다 — `property` 가 앞에 오기도 하고 `content` 가 앞에 오기도 한다.
 * 그래서 meta 태그를 통째로 집은 다음 그 안에서 둘을 따로 찾는다.
 */
export function 그림찾기(문서: string, 기준: URL): string | null {
  const 찾을것 = ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src"];
  const 태그들 = 문서.match(/<meta\b[^>]*>/gi) ?? [];

  for (const 이름 of 찾을것) {
    for (const 태그 of 태그들) {
      const 무엇 = 태그.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (무엇 !== 이름) continue;
      const 값 = 태그.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
      const 주소 = 값 && 쓸수있는주소(값, 기준);
      if (주소) return 주소;
    }
  }

  // og 를 안 쓰는 옛 사이트가 쓰던 것. 마지막으로 본다.
  const 옛것 = 문서.match(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/i)?.[0];
  const 옛주소 = 옛것?.match(/href\s*=\s*["']([^"']*)["']/i)?.[1];
  return (옛주소 && 쓸수있는주소(옛주소, 기준)) || null;
}

/** 상대 주소를 절대 주소로 펴고, 화면에 걸 수 있는 것만 남긴다. */
export function 쓸수있는주소(값: string, 기준: URL): string | null {
  // 빈 값은 기준 주소로 펴진다 — 그러면 그 페이지 자체가 그림 행세를 한다.
  const 다듬은것 = 값.trim();
  if (!다듬은것) return null;

  try {
    const 주소 = new URL(다듬은것, 기준);
    return 주소.protocol === "http:" || 주소.protocol === "https:" ? 주소.href : null;
  } catch {
    return null;
  }
}
