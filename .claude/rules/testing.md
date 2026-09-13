# 테스트 규칙

## 새 기능 추가 시
- 기능 코드와 함께 테스트 코드도 반드시 작성
- 최소: 정상 케이스 1개 + 에러 케이스 1개

## 결함 수정 시 — 통과하던 테스트가 결함을 박제했을 수 있다 (세션 264·292 답습)

법령·명세 위반 결함을 고칠 때, **기존 테스트가 그 틀린 동작을 정답으로 단언**하고 있을 수 있다.
수정 후 테스트가 깨지면 "내 수정이 틀렸나"부터 의심하지 말고, **그 테스트가 결함을 박제한 것은
아닌지 법령·명세로 재확인**하라. 결함 박제 테스트면 테스트를 정정하는 게 맞다.

체크리스트 (결함 수정 PR 의무):
1. **수정 전 "왜 이 테스트가 통과했나" 확인** — 결함이 있는데 테스트가 통과 = 그 테스트가 틀린
   동작을 단언하거나(박제), 그 케이스를 아예 안 다룬다(사각). grep 으로 해당 분기 단언 존재 확인.
2. **수정으로 깨진 테스트는 법령·명세로 정답 재확인 후 정정** — 추측으로 기대값 바꾸지 말 것.
   세금 계산은 Python REPL 로 연쇄값(분자→세액공제→최종세액)까지 전부 재검산 후 박는다.
3. **수정한 결함 자체를 직접 단언하는 회귀 테스트 신규 추가** — 사각이었으면 메우고, 박제였으면
   정정 + 경계값(예: 9억 게이트 양옆) 추가.

> 사건: 세션 264 — 양도세 단기+중과 경합을 결함으로 오판(실제는 §104① 단서 의도된 max).
> 세션 292(역방향) — 취득세 "다주택 60m² 면적무관 농특 부과"(line 261)·보유세 9억초과 1주택
> SINGLE 단언(#2·#3·#CPC-2) 3건이 **실제 결함을 정답으로 박제**. 법령 확인(행안부 질의회신·
> 지방세법 §111의2) 후 테스트 정정 + 회귀 신규. PR #147·#148.
>
> 세션 384 — 법률 용어 하나를 잘못 해석해 결론이 한 번 뒤집힌 사례. 종부세 이중과세 공제
> (시행령 §4의2) 판례 원문의 "재산세 **표준세율**로 계산한 재산세 상당액"이라는 문구를,
> 처음엔 "표준세율=지자체 조례 가감 전 법정 기본세율"(조례 가감 여부와 무관, 누진 유지)로
> 해석해 "기존 코드(누진공제 차감)가 맞다"고 오판했다. 그런데 elitelaw.kr 의 **구체적 숫자
> 계산례**("④ 구간세율로 적용하지 않고(3억 초과 구간 570,000원 누진공제 더하지 않음) 표준
> 세율만 적용")를 직접 대조하자 "표준세율=누진공제를 빼지 않고 세율만 곱하는 방식"이 맞다는
> 게 드러나 결론이 뒤집혔다. 교훈: **법률 용어의 뜻은 사전적 정의나 다른 맥락(예: 지방세법
> §111③ 조례 가감의 "표준세율")으로 유추하지 말고, 그 조문이 실제로 쓰이는 구체적 숫자
> 계산례로 검증**해야 한다 — 같은 단어("표준세율")가 조문마다 다른 걸 가리킬 수 있다.
> PR #423.

## effect 가드 플래그(isMounted 류) 컴포넌트는 `<StrictMode>` 래핑 케이스를 포함한다 (세션 395 답습)

React StrictMode(dev, App Router 기본 on)는 effect 를 mount→cleanup→mount 로 이중 실행한다. cleanup 이 ref 플래그를
`false` 로 내리는 컴포넌트는 두 번째 실행에서 그 플래그가 되살아나지 않으면 비동기 후속이 전부 조기 이탈하는데,
**일반 렌더 테스트는 이 결함을 절대 못 본다**(effect 가 1회만 돌기 때문). vitest 는 React dev 빌드로 돌아 `<StrictMode>` 로
감싸기만 하면 이중 실행이 실제로 재현된다.

체크리스트:
1. `useRef(true)` + cleanup `false` 패턴이 있는 컴포넌트의 회귀 테스트에는 `render(<StrictMode><X/></StrictMode>)` 케이스를
   최소 1건 둔다(로그인 상태 등 비동기 후속의 결과가 화면에 보이는지 단언).
2. 뮤테이션 검증: 재설정 줄(`ref.current = true`)을 제거하면 그 케이스가 FAIL 하는지 확인 후 복원.
3. 선례 = `frontend/src/components/__tests__/Header.strictmode.test.tsx`(세션 395, next 16.3.4 admin E2E 회귀 근본수정 — E2E 는
   dev 서버라 StrictMode 결함이 드러났고 prod 빌드는 이중 실행이 없어 사용자 영향 0 이었다).

## fixture 의 서로 다른 두 축이 우연히 같은 값이면 단위 오류를 못 잡는다 (세션 372 답습)

두 개의 서로 다른 개념(예: "단지 수"와 "법정동 수")을 세는 코드에서, 테스트 fixture 가
그 둘을 **우연히 같은 값**(예: 단지 1개 = 법정동 1개)으로 만들면, 코드가 둘을 뒤바꿔
써도(단지 수 자리에 법정동 수를 넣어도) 숫자가 같아서 테스트가 통과한다 — "테스트가
있다"와 "그 테스트가 이 결함을 볼 수 있다"는 별개다.

체크리스트 (두 축을 셀 때):
1. **fixture 는 두 축이 다른 값이 되도록 의식적으로 설계**한다 — 단지 2개가 법정동
   1개에 속하는 것처럼, 1:1 이 아닌 N:1(또는 1:N) 관계로 만들어 값이 갈라지게 한다.
2. **신규 회귀 테스트를 추가한 뒤 뮤테이션 검증** — 고친 코드를 잠깐 수정 전 상태로
   되돌려서 새 테스트가 실제로 실패하는지 확인한다. 통과하면 그 테스트는 이 결함을
   못 잡는 장식일 뿐이다. 되돌린 뒤에는 반드시 정확한 수정 코드로 복원.

> 사건: 세션 372 — `service_official_price.py` silent-failure 가드가 `remaining`(법정동
> 코드 리스트)을 "단지 수"라고 표시하는 단위 오류를, 기존 `seeded` fixture(단지1=법정동1)가
> 숫자를 우연히 일치시켜 61개 테스트가 다 통과하는 채로 하루 넘게 방치했다. 적대검증
> 워크플로우가 fixture 구조를 직접 읽어 이 함정을 지적, 단지 2개·법정동 1개인 새 fixture로
> `test_collect_silent_failure_guard_counts_complexes_not_ld_codes` 를 추가하고 뮤테이션
> 검증(수정 전 코드로 되돌리면 실제로 실패)까지 거쳐 PR #399 로 반영.

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

## 테스트 코드 작성 기준
- 파일명: [대상].test.ts 또는 [대상].spec.ts
- 한국어 주석으로 "이 테스트가 뭘 검증하는지" 설명
- 테스트 데이터는 하드코딩 말고 팩토리 함수 사용

## 테스트 실행

### 커밋 전 필수 (CI와 동일)

> 명령 = 루트 `CLAUDE.md` §커밋 전 필수 검증 참조 (SSOT 단일화).

### 레벨별 실행
```bash
# FE 전체
cd frontend && npm test

# BE 전체
cd backend && python -m pytest

# FE 특정 파일
cd frontend && npx vitest run src/lib/__tests__/format.test.ts

# BE 특정 파일/함수
cd backend && python -m pytest tests/test_queries.py
cd backend && python -m pytest tests/test_queries.py::test_search_complexes_by_name -v

# E2E (서버 실행 필요)
cd frontend && npx playwright test
cd frontend && npx playwright test --headed  # 브라우저 보면서
cd frontend && npx playwright test --ui      # 인터랙티브 모드
```

### 결과 읽기
- **Vitest**: checkmark = 통과, X = 실패 + expected/received diff
- **pytest**: . = 통과, F = 실패, s = 스킵 + traceback
- **Playwright**: PASS/FAIL + 실패 시 스크린샷 test-results/

### 테스트 구조

> 카운트 = 루트 `CLAUDE.md` §테스트 현황 참조 (SSOT 단일화).

### React Query 테스트 패턴
- 컴포넌트/훅 테스트에서 `TestQueryProvider` 래퍼 사용 (test-setup.ts에서 export)
- API 함수는 `vi.mock("@/lib/api")` 로 모킹
- MSW 테스트 (api.test.ts)는 네트워크 레벨 → QueryProvider 불필요
