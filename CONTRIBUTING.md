# 기여 가이드 — naver-estate-web

본 문서는 코드 작성자(개발자·AI 에이전트)가 commit 직전에 자동으로 동작하는 가드(GATE 10 + 광고법)를 깨우치고 정상 우회하지 않도록 박제하는 단원입니다.

## 환경 설정

```bash
# 1. clone
git clone <repo-url> naver-estate-web
cd naver-estate-web

# 2. frontend 의존성 설치 (husky pre-commit hook 자동 활성화)
cd frontend
npm install
```

`npm install` 이 끝나면 `prepare` script (`cd .. && husky frontend/.husky`) 가 자동으로 실행되어 `git config core.hooksPath` 가 `frontend/.husky/_` 로 설정됩니다. 별도 명령 불필요.

## pre-commit hook 동작

`frontend/src/content/blog/*.mdx` 변경이 staged 되어 있을 때만 다음 가드 2종이 자동 실행됩니다.

| 가드 | 명령 | 차단 사유 |
|---|---|---|
| GATE 10 (mdx-jsx) | `npm run check:mdx-jsx` | mdx-js-loader 가 JSX 시작 태그로 오인 → Turbopack build 실패 (162 사고) |
| 광고법 (ad-compliance) | `npm run check:ad-compliance` | 부동산 광고법 위험 단어 박제 (Footer 면책 + 작성자 가이드) |

staged mdx 가 0개인 commit (예: 코드만 변경) 은 hook 이 즉시 skip 되어 시간 영향 0.

## GATE 10 금지 패턴 5종

mdx 표 cell·본문에서 다음 raw 표현은 mdx-js-loader 가 JSX 시작 태그로 오인합니다.

| 금지 패턴 | 정정 답습 |
|---|---|
| raw `<숫자` (예: `<1.0`, `<60`) | `미만` 한글 또는 `≤` 유니코드 |
| raw `>숫자` (예: `>65`, `>30`) | `초과` 한글 또는 `≥` 유니코드 |
| raw `<=숫자` (예: `<=1.0`) | `이하` 한글 또는 `≤` 유니코드 |
| raw `>=숫자` (예: `>=65`) | `이상` 한글 또는 `≥` 유니코드 |
| 단독 `[/path/[id]]` (마크다운 링크 밖) | `[표시 텍스트](/path)` 마크다운 링크 |

화이트리스트 (안전):
- 인라인 코드 백틱 `` `<1.0` ``
- 펜스 코드 블록
- 마크다운 링크 `[/complex/[no]](/search)` (`](` lookahead 통과)

규칙 본체: [.claude/rules/web-rules.md](.claude/rules/web-rules.md) §mdx 발행 규칙.
가드 본체: [frontend/scripts/check-mdx-jsx.mjs](frontend/scripts/check-mdx-jsx.mjs).
회귀 테스트: [frontend/scripts/__tests__/check-mdx-jsx.test.mjs](frontend/scripts/__tests__/check-mdx-jsx.test.mjs) (6 케이스).

## bypass (`--no-verify`) 금지

긴급 hotfix 외에는 hook 우회 금지. 162·163·164 사고 답습:

- 162 (2026-05-13): blog #18 detail-bars-guide 출시 시 raw `<1.0`/`>65` JSX 충돌로 Turbopack build 실패 → CI 3 차례 + 사후 fix 2 커밋 발생
- 163 (2026-05-13): GATE 10 자동화 가드 인프라 신설 (가드 본체 + npm script + CI step + vitest 4 케이스)
- 164 (2026-05-14): PATTERNS 3종 → 5종 확장 (<=숫자, >=숫자 ASCII 추가)
- 165 (2026-05-15): pre-commit hook (husky v9) 로컬 차단 추가 = CI 도달 전 0차 차단 완성

bypass 가 필요한 정당한 사례 (긴급 hotfix·CI 자체 장애 우회 등) 외에는 hook 결과를 정정한 뒤 다시 commit 합니다.

## CI 이중 안전망

pre-commit hook 외에 GitHub Actions CI 의 frontend job 에도 `Mdx-JSX guard` step 이 동일하게 운영됩니다 ([.github/workflows/ci.yml](.github/workflows/ci.yml)). 로컬 hook 이 우회되어도 CI 가 PR·main push 단계에서 차단합니다.

## 의문 사항

가드 false positive 의심·신규 패턴 추가 제안은 issue 또는 PR 본문에 162 fix1(11a0891)·fix2(2264226)·164 확장(8d65daa) 커밋 답습 후 작성해 주세요.
