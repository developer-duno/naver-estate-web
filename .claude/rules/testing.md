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
| `Expected an image WxH, received WxH` 만 (수신 크기가 회차마다 **일정**) | baseline 이 낡음 | baseline 재생성만 |
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

### baseline 재생성 절차 (윈도우 로컬 촬영 금지 — 폰트 렌더 차이)

```bash
gh workflow run ci.yml --ref <브랜치> -f update_snapshots=true
# 완료 후 artifact `updated-snapshots-<project>` 다운로드
```
baseline 파일명이 `-linux.png` 인 이유가 이것이다.

⚠ **artifact 를 통째로 덮어쓰지 마라.** 그 안에는 그 project 의 **모든** baseline 이 들어 있어
(admin artifact 에 blog·compare·home 까지 19장) 전량 복사하면 **무관한 baseline 변경이 커밋에 섞인다.**
sha256 으로 대조해 **실제로 달라진 것만** 교체한다:

```bash
cd frontend/e2e
for f in $(cd "$DL" && find . -name "*.png" | sed 's|^\./||'); do
  [ -f "$f" ] && [ "$(sha256sum "$f" | cut -c1-12)" != "$(sha256sum "$DL/$f" | cut -c1-12)" ]     && echo "변경: $f"
done
```

> **사건**: 세션 396(PR #483) `/admin/data` — 6월 baseline 이 "통계 카드 뜨기 전" 상태라
> mock 이 먼저 뜨는 회차에 불일치(flaky). 대기 2줄 + baseline 재생성으로 해결.
> **재발**: 세션 398(PR #492) `/admin` — TrafficCard 추가 후 동일 기전. 처음엔 "baseline 이
> 낡은 것"으로 오진했다가 로그의 `stable screenshots` 문구로 정정(`c945bcf`).
> 2회 반복이라 본 절 신설.

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
