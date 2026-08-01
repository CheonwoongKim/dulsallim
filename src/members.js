/**
 * 가구 구성원 명부. 로그인 후 서버에서 한 번 읽어 채운다.
 *
 * 지출의 주인은 DB에서 uuid로 관리된다. 화면에 사람 이름을 붙이려면
 * uuid를 이름으로 바꿔 줄 표가 필요한데, 그 표가 여기다.
 * 이름을 코드에 박지 않으므로 DB에서 이름만 고치면 화면도 따라 바뀐다.
 */
let members = [];

/** @param {Array<{id: string, name: string, color: string, goal: number|null}>} list 가입 순서대로 */
export function setMembers(list) {
  members = list;
}

export function getMembers() {
  return members;
}

export function getMemberName(id) {
  return members.find((member) => member.id === id)?.name || "알 수 없음";
}

/** 그 사람의 월 지출 목표. 정하지 않았으면 null. */
export function getMemberGoal(id) {
  return members.find((member) => member.id === id)?.goal ?? null;
}

/** 고를 수 있는 아바타 색. DB의 check 제약과 같은 목록이어야 한다. */
export const PALETTE = [
  { value: "#20211e", label: "먹" },
  { value: "#f2674b", label: "살구" },
  { value: "#8da697", label: "세이지" },
  { value: "#5b7fa6", label: "물빛" },
  { value: "#c2883f", label: "황토" },
  { value: "#8d6a91", label: "자두" },
];
