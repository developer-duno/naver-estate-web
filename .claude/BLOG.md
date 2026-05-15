# Blog 라인업 — `/blog` MDX 박제 (단일 진실 공급원)

> 19편 발행 (draft 0편). posts.ts BlogCategory 4종 = 시세 분석 / 세금 / 도구 활용 / 미분양.
> 새 글 발행 시 본 파일 표 1행 + 발행일 git log 실측 동시 갱신 의무.

## 발행 글 19편 (BlogCategory 4종)

### 시세 분석 (4편)

| slug | 제목 | 발행일 |
|---|---|---|
| `jeonse-ratio` | 전세가율 계산법과 활용 — 공인중개사 실무 가이드 | 2026-05-02 |
| `complex-price-analysis` | 단지 시세 분석법 — 평당가·시세 추이·비교 줄세우기 | 2026-05-02 |
| `asking-vs-actual-price` | 호가 vs 실거래가 — 손님 협상 카드 1장으로 5천만원 절약 | 2026-05-08 |
| `buy-timing-signals` | 매수 타이밍 신호 — 시세 추이 + 거래량 + 미분양율 3 축 5분 판독법 | 2026-05-13 |

### 세금 (3편)

| slug | 제목 | 발행일 |
|---|---|---|
| `realestate-calculators` | 부동산 세금·금융 계산기 모음 — 5종 출시 완료 | 2026-05-02 |
| `transfer-tax-guide` | 양도소득세 계산기 출시 — 13 필드·6 분기 자동 판정 | 2026-05-03 |
| `property-tax-guide` | 보유세 계산기 출시 — 재산세 + 종부세 5 필드 4 분기 자동 판정 | 2026-05-03 |

### 도구 활용 (8편)

| slug | 제목 | 발행일 |
|---|---|---|
| `realtime-listing` | 네이버 매물 실시간 조회 노하우 | 2026-05-02 |
| `compare-workflow` | /compare 24행 비교 — 4단지 줄세우기 5분 워크플로 | 2026-05-07 |
| `acquisition-tax-tool-guide` | 취득세 계산기 사용법 — 손님 30초 응대 워크플로 | 2026-05-08 |
| `transfer-tax-tool-guide` | 양도세 계산기 사용법 — 손님 30초 응대 워크플로 | 2026-05-08 |
| `property-tax-tool-guide` | 보유세 계산기 사용법 — 손님 30초 응대 워크플로 | 2026-05-08 |
| `agent-verification-guide` | 공인중개사 인증 5분 가이드 — B2B 구독 가입 첫 단계 | 2026-05-09 |
| `search-history-workflow` | 검색 히스토리 활용법 — 손님 재방문 5분 응대 | 2026-05-13 |
| `print-excel-workflow` | 인쇄·엑셀 내보내기 노하우 — 손님 응대 자료 1분 워크플로 | 2026-05-13 |

### 미분양 (4편)

| slug | 제목 | 발행일 |
|---|---|---|
| `mibunyang-for-agents` | 공인중개사를 위한 미분양 단지 활용법 | 2026-05-02 |
| `mibunyang-radar-weights` | 미분양 레이더 가중치 활용법 — 손님 성향별 우위 단지 30초에 줄세우기 | 2026-05-08 |
| `mibunyang-detail-bars-guide` | 미분양 상세 진행바 8종 30초 독법 — 손님 응대 카드 | 2026-05-13 |
| `mibunyang-price-discount-guide` | 미분양 분양가·할인율·평당가 한눈에 비교하는 법 — 집 사려는 분의 첫 가이드 | 2026-05-16 |

## /blog 페이지 빌드 메커니즘

- **MDX dynamic import**: `@/content/blog/${slug}.mdx`
- **generateStaticParams** + **dynamicParams=false** (Next 16 정석)
- **mdx-components.tsx** 14종 매핑 (img→next/Image 강제, 외부 a→target=\_blank rel=noopener)
- **draft 미사용** = 19편 전부 발행 (영구 제외 박제: "draft N편" 표현 금지)

## 새 글 발행 4단 절차 (의무)

1. **mdx 본문 작성** — `frontend/src/content/blog/<slug>.mdx`
   - mdx-components.tsx 14종 답습 (img / h1~h6 / table / a / code 등)
   - 본문 길이 = 도구 활용 카테고리 ~120~140줄, 시세·세금 ~80~120줄 답습
2. **posts.ts 1행 추가** — `frontend/src/app/blog/posts.ts`
   - `slug` (kebab-case) / `title` / `category` (BlogCategory 4종 中 1) / `description` / `date` (YYYY-MM-DD) / `readingTime` (분 단위 추정)
   - publishedSlugs 알파벳 자동 정렬 (`.sort()` 호출)
3. **blog.test.tsx 회귀 가드** — `frontend/src/app/__tests__/blog.test.tsx`
   - 라벨 "현재 N편" 갱신 / publishedSlugs 카운트 +1 / Set size +1 / 신규 메타 it 블록 (slug + category + date 단언)
4. **BLOG.md 표 1행 + 발행일 git log 실측 동시 갱신**
   - 발행일 = `git log --format=%ad --date=short --diff-filter=A -- frontend/src/content/blog/<slug>.mdx | tail -1`
   - 카테고리 표 中 해당 카테고리에 alphabetic 또는 발행일 순으로 1행 삽입

## 카테고리별 다음 후보 (세션 125 박제 + 167 갱신)

- 시세 분석 5편째: 평당가 비교 워크플로 / 호가 변동 추이
- 세금 4편째: 종부세 합산배제 가이드 / 부부 공동명의 절세 전략 / 임대주택 세제 혜택
- 도구 활용 9편째: (현재 8편 = 도구 5종 사용법 + 비교/검색/인쇄 워크플로 커버) 추가 후보 협의
- 미분양 5편째: 미분양 추이 차트 활용 / 즐겨찾기 일괄 비교 / 단지 상세 9 단원 도해

## 회귀 가드 (영구 제외 박제 답습)

- "draft N편" 표현 금지 (15편 전부 발행, draft 미사용)
- 미분양 지도 뷰 / 비교 4→6~8 확장 = 영구 제외 (사용자 명시 제외)
- 6번째 도구 도입 = 영구 제외 (사용자 명시 요청 0)
