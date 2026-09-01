# 둘살림

**둘이 사는 집을 위한 모바일 가계부.**
두 사람이 각자 자기 지출을 적고, 하나의 장부를 함께 봅니다.

Vite + Supabase 로 만든 PWA 입니다. 실제로 쓰려고 만든 개인 프로젝트이고, 소스를 공개해 둡니다.

## 어떤 앱인가

둘이 가계부를 쓰면 보통 한 사람이 총무가 됩니다. 상대의 지출까지 받아 적다 보면 밀리고,
얼마 못 가 멈춥니다. 둘살림은 그 옮겨 적는 과정 자체를 없앴습니다 — 각자 자기 것만 적으면
하나의 장부가 채워집니다.

- **각자 적고, 곧바로 공유됩니다** — 한쪽이 기록하면 상대 화면에 실시간으로 반영됩니다
- **대화가 지출에 붙어 있습니다** — "이건 뭐야?" 를 메신저가 아니라 그 기록 안에서 주고받습니다
- **아끼는 이유가 함께 있습니다** — 위시리스트에서 고른 *지금 목표*가 같은 앱 안에 놓입니다

### 이렇게 씁니다

1. 지출이 생기면 각자 자기 폰에서 적습니다 — 날짜 · 분류 · 항목 · 금액
2. 홈 화면에서 이번 달 **함께 쓴 금액**과 사람별 몫을 확인합니다
3. 궁금한 지출에는 그 자리에서 **대화**를 남기고, 상대가 거기에 답합니다
4. 월 지출 목표를 넘긴 지출에는 상대가 미리 심어 둔 **소비 잔소리**가 자동으로 붙습니다
5. 위시리스트에 담아 둔 것을 사면 **이뤘어요** 로 그날 지출과 이어 붙입니다

## 기능

### 기록

- 날짜 · 분류 · 항목 · 금액 입력과 수정, 스와이프로 삭제 · 복제, 삭제 되돌리기
- 매달 반복되는 **고정비**는 등록해 두면 반영일에 자동으로 지출이 생성됩니다

### 보기

- 월 이동, 월별 총액, 사람별 합계와 비중
- 목록 / 캘린더 전환. 캘린더에서 날짜를 누르면 그날 기록만
- 요약 카드를 누르면 사람별로, `지출 내역(n) ▼` 를 누르면 분류별로 거릅니다.
  걸린 조건은 목록 제목에 표시되고 눌러서 해제합니다
- **분석** — 분류별 지출, 지난달 · 전년 동월 대비, 분류별 증감 막대
- **한 해 추이** — 열두 달 꺾은선과 각자의 월 지출 목표선. 달을 짚으면 그 달 금액

### 함께 쓰기

- **지출별 대화** — 기록 하나하나에 메모를 주고받습니다. 실시간으로 반영됩니다
- **소비 잔소리** — 상대가 월 지출 목표의 몇 %를 넘길 때 보여 줄 문구를 미리 등록해 두면,
  그 구간을 넘긴 지출에 자동으로 붙습니다. 문구는 등록한 사람에게만 보입니다
- **위시리스트** — 갖고 싶은 것을 담아 둡니다. 사람 이름 탭으로 나뉘어 서로 무엇을 바라는지
  보이고, 각자 그중 하나를 **지금 목표**로 지정합니다. 상대의 위시에 "나도" 를 누르면
  *함께 바라는 것*이 되고, 구매하면 **이뤘어요** 로 그날 지출과 연결됩니다.
  링크를 넣으면 대표 이미지를 가져와 보여 줍니다

### 그 밖에

- 이메일 · 비밀번호 로그인 (이메일 기억하기). 같은 가구에 연결된 계정만 데이터를 볼 수 있습니다
- **마이페이지** — 표시 이름, 아바타 색상, 월 지출 목표
- **설정** — 고정비 · 소비 잔소리 관리, 데이터 초기화
- **푸시 알림** — 상대가 기록하거나, 목표를 넘기거나, 달이 끝날 때.
  iOS 는 홈 화면에 추가한 앱에서만 받을 수 있습니다 (16.4+)
- 홈 화면에 설치하는 **PWA**. 두 번째 실행부터는 마지막으로 본 데이터를 먼저 그린 뒤
  서버에서 받은 것으로 갱신하므로, 네트워크가 느려도 빈 화면을 보지 않습니다

## 기술 구성

| 영역 | 사용 |
|---|---|
| 프론트엔드 | Vite 7, 바닐라 JavaScript (ES 모듈, 프레임워크 없음) |
| 스타일 | 순수 CSS + 디자인 토큰 (`src/styles/base.css`) |
| 데이터 | Supabase — Postgres, Row Level Security, PostgREST |
| 실시간 | Supabase Realtime (`postgres_changes`) |
| 서버 로직 | Postgres 함수 13개 (`security definer` RPC) |
| Edge Function | `send-push` (웹 푸시 발송), `link-preview` (위시 링크 대표 이미지) |
| 테스트 | `node:test`, Playwright (WebKit) |
| 배포 | Vercel |

프레임워크를 쓰지 않았습니다. 상태를 바꾸고 다시 그리는 단순한 흐름이고, 접근 통제와
쓰기 규칙은 대부분 Postgres 함수와 RLS 정책 안에 있어 클라이언트가 우회할 수 없습니다.

## 준비

### 1. Supabase

Supabase 프로젝트를 만든 뒤, SQL Editor 에서 이 세 개를 순서대로 실행합니다.

| 순서 | 파일 | 용도 |
|---|---|---|
| 1 | `supabase/schema.sql` | 테이블 · RLS · 권한 · 서버 함수 전부 |
| 2 | `supabase/seed.sql` | 가구 생성과 계정 연결 (파일 안의 이메일을 실제 값으로 바꿔서 실행) |
| 3 | `supabase/verify.sql` | 설정 점검. 전 항목이 OK 여야 합니다 |

대시보드에서 **가입은 반드시 꺼 두세요**
(Project Settings → Authentication → User Signups → Allow new users to sign up).
켜져 있으면 누구나 계정을 만들 수 있습니다.

`supabase/migrations/` 는 **이미 쓰고 있는 프로젝트를 따라잡게 하는 파일**입니다.
새 프로젝트에는 실행하지 마세요 — `schema.sql` 에 이미 다 들어 있고,
`20260101000001_profile.sql` 은 그 시점의 권한만 열어 두므로 나중 것을 도로 닫아 버립니다.

<details>
<summary>운영 중인 프로젝트를 최신으로 올릴 때 — 마이그레이션 20개</summary>

아직 실행하지 않은 것만 순서대로 실행하고 `verify.sql` 로 확인합니다.

| 순서 | 파일 | 무엇이 추가되나 |
|---|---|---|
| 1 | `supabase/migrations/20260101000001_profile.sql` | 아바타 색상 |
| 2 | `supabase/migrations/20260101000002_goal.sql` | 월 지출 목표 |
| 3 | `supabase/migrations/20260101000003_categories.sql` | 반려견 · 의료 분류 |
| 4 | `supabase/migrations/20260101000004_nag.sql` | 소비 잔소리 |
| 5 | `supabase/migrations/20260101000005_hardening.sql` | 대화 작성자 검사, 초기화 · 고정비 반영 트랜잭션 |
| 6 | `supabase/migrations/20260101000006_fixed_sync.sql` | 고정비 변경을 상대 기기에도 즉시 반영 |
| 7 | `supabase/migrations/20260101000007_avatar_custom_color.sql` | 아바타 색상 직접 선택 |
| 8 | `supabase/migrations/20260101000008_push.sql` | 알림 수신 대상 저장 |
| 9 | `supabase/migrations/20260101000009_push_triggers.sql` | 알림 발송 시점 (위 2단계 준비가 먼저 필요) |
| 10 | `supabase/migrations/20260101000010_wish.sql` | 위시 · 합의 · 향하는 것 · 이룸 기록 |
| 11 | `supabase/migrations/20260101000011_wish_image.sql` | 위시에 링크 대표 이미지 |
| 12 | `supabase/migrations/20260101000012_wish_note.sql` | 위시에 한 줄 메모 |
| 13 | `supabase/migrations/20260101000013_wish_edit.sql` | 담아 둔 위시 수정 |
| 14 | `supabase/migrations/20260101000014_wish_multi.sql` | 함께 바라는 것을 여럿 두기 |
| 15 | `supabase/migrations/20260806230000_wish_achieve_alone.sql` | 혼자 바라는 것도 이룸 처리 |
| 16 | `supabase/migrations/20260807000000_wish_order.sql` | 위시 우선순위 · 사람별 목록 |
| 17 | `supabase/migrations/20260807010000_wish_agree_fix.sql` | 16번이 깨뜨린 "나도" 복구 (16번을 실행했다면 필수) |
| 18 | `supabase/migrations/20260807020000_wish_body_restore.sql` | 16번이 누락한 분기 복구 (16번을 실행했다면 필수) |
| 19 | `supabase/migrations/20260807030000_wish_goal.sql` | 순서 이동 대신 "지금 목표" 지정 |
| 20 | `supabase/migrations/20260901000000_reset_household_definer.sql` | 데이터 초기화가 막혀 있던 것을 푼다 (위시를 들인 뒤로 계속 막혀 있었다) |

</details>

### 2. 푸시 알림 (선택)

1. **VAPID 키 한 쌍**을 만듭니다. 공개키는 앱이, 비밀키는 서버가 씁니다.

   ```bash
   npx web-push generate-vapid-keys
   ```

2. 공개키를 `.env.local` 에 넣습니다 (`VITE_VAPID_PUBLIC_KEY=...`).
   Vercel 환경 변수에도 같은 값을 넣어야 배포본에서 동작합니다.

3. Edge Function 을 배포하고 비밀값을 등록합니다.

   ```bash
   supabase functions deploy send-push
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:주소
   ```

4. `20260101000008_push.sql` 을 실행한 뒤, `20260101000009_push_triggers.sql` 안에 주석으로
   비워 둔 두 줄(함수 주소와 service_role 키)을 채워서 실행합니다.
   **service_role 키는 저장소에 적지 마세요.** DB 안에만 두고 앱에서는 읽을 수 없습니다.

### 3. 환경 변수

`.env.local` 에 넣습니다. 이 파일은 커밋되지 않습니다 (`.env.local.example` 참고).

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

publishable key 는 브라우저에 공개되는 값이며, 실제 접근 통제는 DB 의 RLS 가 합니다.
`secret` key 는 RLS 를 우회하므로 **프론트엔드에 절대 넣지 마세요.**

## 실행

```bash
npm install
npm run dev          # 개발 서버
npm test             # 검사 전체
npm run build        # 프로덕션 빌드
npm run preview      # 빌드 결과 확인 (같은 네트워크의 폰에서도 접속 가능)
```

## 구조

```
src/
  domain/      날짜 · 금액 · 집계 · 추이 계산 (DOM 도 서버도 모르는 순수 함수)
  data/        Supabase 질의, DB↔화면 이름 번역, 로컬 스냅샷
  store.js     화면이 읽는 사본 + 서버 쓰기
  features/    화면 단위 동작 (로그인, 입력, 고정비, 위시, 분석, 마이페이지, 설정)
  ui/          시트 · 전체화면 · 스와이프 등 재사용 부품
  wiring/      버튼과 동작을 연결하는 자리
  styles/      디자인 토큰과 화면별 CSS
supabase/
  schema.sql   전체 스키마 (새 프로젝트는 이것만)
  migrations/  운영 중인 프로젝트용 증분
  functions/   Edge Function
```

`domain/` 은 브라우저 없이 돌아갑니다 — 계산이 맞는지는 화면을 띄우지 않고 검증합니다.

읽기는 메모리 사본에서 즉시 꺼내고(동기), 쓰기만 서버에 다녀옵니다(비동기).
서버가 성공을 확인한 뒤에야 사본을 갱신하므로, 화면에 보이는 것은 항상 서버에 실제로 있는 것입니다.

## 화면을 고치기 전에

간격 · 글자 크기 · 색 · 모서리 값은 전부 `src/styles/base.css` 의 토큰으로 정해져 있고,
숫자를 직접 적으면 테스트가 막습니다. 어떤 값을 왜 그렇게 정했는지는
**[DESIGN.md](DESIGN.md)** 에 있습니다.

## 배포

Vercel 에 연결하면 `main` 푸시 시 자동 배포됩니다.
Vercel 프로젝트 환경 변수에도 위 두 값을 등록해야 합니다.

## 라이선스

개인적으로 쓰려고 만든 프로젝트라 별도 라이선스를 두지 않았습니다 (모든 권리 유보).
읽고 참고하시는 것은 자유롭게, 다만 이슈와 PR 을 받고 있지는 않습니다.
