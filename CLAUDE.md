# 둘살림 작업 방식

이 저장소의 일은 **Orca 워크트리에서 갈래마다 별도 브랜치로, 여러 개를 한꺼번에** 진행한다.
본 체크아웃(`~/Desktop/dev/가계부`)에서 직접 고치지 않는다.

디자인 값을 만지는 일이면 [DESIGN.md](DESIGN.md) 를 먼저 읽는다.

---

## 왜 워크트리인가

Orca 는 워크트리가 기본 단위다. 한 체크아웃에서 브랜치를 갈아 끼우고 stash 하는 대신,
**할 일마다 `git worktree` 로 저장소 사본을 따로 둔다.** 에이전트들이 서로의 파일을
밟지 않는 것이 이 방식의 요점이다.

그리고 Orca 는 에이전트를 **전권 모드로 띄운다** — Claude 는 `--dangerously-skip-permissions`,
Codex 는 `--dangerously-bypass-approvals-and-sandbox`, Gemini 는 `--yolo`.
**워크트리 자체가 울타리라는 전제**다. 그래서 워크트리가 진짜로 갈라져 있지 않으면
그 전제가 무너진다 (§1 의 `kind` 확인이 그래서 중요하다).

```
할 일 쪼개기 → 갈래마다 워크트리 + 에이전트 (동시에) → 각자 PR
   → 팀 리더가 PR 을 리뷰 → 고칠 것 있으면 그 워크트리로 되돌려 보냄
   → 통과하면 merge → 워크트리 삭제 (디렉터리와 브랜치가 함께 사라진다)
```

**한 갈래 = 한 워크트리 = 한 브랜치 = 한 PR.**

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

새 워크트리에서 검사 329건이 그대로 도는 것을 확인했다. 여기에 뭔가 더 필요해지면
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

- **본 체크아웃에서 고치지 않는다.** 읽기·확인은 해도 되지만 커밋은 워크트리에서 한다.
- **한 갈래가 끝나기를 기다리며 다음을 미루지 않는다.** 만들기는 뒤에서 도니 바로 다음을 띄운다.
- **에이전트의 보고를 그대로 옮기지 않는다.** 직접 확인한 것과 전해 들은 것을 구분해서 말한다.
- **워크트리를 남겨 두지 않는다.** merge 하면 바로 지운다. 쌓이면 어느 것이 살아 있는지 모른다.
- **한 에이전트에게 구현과 리뷰를 같이 시키지 않는다.** 제가 짠 것을 제가 보면 못 본다.

---

## 7. 이 저장소를 손댈 때 늘 해야 하는 것

```bash
npm test          # 329건. 계단 밖 값·문서 어긋남까지 여기서 걸린다
npx vite build    # 배포와 같은 조건
```

화면을 만졌으면 **브라우저로 재서** 확인한다. 눈으로 보고 고치면 1~2px 이 계속 쌓인다.
재는 방법과 주의할 점은 [DESIGN.md](DESIGN.md) §12 에 있다.
