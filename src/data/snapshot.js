/**
 * 마지막으로 읽어 온 것을 폰에 적어 둔다. 다음에 열 때 그것부터 그린다.
 *
 * 앱을 열면 서버에서 여섯 가지를 읽어 올 때까지 "기록을 불러오는 중…" 만 보였다.
 * 목 서버에서도 180ms 이고, 실제 서버는 셀룰러에서 그보다 훨씬 길다. 그동안 아무것도
 * 못 본다 — 어제 얼마 썼는지 확인하러 연 사람에게는 그 시간이 전부다.
 *
 * 적어 둔 것을 먼저 그리고, 서버에서 온 것으로 곧 덮는다. 잠깐 옛 숫자가 보일 수 있는데
 * 그 값은 치른다 — 빈 화면보다 낫고, 몇백 ms 뒤면 맞는 숫자로 바뀐다.
 *
 * ── 정해 둔 것
 *
 * 1. **사람마다 따로 적는다.** 열쇠에 userId 가 들어가고, 읽을 때 다시 확인한다.
 *    한 폰을 둘이 쓸 수 있고, 남의 기록이 잠깐이라도 보이면 안 된다.
 * 2. **로그아웃하면 지운다.** 가계부는 폰에 남겨 둘 것이 아니다.
 * 3. **모양이 바뀌면 버린다.** VERSION 을 함께 적어 두고 다르면 안 읽는다 —
 *    옛 모양을 새 화면에 밀어 넣으면 어디서 터질지 모른다.
 * 4. **너무 크면 안 적는다.** localStorage 는 5MB 안팎이고 넘치면 예외가 난다.
 *    적어 두지 못하는 것은 다음에 조금 늦게 뜬다는 뜻일 뿐, 잘못된 일이 아니다.
 */

import { toDisplayColor } from "../members.js";

const KEY = "dulsallim:snapshot";

/** 담는 모양이 바뀌면 올린다. 옛 모양은 조용히 버려진다. */
const VERSION = 1;

/** 적어 둘 최대 크기. 넘으면 안 적는다 — 한 해치 지출이 300KB 안팎이라 넉넉하다. */
const LIMIT = 1_500_000;

/**
 * 적어 둔 것을 꺼낸다. 없거나 남의 것이거나 모양이 다르면 null.
 *
 * 무엇 하나라도 어긋나면 그냥 null 이다. 반쯤 맞는 것을 화면에 올리느니 조금 기다리는 편이
 * 낫다 — 틀린 숫자는 없는 숫자보다 나쁘다.
 */
export function readSnapshot(userId) {
  if (!userId) return null;
  try {
    const 적힌것 = localStorage.getItem(KEY);
    if (!적힌것) return null;

    const 꾸러미 = JSON.parse(적힌것);
    if (꾸러미?.version !== VERSION || 꾸러미.userId !== userId) return null;
    if (!Array.isArray(꾸러미.data?.expenses) || !Array.isArray(꾸러미.data?.members)) return null;

    /*
     * 색만은 서버에서 온 것과 같은 잣대를 댄다.
     *
     * 이 색은 추이 범례에서 style 속성 안에 이스케이프 없이 들어간다. 서버로 들어오는 문은
     * data/remote.js 의 toMember 가 지키는데, 폰에 적어 둔 사본은 그 문을 안 지나고 곧장
     * 화면으로 간다. 여기가 두 번째 문이다.
     *
     * 손을 타려면 이미 같은 출처에서 코드를 돌릴 수 있어야 하니 그 자체로 큰 구멍은
     * 아니다. 다만 문이 둘인데 하나만 지키고 있을 까닭이 없다.
     *
     * 버리지 않고 고쳐 쓴다 — 색 하나가 이상하다고 어제 기록을 통째로 못 보여 줄 일은 아니다.
     */
    return {
      ...꾸러미.data,
      members: 꾸러미.data.members.map((member) => ({
        ...member,
        color: toDisplayColor(member?.color),
      })),
    };
  } catch {
    // 적힌 것이 깨졌거나 저장소를 못 여는 브라우저다. 없는 것으로 친다.
    return null;
  }
}

/** 지금 것을 적어 둔다. 못 적어도 조용히 넘어간다 — 다음에 조금 늦게 뜰 뿐이다. */
export function writeSnapshot(userId, data) {
  if (!userId) return;
  try {
    const 글 = JSON.stringify({ version: VERSION, userId, data });
    if (글.length > LIMIT) {
      // 너무 크면 옛것이라도 남기지 않는다. 반만 맞는 것은 안 적느니만 못하다.
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, 글);
  } catch {
    /* 저장 공간이 찼거나 막혀 있다. 그냥 안 적는다. */
  }
}

/** 로그아웃·초기화에서 부른다. 폰에 가계부를 남기지 않는다. */
export function clearSnapshot() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 못 지워도 다음 읽기에서 userId·version 이 걸러 준다. */
  }
}
