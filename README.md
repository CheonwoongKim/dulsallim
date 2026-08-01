# 둘살림

부부가 함께 지출을 기록하고 월별 합계를 확인하는 모바일 우선 가계부입니다.
한쪽에서 기록하면 상대 화면에도 바로 반영됩니다.

## 기능

- 이메일·비밀번호 로그인. 가구에 연결된 계정만 데이터를 볼 수 있습니다
- 날짜·분류·항목·금액 입력, 수정, 스와이프 삭제, 되돌리기
- 월 이동과 월별 총액, 사람별 합계·비중
- 사람별 필터 (요약 카드를 누르면 그 사람 기록만)
- 매월 반복되는 고정비 등록. 반영일이 지나면 자동으로 지출이 생깁니다
- 마이페이지에서 표시 이름과 아바타 색상 변경
- 설정에서 데이터 초기화
- 홈 화면에 설치할 수 있는 PWA

## 준비

### 1. Supabase

프로젝트를 만든 뒤 SQL Editor 에서 순서대로 실행합니다.

| 파일 | 용도 |
|---|---|
| `supabase/schema.sql` | 테이블·RLS·권한 (새 프로젝트) |
| `supabase/seed.sql` | 가구 생성과 계정 연결 |
| `supabase/migration-profile.sql` | 아바타 색상과 프로필 수정 권한 |
| `supabase/verify.sql` | 설정 점검. 전 항목이 OK 여야 합니다 |

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

## 배포

Vercel 에 연결되어 있습니다. `main` 에 푸시하면 자동 배포됩니다.
Vercel 프로젝트 환경 변수에도 위 두 값이 등록되어 있어야 합니다.
