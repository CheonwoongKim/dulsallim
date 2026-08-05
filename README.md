# 둘살림

부부가 함께 지출을 기록하고 월별 합계를 확인하는 모바일 우선 가계부입니다.
한쪽에서 기록하면 상대 화면에도 바로 반영됩니다.

## 기능

### 기록

- 날짜·분류·항목·금액 입력과 수정, 스와이프로 삭제·복제, 삭제 되돌리기
- 매월 반복되는 고정비 등록. 반영일이 지나면 자동으로 지출이 생깁니다

### 보기

- 월 이동과 월별 총액, 사람별 합계·비중
- 목록 / 캘린더 전환. 캘린더에서 날짜를 누르면 그날 기록만
- 사람별 필터 (요약 카드를 누르면 그 사람 기록만)
- 분류별 필터 (지출 내역 옆 필터 버튼). 걸린 조건은 목록 제목에 뜨고, 눌러서 풉니다
- **분석** — 분류별 지출, 지난달·전년 동월과 비교, 분류별 증감 막대
- **한 해 추이** — 열두 달 꺾은선과 각자의 월 지출 목표선. 달을 짚으면 그 달 금액

### 함께 쓰기

- **지출별 대화** — 기록 하나하나에 말을 남길 수 있습니다
- **소비 잔소리** — 상대가 월 지출 목표의 몇 %를 넘길 때 남길 말을 미리 심어 두면,
  그 구간을 넘긴 지출에 자동으로 붙습니다. 문구는 심어 둔 사람만 볼 수 있습니다

### 그 밖에

- 이메일·비밀번호 로그인 (이메일 기억하기). 가구에 연결된 계정만 데이터를 볼 수 있습니다
- 마이페이지에서 표시 이름, 기본·직접 선택 아바타 색상, 월 지출 목표 변경
- 설정에서 고정비·소비 잔소리 관리와 데이터 초기화
- **알림** — 상대가 기록하거나, 목표를 넘기거나, 달이 끝나면 알려 줍니다.
  설정에서 켜고 끕니다. iOS는 홈 화면에 추가한 앱에서만 알림이 옵니다(16.4+)
- 홈 화면에 설치할 수 있는 PWA

## 준비

### 1. Supabase

**새 프로젝트라면** SQL Editor 에서 이 세 개만 순서대로 실행합니다.

| 순서 | 파일 | 용도 |
|---|---|---|
| 1 | `supabase/schema.sql` | 테이블·RLS·권한·서버 함수 전부 |
| 2 | `supabase/seed.sql` | 가구 생성과 계정 연결 |
| 3 | `supabase/verify.sql` | 설정 점검. 전 항목이 OK 여야 합니다 |

`migration-*.sql` 은 **이미 쓰고 있는 프로젝트를 따라잡게 하는 파일**입니다.
새 프로젝트에는 실행하지 마세요 — `schema.sql` 에 이미 다 들어 있고,
`migration-profile.sql` 은 그 시점의 권한만 열어 두므로 나중 것을 도로 닫아 버립니다.

이미 쓰고 있는 프로젝트라면 아직 안 돌린 것만 순서대로 실행하고 `verify.sql` 로 확인합니다.

| 순서 | 파일 | 언제 추가됐나 |
|---|---|---|
| 1 | `supabase/migration-profile.sql` | 아바타 색상 |
| 2 | `supabase/migration-goal.sql` | 월 지출 목표 |
| 3 | `supabase/migration-categories.sql` | 반려견·의료 분류 |
| 4 | `supabase/migration-nag.sql` | 소비 잔소리 |
| 5 | `supabase/migration-hardening.sql` | 대화 작성자 검사, 초기화·고정비 반영 트랜잭션 |
| 6 | `supabase/migration-fixed-sync.sql` | 고정비 변경을 상대 기기에도 바로 반영 |
| 7 | `supabase/migration-avatar-custom-color.sql` | 아바타 색상 직접 선택 |
| 8 | `supabase/migration-push.sql` | 알림 받을 곳 저장 |
| 9 | `supabase/migration-push-triggers.sql` | 알림 보내는 시점 (아래 준비가 먼저 필요) |

### 알림을 쓰려면

1. **VAPID 키 한 쌍**을 만듭니다. 공개키는 앱이, 비밀키는 서버가 씁니다.

   ```bash
   npx web-push generate-vapid-keys
   ```

2. 공개키를 `.env.local` 에 넣습니다 (`VITE_VAPID_PUBLIC_KEY=...`).
   Vercel 환경 변수에도 같은 값을 넣어야 배포본에서 동작합니다.

3. `supabase/functions/send-push` 를 배포하고 비밀값을 넣습니다.

   ```bash
   supabase functions deploy send-push
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:주소
   ```

4. `migration-push.sql` 을 실행한 뒤, `migration-push-triggers.sql` 안의 주석 처리된
   두 줄(함수 주소와 service_role 키)을 채워서 실행합니다.
   **service_role 키는 저장소에 적지 마세요.** DB 안에만 두고 앱에서는 읽을 수 없습니다.

대시보드에서 **가입은 반드시 꺼 두세요**
(Project Settings → Authentication → User Signups → Allow new users to sign up).
켜져 있으면 누구나 계정을 만들 수 있습니다.

### 2. 환경 변수

`.env.local` 에 넣습니다. 이 파일은 커밋되지 않습니다.

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
npm test             # 테스트
npm run build        # 프로덕션 빌드
npm run preview      # 빌드 결과 확인 (같은 네트워크의 폰에서도 접속 가능)
```

## 구조

```
src/
  data/        Supabase 질의와 DB↔화면 이름 번역
  features/    화면 단위 동작 (로그인, 입력 폼, 고정비, 마이페이지, 설정)
  ui/          시트·전체화면·스와이프 등 재사용 부품
  store.js     화면이 읽는 사본 + 서버 쓰기
  expenses.js  날짜·금액·집계 (DOM 없는 순수 로직)
```

읽기는 메모리 사본에서 즉시 꺼내고(동기), 쓰기만 서버에 다녀옵니다(비동기).
서버가 성공을 확인한 뒤에야 사본을 고치므로 화면에 보이는 것은 항상 서버에 실제로 있는 것입니다.

## 화면을 고치기 전에

간격·글자 크기·색·모서리 같은 값은 전부 `src/styles/base.css` 의 토큰으로 정해져 있고,
숫자를 직접 적으면 검사가 막습니다. 왜 그런 계단인지와 예외로 둔 자리는
**[DESIGN.md](DESIGN.md)** 에 있습니다. 새 화면을 만들기 전에 한 번 읽어 주세요.

## 배포

Vercel 에 연결되어 있습니다. `main` 에 푸시하면 자동 배포됩니다.
Vercel 프로젝트 환경 변수에도 위 두 값이 등록되어 있어야 합니다.
