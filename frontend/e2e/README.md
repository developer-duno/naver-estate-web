# Playwright E2E

## Project 구조

`playwright.config.ts` 에 4개 project (CI e2e job matrix 는 이 중 3개 = admin/public/public-visual).

| project | 대상 파일 | storageState | 용도 (테스트 수는 2026-09-13 `--list` 실측) |
|---|---|---|---|
| `setup` | `global.setup.ts` | 쓰기 (`e2e/.auth/admin.json`) | Supabase 로그인 후 세션 저장 |
| `public` | 전부 (setup·admin·시각 스펙 제외) | 없음 | 비인증 경로 회귀 **85개 / 13파일** |
| `public-visual` | `public-flow`·`compare-visual`·`mibunyang-visual`·`search-visual` | 없음 | 비인증 시각 회귀 **6개 / 4파일** |
| `admin` | `admin-dashboard`·`admin-pages`·`complex-visual` | 읽기 (setup 산출물) | 관리자 화면 + 단지 상세 시각 회귀 **6개 / 4파일**(setup 포함) |

`admin` project 는 `setup` 에 `dependencies` 로 묶여 있어서 `--project=admin` 실행 시 setup 이 먼저 돈다.

## 로컬에서 admin e2e 돌리기

1. `frontend/.env.test` 를 생성하고 아래 5개 값을 채운다 (예시는 `.env.test.example` 참고):

   ```
   TEST_ADMIN_EMAIL=...
   TEST_ADMIN_PASSWORD=...
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   NEXT_PUBLIC_API_URL=http://localhost:8002
   ```

   `TEST_ADMIN_EMAIL` 은 `ADMIN_EMAIL` 환경변수에 등록된 관리자 이메일이어야 한다 (미들웨어의 `ADMIN_EMAILS` 매칭).

2. setup + admin 만 실행 (이 PC 에서는 3000=sangse / 3100=legal 가 점유 중이므로 naver 는 8090 사용 — 세션 114 박제):

   ```bash
   PLAYWRIGHT_PORT=8090 npx playwright test --project=setup --project=admin
   ```

   CI 에서는 `PLAYWRIGHT_PORT` 미설정 → 기본값 3000 사용 (CI 환경은 단독, 충돌 없음).

3. 성공 시 `e2e/.auth/admin.json` 생성. 이후 세션 재사용. 만료되면 (Supabase 기본 1시간) 같은 명령으로 재생성.

## 전체 회귀

```bash
npx playwright test                        # 전체 (97개 / 21파일 — 2026-09-13 --list 실측)
npx playwright test --project=public       # 비인증 기능 85개
npx playwright test --project=public-visual # 비인증 시각 회귀 6개
```

## CI

`.github/workflows/ci.yml` 의 `e2e` job 이 PR + main push 시 자동 실행. `frontend/**` 변경 있을 때만.

GitHub secrets 5개 필요:
- `TEST_ADMIN_EMAIL`
- `TEST_ADMIN_PASSWORD`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

secrets 미설정 시 `setup` project 가 `TEST_ADMIN_*` missing 로그와 함께 skip → `admin` project 는 dependency 실패로 같이 skip → job 자체는 green. secrets 등록 순간 자동으로 진짜 테스트 시작.

아티팩트 (project 별로 3벌씩 — matrix job 이름이 접미사):
- `playwright-report-<project>` — HTML 리포트 (14일 보관)
- `admin-screenshots-<project>` — `test-results/` 실패 시 자동 캡처 (14일 보관)
- `updated-snapshots-<project>` — workflow_dispatch + `update_snapshots=true` 일 때만.
  ⚠ 각 꾸러미에 PNG **전량**(현재 19장, 헤더 baseline 생성 후 20장)이 담기지만 유효한 재촬영본은 `*-<project>-linux.png` 뿐이다
  (합치면 옛본이 새본을 덮는다). 대조·판정 절차 = `.claude/rules/testing.md` §baseline 재생성.

## 시각 회귀 (toHaveScreenshot)

**절차·판정·함정은 `.claude/rules/testing.md` §시각 회귀 가 정본이다** (여기엔 목록만 둔다).

baseline 은 spec 파일별 `*-snapshots/` 디렉토리에 `<이름>-<project>-linux.png` 로 저장된다
(파일명에 project 가 들어가므로 같은 spec 을 두 project 에서 돌리면 장이 이중 생성된다 —
`public` 의 testIgnore 가 `public-flow` 를 제외하는 이유).

| project | PNG (현재 **19장** 실측 2026-09-13 — `header-public-desktop` 은 테스트만 있고 baseline 미생성, CI dispatch 후 20장) |
|---|---|
| `public` (10) | `blog-index-{desktop,iphone}` · `blog-slug-{desktop,iphone}` · `blog-slug-realtime-{desktop,iphone}` · `blog-slug-radar-weights-{desktop,iphone}` · `blog-slug-for-agents-{desktop,iphone}` |
| `public-visual` (5) | `home` · `login` · `compare` · `mibunyang` · **`header-public-desktop`**(세션 400 신설) |
| `admin` (5) | `admin-dashboard` · `admin-data` · `admin-users` · `admin-settings` · `complex` |

임계: 전역 `maxDiffPixelRatio: 0.02` + `animations: "disabled"`(playwright.config.ts). 단
`header-public-desktop` 만 **절대 픽셀 `maxDiffPixels: 100`** — 비율 임계는 프레임 면적에
비례해 헤더급 변경을 구조적으로 못 잡기 때문(근거·수치 = testing.md).

`search-visual.spec.ts` 는 public-visual 프로젝트지만 스냅샷이 없다(세션 314 에 홈 장과
중복이라 제거, smoke 단언만 남김) — 그래서 public-visual 은 test 6개 / PNG 5장이다.

### baseline 갱신 절차

⛔ **로컬 Windows 재촬영 금지** — 폰트 렌더가 달라 CI(Linux) baseline 과 절대 일치하지 않는다
(그래서 파일명이 `-linux.png` 다). 옛 `PLAYWRIGHT_PORT=8090 … --update-snapshots` 절차는
이 이유로 삭제했다. **artifact 통째 커밋도 금지**(무관한 장이 섞인다).

```bash
gh workflow run ci.yml --ref <작업 브랜치> -f update_snapshots=true
```

이후 artifact 3개 다운로드 → 접미사 필터 sha256 대조 → 갱신 로그 줄 수 대조 → 기계 diff →
눈 검토 → 커밋 → 일반 CI 초록 확인. **각 단계의 기대값과 함정은 testing.md 를 그대로 따른다**
(특히 값 없는 `--update-snapshots` 는 파일을 안 갱신한다는 함정, 그리고 "stable 실패 0건"을
판정 근거로 쓰면 안 되는 이유).

되돌림 방지: `npm run check:visual-guard` 가 임계·mask·갱신 플래그·프로젝트 배선을 CI 에서 기계적으로 검사한다.

## 보안 주의

- `e2e/.auth/admin.json` 에 Supabase JWT 가 평문으로 들어감 → `frontend/.gitignore` 의 `e2e/.auth/` 로 보호됨. 절대 커밋 금지.
- `.env.test` 도 `.env*` 패턴으로 ignored. `.env.test.example` 만 allow.
- CI 는 `.env.test` 파일을 쓰지 않고 `env:` 블록으로 직접 주입해서 artifact 에 토큰 유출 경로 차단.
- HTML report 는 실패 시에만 상세 trace 를 담는다 (`screenshot: "only-on-failure"`). admin 스펙이 성공 기대라 token 유출 리스크 낮음.
