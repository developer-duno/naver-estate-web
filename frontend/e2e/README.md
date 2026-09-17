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
  (합치면 옛본이 새본을 덮는다). 대조·판정 절차 = 아래 §baseline 재생성 절차.

## 시각 회귀 (toHaveScreenshot)

**절차·판정·함정의 정본은 이 파일 맨 아래 「시각 회귀 절차·판정·함정」 절이다** (세션 412 에 `.claude/rules/testing.md` 에서 원문 이동 — 규칙 파일 다이어트. 이 절에는 목록만 둔다).

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
비례해 헤더급 변경을 구조적으로 못 잡기 때문(근거·수치 = 아래 §전 페이지가 공유하는 작은 영역).

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
눈 검토 → 커밋 → 일반 CI 초록 확인. **각 단계의 기대값과 함정은 아래 §baseline 재생성 절차 를 그대로 따른다**
(특히 값 없는 `--update-snapshots` 는 파일을 안 갱신한다는 함정, 그리고 "stable 실패 0건"을
판정 근거로 쓰면 안 되는 이유).

되돌림 방지: `npm run check:visual-guard` 가 임계·mask·갱신 플래그·프로젝트 배선을 CI 에서 기계적으로 검사한다.

## 보안 주의

- `e2e/.auth/admin.json` 에 Supabase JWT 가 평문으로 들어감 → `frontend/.gitignore` 의 `e2e/.auth/` 로 보호됨. 절대 커밋 금지.
- `.env.test` 도 `.env*` 패턴으로 ignored. `.env.test.example` 만 allow.
- CI 는 `.env.test` 파일을 쓰지 않고 `env:` 블록으로 직접 주입해서 artifact 에 토큰 유출 경로 차단.
- HTML report 는 실패 시에만 상세 trace 를 담는다 (`screenshot: "only-on-failure"`). admin 스펙이 성공 기대라 token 유출 리스크 낮음.

---

# 시각 회귀 절차·판정·함정 (정본)

> 아래 두 절은 규칙 파일 다이어트(세션 412)로 `.claude/rules/testing.md` 에서 **원문 그대로** 옮겨 왔다.
> testing.md 에는 세 줄 요약과 이 파일로의 포인터만 남는다(내용 무손실). 새 함정·사건은 여기에 보탠다.

## 시각 회귀(toHaveScreenshot) — 화면에 카드를 추가하면 대기 조건도 추가한다 (같은 사고 2회)

`e2e/admin-dashboard.spec.ts` · `admin-pages.spec.ts` 등은 촬영 전에 **카드별 가시성을 하나씩
기다린 뒤** `toHaveScreenshot` 을 찍는다. 그 목록에 없는 카드를 화면에 추가하면 **스켈레톤 →
실제 내용으로 바뀌는 사이에 촬영**돼 fullPage 높이가 요동치고 실패한다.

### 실패를 보면 먼저 두 갈래로 가른다

| 로그 신호 | 뜻 | 처방 |
|---|---|---|
| `Expected an image WxH, received WxH` 만 (수신 크기가 회차마다 **일정**) | baseline 이 낡음 | 재생성(`--update-snapshots=all`) + **갱신 여부 실측**(로그 줄 수 ÷ 2 · sha 대조 — 아래 ④ 참조). ⚠ 값 없는 `--update-snapshots`(= changed 모드)는 **허용오차 안이면 파일을 아예 안 건드린다** — 재생성했다고 믿고 넘어가는 함정 |
| **`Failed to take two consecutive stable screenshots`** / 수신 높이가 회차마다 **다름**(예: 3339→3642→3498) | **촬영이 불안정** | **대기 조건 추가가 먼저** — baseline 재생성은 증상만 덮고 다음 회차에 또 깨진다 |

### 대기 조건을 고를 때

- ⛔ **카드 제목은 쓰지 마라** — 로딩 중에도 보이므로 대기 기준이 못 된다.
- ✅ **스켈레톤이 사라지고 "최종 상태로 굳은" 시점**을 기다린다.
- ⚠ **최종 상태가 환경에 따라 둘로 갈린다** — E2E 는 `NEXT_PUBLIC_API_URL=http://localhost:9999`
  (미기동)라 **조회가 실패해 에러 문구로 굳고**, 실제 운영에서는 정상 데이터로 굳는다.
  **한쪽만 기다리면 CI 에서 `element(s) not found` 로 죽는다.**
  → `page.getByText(A).or(page.getByText(B))` 로 **둘 중 먼저 나타나는 것**을 기다린다.

  ```ts
  await expect(
    page.getByText("속도(중간)").or(page.getByText(/트래픽 통계를 불러오지 못했습니다/)),
  ).toBeVisible();
  ```

  (`StatsCards` 처럼 `page.route` mock 이 붙어 있는 카드는 정상 경로만 기다려도 된다 —
   그 카드가 mock 을 갖는지 먼저 확인하고 고를 것.)

### 그래도 계속 어긋나면 — **그 카드의 응답을 mock 으로 고정**한다

대기 조건을 고쳐 `captured a stable screenshot` 이 로그에 찍히는데도
`Expected an image 1280px by A, received 1280px by B` 가 **회차마다 반복**되면,
그 카드는 **"굳는 높이 자체가 회차마다 다른"** 것이다(한 회차 안에서는 안정, 회차 간에는 불안정).

전형적 원인 = 그 카드에 `page.route` mock 이 없어 **실패 응답의 내용·조건부 배지**가 매번 달라짐.
예: TrafficCard 의 `가동 N` 배지는 `data` 가 있을 때만 렌더돼 높이를 바꾼다.

→ **응답을 고정하면 높이도 고정된다.** `e2e/fixtures/admin-mocks.ts` 처럼 그 엔드포인트에
`page.route` mock 을 추가한다(#493 선례 = `/api/admin/traffic`). 이게 유일하게 실효가 있는 처방이다.

```ts
// e2e/fixtures/admin-mocks.ts — 응답 내용을 고정해 조건부 렌더(배지·빈 상태)를 결정론화
await page.route("**/api/admin/traffic**", (route) =>
  route.fulfill({ status: 200, json: FIXED_TRAFFIC }),
);
```

⛔ **mask 는 이 문제에 쓰지 말 것** — mask 는 그 영역 픽셀만 덮을 뿐 **fullPage 높이 자체를
고정하지 못한다.** Playwright 는 크기가 다르면 작은 쪽을 패딩한 뒤 그 패딩 영역을 diff 로
세므로(coreBundle `padImageToSize`), 3498 baseline 에 3642 가 오면 184,320/4,661,760 =
비율 0.0395 로 임계 0.02 를 초과해 그대로 실패한다. 세션 398 에 mask 로 "해결했다"고
잘못 보고했다가 적대검증이 실험으로 반증했다(반증 근거 = `e2e/admin-dashboard.spec.ts:38-50` 주석).
mask 가 유효한 경우는 **높이와 무관한 내용 가리기**(예: baseline 에 박힌 실계정 이메일)뿐이다.

### baseline 재생성 절차 (윈도우 로컬 촬영 금지 — 폰트 렌더 차이)

⛔ **로컬 Windows 로 찍지 마라.** 폰트 렌더가 달라 CI(Linux)와 절대 일치하지 않는다 —
baseline 파일명이 `-linux.png` 인 이유가 이것이다. 재생성은 **오직 CI dispatch** 경로뿐이다.

**① dispatch — 반드시 작업 브랜치로**

```bash
gh workflow run ci.yml --ref <작업 브랜치> -f update_snapshots=true
```

⚠ `--ref main` 은 paths-filter(`getChangesInLastCommit`)가 마지막 커밋만 보므로 **e2e job 이
skip 될 수 있다**(소스로 확정). dispatch 직후 run 페이지에 **e2e 3 job(admin/public/public-visual)이
실재하는지** 먼저 확인한다 — 없으면 그 run 은 아무것도 재촬영하지 않았다.

**② artifact 3개 전부 다운로드**

```bash
for p in admin public public-visual; do
  gh run download <RUN_ID> -n updated-snapshots-$p -D "$DL/$p"
done
```

**③ 꾸러미별 접미사 필터로 sha256 대조**

⚠ **artifact 를 통째로 덮어쓰지 마라.** 각 꾸러미에는 그 프로젝트가 재촬영한 것만이 아니라
**e2e/ 의 PNG 전량**(현재 19장 — 헤더 baseline 생성 후 20장)이 담긴다(path 글롭이 전체 스냅샷 디렉터리). 3꾸러미를 한 폴더에
합치면 **옛본이 새본을 덮는다.** 꾸러미 `p` 에서 유효한 재촬영본은 `*-<p>-linux.png` 뿐이다.

```bash
cd frontend/e2e
for p in admin public public-visual; do
  for f in $(cd "$DL/$p" && find . -name "*-$p-linux.png" | sed 's|^\./||'); do
    if [ ! -f "$f" ]; then
      echo "신규: $f"          # ← 새 baseline (기존 파일만 비교하면 조용히 놓친다)
    elif [ "$(sha256sum "$f" | cut -c1-12)" != "$(sha256sum "$DL/$p/$f" | cut -c1-12)" ]; then
      echo "변경: $f"
    fi
  done
done
```

⚠ **`[ -f "$f" ] &&` 로 시작하는 옛 스니펫은 신규 baseline 을 조용히 건너뛴다** — 로컬에
없는 파일은 조건에서 탈락해 아무것도 출력하지 않으므로, 스펙을 새로 추가한 회차에
"변경 없음"으로 보이고 새 baseline 을 커밋에서 빠뜨리게 된다(세션 398 적대검증 W12).

**④ 갱신이 실제로 일어났는지 로그로 판정** (이 단계를 건너뛰면 "재생성했다"가 추측이 된다)

`list` reporter 가 워커 stdout 을 CI 로그에 찍으므로 job 로그에서 직접 센다:

| 로그 문구 | 뜻 |
|---|---|
| `... is re-generated, writing actual.` | **기존** baseline 을 새로 썼다 |
| `A snapshot doesn't exist ..., writing actual.` | **신규** baseline 을 만들었다 |

판정 = **그 프로젝트 job 의 위 두 문구 줄 수 ÷ 2 == 그 프로젝트의 sha 변경·신규 장 수.**
어긋나면 어딘가 안 찍혔거나 안 갱신된 것이다.

⚠ **÷ 2 인 이유 — 한 장을 갱신할 때 같은 문구가 두 줄 찍힌다**(세션 401 실측으로 정정.
그 전까지 이 문서는 `==` 라고 적어 두었고, 그대로 세면 정상 run 을 "불일치"로 오판한다).
run 34726189807 실측: admin 10줄/5장 · public 12줄/6장 · public-visual 6줄/3장 = 전부 정확히 2배.
같은 파일명이 수십 ms 간격으로 연속 2줄인 것이 증거 —
`admin-data-admin-linux.png` 가 `23:49:40.6060` 과 `23:49:40.6503`(44ms 차),
`complex-admin-linux.png` 가 `.2321`/`.2323`(2ms 차). 즉 재생성 1회가 2줄을 남긴다.
장 수를 세려면 **줄 수가 아니라 파일명 종류 수**(`sort -u`)를 세는 편이 더 안전하다.

⚠ **`=all` 재촬영은 "내 변경과 무관한 장"까지 바꿔 놓는다 — 전부 커밋하지 말 것**(세션 401 실측).

로그인 헤더만 고친 PR 에서 **13장**이 변경으로 나왔는데 그중 **5장만** 그 변경으로 설명됐다.
나머지 8장(blog 6 · compare · home · mibunyang)은 **`public`/`public-visual` 프로젝트 = storageState
없음 = 비로그인 헤더**라, 로그인 상태에서만 렌더되는 코드가 닿을 수 없는 프레임이다.

원인 = **폰트 확정 전 촬영**(추정이나 근거 4종):
- 그 8장의 직전 baseline 이 전부 **90분 전 같은 CI 이미지**에서 나왔고 `@playwright/test` 버전도 동일
  → Chromium 드리프트로 설명 안 됨
- 픽셀 분포가 **재래스터화** 특성: 변경 대역 median **10~14** · 미세차(≤8) **42~47%**
  (반면 진짜 내용 변경인 admin 헤더 띠는 median **85~102** · 미세 **4~5%**)
- `blog-visual.spec.ts` 는 **heading 가시성만** 기다리고 `fonts`/`networkidle` 대기가 없다.
  Pretendard 는 `next/font/local` 이라 dev 서버 콜드 컴파일 시 첫 페인트 뒤에 확정될 수 있다
- **대조군**: `login`·`header-public-desktop`(둘 다 비로그인 헤더 프레임) = **변경 0**

✅ **이 변동은 CI 를 빨갛게 만들지 않는다** — 전역 2% 비율 임계 아래라 일반 CI 는 통과한다
(PR #502 에서 그 8장을 **그대로 둔 채** `public`·`public-visual` 둘 다 success 로 실증).
즉 "재촬영했더니 바뀌었다" ≠ "고쳐야 한다".

⇒ **처방**: 재촬영 후 반드시 **bbox·픽셀 분포로 장별 원인을 갈라** 내 변경으로 설명되는 장만
커밋한다. 설명 안 되는 장을 함께 커밋하면 원인 불명 변경을 내 작업에 묻는 셈이고, 되돌릴 때
무엇이 의도된 변경이었는지 분간할 수 없게 된다.

⛔ **"`Failed to take two consecutive stable screenshots` 0건" 을 판정 근거로 쓰지 마라** —
그 문구는 **통과 경로에 절대 안 찍힌다**(재현 실측: 안정화 타임아웃이 나도 마지막 프레임을
그대로 쓰고 passed·sha 변경까지 난다). 즉 갱신 run 의 초록은 "갱신됨"도 "안정함"도 증명하지
못한다. **안정성의 유일한 판정은 baseline 을 커밋한 뒤 도는 일반 CI(비갱신)의 초록**이다.

⚠ 한 가지 예외 — **baseline 이 없는 신규 장**은 `=all` 의 "조용히 덮어씀"이 적용되지 않아,
불안정하면 **dispatch run 자체가 빨강이고 PNG 가 아예 생성되지 않는다**(그러면 위 `[ ! -f ]`
분기도 "신규"를 못 찍는다). 그래서 신규 장을 추가한 회차엔 그 job 의 **스냅샷 테스트 수가
기대대로 전부 passed 인지**(예: public-visual = 기존 5 + 헤더 1 = 6/6) 함께 확인한다.
빨강이면 **재dispatch 가 아니라** 촬영 전 대기 조건을 보강해야 한다.

**⑤ 기계 diff 로 변경 위치 확인** (눈보다 먼저)

```bash
python -c "
from PIL import Image, ImageChops
a, b = Image.open('old.png').convert('RGB'), Image.open('new.png').convert('RGB')
d = ImageChops.difference(a, b)
print('bbox', d.getbbox(), 'px', sum(1 for p in d.getdata() if p != (0,0,0)))
"
```

bbox 가 **기대한 영역 밖**이면 보류하고 원인을 찾는다. 장별 기대 변경은
`git log <그 PNG 의 마지막 커밋>..HEAD -- <그 페이지 경로>` 로 좁힌다.

⚠ Chromium 범프(@playwright/test 가 5/31 이후 4회 올라 1.58→1.63)가 있으면 `=all` 재촬영 시
**19장 대부분이 바이트 변경**된다 — 그 상태에서 눈 검토만으로는 "기대한 변경"과 "숨은 회귀"를
분간할 수 없다. 그래서 기계 diff(bbox)로 먼저 위치를 좁히는 순서가 중요하다.

**⑥ 눈 검토 → ⑦ 커밋 → 일반 CI 초록 확인**(④의 마지막 문장 = 안정성의 유일 판정).

## 전 페이지가 공유하는 작은 영역(헤더)은 좁은 전용 스냅샷으로 감시한다

**비율 임계는 프레임 면적에 비례한다** — 그래서 전 페이지 공유 헤더처럼 얇은 띠의 변경은
`fullPage` 장에서 **구조적으로 감지가 불가능**하다. 실측: 헤더 띠(1280×57)는 fullPage 의
1.5~6.8%, 메뉴 1개 diff ≈ 4,300~8,400px = 전체의 0.1~0.8% → 임계 2%에 절대 안 걸린다.
(그래서 "요금제" 메뉴 제거가 19장 어디에서도 빨강을 만들지 못했다.)

처방 = **헤더만 잘라 분모를 작게 만든 프레임 + 절대 픽셀 임계**:
`e2e/public-flow.spec.ts` 의 `header-public-desktop.png`(`maxDiffPixels: 100`,
전역 비율과 `Math.min` 으로 합성되어 실효 100px). 이 프레임에서 메뉴 1개 = 약 6% 라 확실히 잡힌다.

- **관리자 헤더**는 전용 장을 두지 않는다 — admin fullPage 5장이 이미 로그인 헤더를 담고 있고,
  전문가·구독 배지가 계정 상태에 따라 흔들려(비결정) flaky 가 된다.
- **모바일 헤더**는 `hidden md:flex` 라 nav 자체가 렌더되지 않는다(닫힌 햄버거뿐). 열린 드로어의
  링크 집합은 **DOM 레인**(`Header.test.tsx` 의 집합 동일성 단언 + `LOCKED_PATHS` 음성 순회)이 본다.
- **전역 `maxDiffPixelRatio: 0.02` 와 per-call 19곳의 역할은 "레이아웃 붕괴 전용"** 이다.
  올리면 붕괴조차 통과하고, 내리면 19장이 전부 flaky 가 된다 — **상향 금지**.

**보장 범위(정직하게)**: 시각회귀는 **레이아웃 붕괴·빈 화면이 아님**까지 보장한다.
"의도된 변경만 반영됐다"는 **보장하지 못한다**(Chromium 드리프트로 19장 대부분이 바이트
변경되는 회차가 있으므로).

### 이 안전망은 되돌리기 쉬우므로 CI 가 지킨다

임계를 올리거나 mask 를 넣거나 갱신 플래그를 changed 로 되돌려도 **CI 는 초록**이라
사람 눈에 안 보인다(세션 398~400 에 세 번 겪음). `npm run check:visual-guard`
(`frontend/scripts/check-visual-guard.mjs`, Frontend CI 의 `Visual regression guard` step)가
네 가지를 기계적으로 막는다:

1. `ci.yml` 의 **실행되는 run 줄**에 `--update-snapshots=all` 유지(주석만 남는 거짓 PASS 차단,
   `-u`·`--ignore-snapshots` 금지, matrix 에 `public-visual` 존재)
2. 헤더 스냅샷 옵션의 `maxDiffPixels` ≤ 200, `mask`·`fullPage`·`maxDiffPixelRatio` 부재,
   `test.skip/fixme` 부재, 촬영 전 `toBeVisible` 대기 존재
3. `e2e/*.spec.ts` 전수의 per-call `maxDiffPixelRatio` ≤ 0.02 — **숫자 리터럴만 인정**(변수 우회 FAIL)
4. `playwright.config.ts` 의 전역 임계 0.02 고정 + `public-visual` testMatch 가 public-flow 를
   **실제로 매칭**(정규식을 돌려 확인) + `public` testIgnore 가 public-flow 제외 유지

단위 테스트(`scripts/__tests__/check-visual-guard.test.mjs`)가 되돌림 7종이 **실제로 FAIL 하는지**
각각 단언한다 — "가드가 있다"와 "가드가 이 되돌림을 본다"는 별개이므로(세션 372 교훈).

> **사건**: 세션 396(PR #483) `/admin/data` — 6월 baseline 이 "통계 카드 뜨기 전" 상태라
> mock 이 먼저 뜨는 회차에 불일치(flaky). 대기 2줄 + baseline 재생성으로 해결.
> **재발**: 세션 398(PR #492) `/admin` — TrafficCard 추가 후 동일 기전. 처음엔 "baseline 이
> 낡은 것"으로 오진했다가 로그의 `stable screenshots` 문구로 정정(`c945bcf`).
> 2회 반복이라 본 절 신설.
> **안전망 자체의 결함 3건**: 세션 400 — ① 갱신 플래그가 `--update-snapshots`(changed)라
> **파일이 안 갱신되고 있었다**(실증 = #498 dispatch run 34699999010 의 3 job 로그에
> `is re-generated` 줄 0건). ② 세션 398 의 mask 처방이 반증됐는데 이 문서엔 처방으로 남아
> 있었다. ③ 전 페이지 공유 헤더의 메뉴 변경이 비율 임계로 감지 불가("요금제" 제거가 19장
> 어디서도 안 걸림). → `=all` 전환 + mask 절 재작성 + 헤더 전용 장 신설 + `check:visual-guard`.
