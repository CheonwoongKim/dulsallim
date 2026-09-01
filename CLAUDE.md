# 둘살림 작업 방식

디자인 값을 만지는 일이면 [DESIGN.md](DESIGN.md) 를 먼저 읽는다.

---

## 무엇을 어디서 하나

**일의 크기로 정한다. 작은 일에 절차를 씌우지 않는다.**

| | 어디서 | 누가 |
|---|---|---|
| 값 몇 개 바꾸기, 원인을 이미 잰 한 줄 고치기, 주석·문서 손보기 | 본 체크아웃에서 브랜치 하나 파고 | 내가 직접 |
| 여러 갈래를 동시에, 조사가 필요한 것, 같은 일을 여럿에게 겨루게 할 때 | Orca 워크트리 | 에이전트 |
| 손대는 곳이 넓거나 되돌리기 어려운 것 | Orca 워크트리 | 에이전트 + PR 리뷰 |

**왜 갈랐나.** 워크트리를 만드는 값은 몇 초지만, 그것이 강제하는 에이전트 한 바퀴가
**8~14분**이다. 총액 숫자 셋을 바꾸는 일에도 그 값을 치렀다. 값을 못 한다.

**작게 해도 지키는 것** — 검사와 빌드는 늘 돌리고(§7), 화면을 만졌으면 재서 확인하고,
커밋은 브랜치에 쌓아 `main` 에 바로 올리지 않는다.

## 워크트리를 쓸 때

Orca 는 에이전트를 **전권 모드로 띄운다** — Claude 는 `--dangerously-skip-permissions`,
Codex 는 `--dangerously-bypass-approvals-and-sandbox`, Gemini 는 `--yolo`.
**워크트리 자체가 울타리라는 전제**다. 그래서 에이전트에게 맡길 때는 워크트리가
진짜로 갈라져 있어야 한다 (§0 의 `kind` 확인).

```
할 일 쪼개기 → 갈래마다 워크트리 + 에이전트 (동시에) → 각자 PR
   → 팀 리더가 PR 을 리뷰 → 고칠 것 있으면 그 워크트리로 되돌려 보냄
   → 통과하면 merge → 워크트리 삭제 (디렉터리와 브랜치가 함께 사라진다)
```

**한 갈래 = 한 워크트리 = 한 브랜치 = 한 PR.**

**넘기기 전에 원인을 확정한다.** 짐작을 지시문에 적으면 에이전트가 그것을 쫓는다 —
실제로 두 번 틀린 짐작을 넘겨 두 바퀴를 헛돌렸다. 재서 확정한 것만 근거로 준다.

---

## 0. 띄우기 전에

### 저장소가 `kind: git` 이어야 한다

```bash
ORCA_REPO=id:105d351a-547d-4dd4-9683-402fcbf532a0   # 가계부
orca repo show --repo $ORCA_REPO --json             # result.repo.kind 가 "git"
```

`folder` 면 **브랜치가 갈리지 않고 본 체크아웃에서 그대로 돈다.** 워크트리를 만든 것처럼
보이지만 `git worktree list` 에 아무것도 안 생기고, 전권 모드 에이전트가 main 을 직접 고친다.
이 저장소가 실제로 그 상태였고 한 번 그렇게 돌았다.

고치는 법 — `orca repo add` 를 다시 해도 안 된다(새 id 가 잠깐 생겼다 사라진다):

```bash
orca project setup-update --setup 105d351a-547d-4dd4-9683-402fcbf532a0 --kind git --json
```

### 먼저 push 한다

워크트리는 저장소의 **기준 ref(`origin/main`)** 에서 갈라진다. push 안 한 커밋은
새 워크트리에 **없다.** 갈래를 펴기 전에 main 을 올린다.

```bash
orca repo set-base-ref --repo $ORCA_REPO --ref origin/main --json   # 한 번만
git push origin main
```

---

## 1. 워크트리 만들기

```bash
orca worktree create \
  --repo $ORCA_REPO \
  --name <갈래-이름> \
  --no-parent \
  --agent <codex|claude> \
  --prompt "<지시문>" \
  --json
```

- 워크트리는 `~/orca/workspaces/가계부/<이름>`, 브랜치는 `CheonwoongKim/<이름>` 으로 생긴다.
- `result.startupTerminal.handle` 이 그 에이전트의 터미널 손잡이다. 받아 둔다.
- `--no-parent` 를 붙인다. 워크트리 안에서 만들면 Orca 가 자식으로 엮는데, 독립된 갈래는
  엮이지 않는 편이 정리가 쉽다.
- `--setup run|skip|inherit` 로 저장소 설정 훅을 켜고 끈다. 기본은 저장소 정책을 따른다.
- **만들기는 뒤에서 돈다.** 명령은 바로 돌아오고 `git fetch`/`git worktree add` 는 이어진다.
  바로 다음 갈래를 띄우면 된다.

### gitignore 된 것은 따로 챙겼다

새 워크트리는 깨끗한 체크아웃이라 `node_modules` 도 `.env.local` 도 없다.
그대로면 `npm test` 도 `vite build` 도 안 돈다. 저장소에 두 파일을 넣어 뒀다.

| 파일 | 하는 일 |
|---|---|
| `orca.yaml` → `worktree.sharedDirectories` | `node_modules` 를 본 체크아웃에서 **연결**해 온다 (47M, 다시 만들 수 있는 것) |
| `.worktreeinclude` | `.env.local` 을 워크트리마다 **복사**한다 (각자 제 사본을 갖는다) |

새 워크트리에서 검사가 그대로 다 도는 것을 확인했다 (건수를 여기 적어 두면 늘 뒤처진다). 여기에 뭔가 더 필요해지면
그 두 파일에 적는다 — 워크트리에서 손으로 만들면 다음 워크트리에서 또 없다.

---

## 2. 에이전트 고르기

| 에이전트 | 부르는 법 | 맡기는 일 |
|---|---|---|
| **codex** | `--agent codex` | 코드 리뷰, 회귀 찾기, 테스트. 근거를 파일:줄로 대는 일 |
| **claude** | `--agent claude` | 구현, 리팩토링, 문서. 맥락을 오래 들고 가야 하는 일 |
| **gemini** | `--agent gemini` | 조사·비교·최신 정보. 웹 검색이 붙어 있고 컨텍스트가 크다 |

**gemini 가 꺼져 있으면** `Selected agent is disabled` 가 뜬다.
Orca 의 **Settings → Agents** 에서 켜면 된다. 켜기 전에는 아래 우회로를 쓴다.

```bash
orca worktree create --repo $ORCA_REPO --name <이름> --no-parent --json
orca terminal create --worktree id:<위에서 받은 워크트리 id> \
  --command 'agy --dangerously-skip-permissions -p "<지시문>"' --json
```

`agy` 는 `--agent` 이름으로는 안 통한다(`Unknown TUI agent "agy"`). 터미널 명령으로만 띄운다.
한 번 묻고 끝낼 일이면 `-p`, 주고받을 일이면 `-i`.

**어느 쪽이든 읽을 것을 짚어 준다.** agy 로 "이 저장소가 무엇을 하는 앱인가" 만 물었더니
저장소가 아니라 제 도구 이야기를 답했다. 어떤 파일을 읽고 무엇을 견주라고 지시문에 적는다.

---

## 3. 지켜보기

```bash
orca worktree ps --json                                    # 갈래 전체 한눈에
orca terminal read --terminal <handle> --limit 4000 --json
orca terminal send --terminal <handle> --text "<지시>" --enter --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 900000 --json
```

**`tui-idle` 하나만 믿지 않는다.** 에이전트가 생각하는 사이의 짧은 정적에도 걸린다 —
실제로 리뷰 중간에 `satisfied: true` 가 나왔는데 codex 는 계속 돌고 있었다.
출력이 여러 번 연속으로 같을 때까지 보거나, 마지막 답이 실제로 나왔는지 눈으로 확인한다.

출력이 길면 커서로 나눠 읽는다 — 한 번 읽고 `nextCursor` 를 받아 `--cursor` 로 이어 읽는다.

**보내기 전에 읽는다.** 무엇을 기다리는지 모르는 채로 보내면 엉뚱한 데 들어간다.

진행 상황은 워크트리 딱지에 남긴다. 사람이 Orca 화면에서 바로 본다.

```bash
orca worktree set --worktree <선택자> --comment "테스트까지 통과, PR 올림" --json
```

### 선택자

`active`/`current` 는 지금 셸이 있는 워크트리다. **스크립트에서는 쓰지 않는다** —
그 셸이 대상 워크트리 밖일 수 있다. 대신 `id:<repoId>::<절대경로>`, `path:<절대경로>`,
`branch:<이름>` 을 쓴다.

---

## 4. PR 올리고 리뷰하기

```bash
cd ~/orca/workspaces/가계부/<이름>
npm test && npx vite build          # 올리기 전에 반드시
git push -u origin CheonwoongKim/<이름>
gh pr create --base main --title "<제목>" --body "<무엇을 왜, 무엇으로 확인했는지>"
```

**PR 은 팀 리더(나)가 직접 리뷰한다.** 에이전트가 "다 됐다"고 한 것을 그대로 믿지 않는다.

- `gh pr diff <번호>` 로 실제 변경을 본다
- **그 워크트리에서 `npm test` 를 다시 돌린다** — 에이전트가 돌렸다는 말은 증거가 아니다
- 화면을 건드렸으면 픽셀 전후를 비교한다 (DESIGN.md §12)
- 고칠 것이 있으면 `orca terminal send` 로 그 워크트리에 되돌려 보낸다. 내가 대신 고치지 않는다

통과하면 merge 하고 정리한다. **워크트리를 지우면 브랜치도 함께 사라진다.**

```bash
gh pr merge <번호> --squash --delete-branch
orca worktree rm --worktree <선택자> --force --json
```

merge 는 곧 배포다 — `main` 에 들어가면 Vercel 이 자동으로 올린다.

### 올릴 곳이 둘이다

`origin` 하나에 push 주소를 둘 달아 뒀다. `git push` 한 번이면 두 곳에 다 간다.

| | 어디 | 무엇을 하나 |
|---|---|---|
| GitHub | `github.com/CheonwoongKim/dulsallim` | PR·리뷰·merge, 그리고 Vercel 배포가 여기를 본다 |
| Gitea | 개인 서버 (주소는 `git remote -v` 로 확인) | 사본을 받아 두는 자리 |

PR 흐름은 **GitHub 에만** 있다. Gitea 는 같은 커밋을 받아 두는 자리다.

**merge 뒤에 두 가지를 더 한다.** `gh pr merge` 는 GitHub **서버에서** 커밋을 만든다.
내 손을 안 거치므로 Gitea 는 그대로 뒤처진다 — 실제로 두 커밋을 놓쳤다.

```bash
git checkout main && git pull        # GitHub 이 만든 merge 커밋을 받아 오고
git push origin main                 # 두 곳에 올린다 (GitHub 은 이미 최신이라 그냥 넘어간다)
git push gitea --delete <가지 이름>   # gh 는 GitHub 가지만 지운다
```

---

## 5. 갈래 쪼개는 법

**파일이 겹치지 않게 쪼갠다.** 겹치면 나중에 합치느라 시간을 다 쓴다.
쪼개기 전에 갈래마다 어느 파일을 건드릴지 적어 본다.

| 갈래 | 주로 만지는 곳 |
|---|---|
| 화면 하나 | 그 화면의 `src/styles/*.css` + `src/features/*` |
| 데이터·서버 | `src/data/`, `supabase/` |
| 검사 | `tests/` |
| 문서 | `README.md`, `DESIGN.md` |

**공용 부품은 한 갈래에만 준다.** `layout.css`, `base.css`, `src/ui/` 는 여러 화면이
함께 쓴다. 두 갈래가 동시에 만지면 반드시 충돌한다.

**같은 일을 여러 에이전트에게 시켜 겨루게 하는 것**도 이 도구가 잘하는 방식이다.
답이 하나로 정해지지 않은 문제(설계 선택, 까다로운 버그)라면 같은 지시문으로
워크트리 두셋을 띄우고 나온 diff 를 견줘 고른다. 진 쪽은 워크트리째 지운다.

---

## 6. 하지 않는 것

- **작은 일에 에이전트를 부르지 않는다.** 한 바퀴가 8~14분이다. 값 몇 개 바꾸는 일이면 직접 한다.
- **한 갈래가 끝나기를 기다리며 다음을 미루지 않는다.** 만들기는 뒤에서 도니 바로 다음을 띄운다.
- **에이전트의 보고를 그대로 옮기지 않는다.** 직접 확인한 것과 전해 들은 것을 구분해서 말한다.
- **워크트리를 남겨 두지 않는다.** merge 하면 바로 지운다. 쌓이면 어느 것이 살아 있는지 모른다.
- **한 에이전트에게 구현과 리뷰를 같이 시키지 않는다.** 제가 짠 것을 제가 보면 못 본다.
- **`main` 에 바로 커밋하지 않는다.** 직접 고치더라도 브랜치를 하나 판다.

---

## 6.5 DB 를 고칠 때

마이그레이션은 `supabase/migrations/` 에 `<판>_<이름>.sql` 로 둔다. supabase CLI 가 보는
자리다. 뿌리에 흩어 두던 때는 `db push` 를 쓰려고 임시 폴더를 손으로 만들어야 했다.

```bash
supabase db push --linked --dry-run   # 무엇이 돌아갈지 먼저 본다
supabase db push --linked             # 올린다
supabase migration list --linked      # 로컬과 원격이 같은지 본다
```

**화면보다 DB 를 먼저 올린다.** 없는 열을 고르면 그 요청 전체가 400 이라 목록이 통째로 안
뜬다. 반대로 DB 가 앞서 있는 것은 아무 문제가 없다.

**함수 몸통을 손으로 옮겨 적지 않는다.** 반환 모양만 바꿀 때도 그렇다 — 그러다 세 곳이
조용히 어긋나 "나도" 가 아예 안 눌린 적이 있다. `schema.sql` 에서 그대로 복사한다.
검사가 `schema.sql` 의 몸통과 마이그레이션의 몸통이 글자까지 같은지 본다.

**목 서버에는 제약도 RLS 도 없다.** 브라우저에서 되는 것을 봤다는 말은 서버가 맞다는 뜻이
아니다 — 제약에 걸리는 변경을 목으로는 두 번 놓쳤다.

---

## 7. 이 저장소를 손댈 때 늘 해야 하는 것

```bash
npm test          # 계단 밖 값·문서 어긋남까지 여기서 걸린다. 2초 안에 끝난다
npx vite build    # 배포와 같은 조건
```

**화면을 만졌으면 브라우저까지 돌린다.**

```bash
npm run check     # 위 둘 + 목 서버용 굽기 + 진짜 브라우저(WebKit·Chromium)
```

브라우저 검사는 `npm test` 에 안 넣었다. 저쪽은 2초에 끝나 늘 도는 문이고, 브라우저를
띄우는 값은 그 문 앞에 둘 값이 아니다. 거기서 재는 것은 흉내 DOM 으로 원리적으로 못 보는
것뿐이다 — 커서가 어디로 가는지, CSSOM 이 못된 값을 버리는지, 실제로 몇 px 인지.

서버(제약·RLS·서버 함수)는 `npm test` 안에서 PGlite 로 본다. Docker 도 서버도 필요 없다.

화면을 만졌으면 **브라우저로 재서** 확인한다. 눈으로 보고 고치면 1~2px 이 계속 쌓인다.
재는 방법과 주의할 점은 [DESIGN.md](DESIGN.md) §12 에 있다.

### 재는 자리는 하나로 둔다

목 서버는 화면과 가짜 API 를 **같은 포트**에서 낸다. 그래서 굽는 주소와 내는 주소가
어긋나면 로그인부터 안 된다. 워크트리마다 새 포트를 띄우다 오늘만 다섯 번 헛돌았다.

```bash
npm run build:mock   # 4180 을 가리키게 굽는다 (키는 .env.local 에서 읽는다)
npm run mock         # 화면과 가짜 API 를 같은 포트에서 낸다
```

목 서버는 `tools/mock-server.mjs` 다. 한동안 저장소에 없어서 사람마다 제 것을 만들어
썼고, 그래서 굽는 주소와 내는 주소가 어긋나는 일이 반복됐다. 이제 여기 있다.

**본 체크아웃의 `dist/` 는 늘 4180 을 가리키게 구워 둔다.** 실제 배포를 확인하느라
`npx vite build` 를 그냥 돌리면 진짜 Supabase 를 가리키게 덮여서 다음 계측이 깨진다.
배포 확인 뒤에는 위 명령으로 되돌린다.

### 자동화 클릭은 화면을 끌어올린다

Playwright 의 `page.click()` 은 대상을 보이게 하려고 **먼저 스크롤한다.** 스크롤 자리를
재는 중이면 그것이 결과를 덮어쓴다 — 실제로 없는 버그를 쫓아 두 바퀴를 돌았다.
스크롤을 재는 시험에서는 페이지 안에서 직접 누른다.

```js
await p.evaluate(() => document.querySelector("<선택자>").click());
```
