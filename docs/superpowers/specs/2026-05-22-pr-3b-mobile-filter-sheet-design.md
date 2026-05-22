# PR 3b — 모바일 shadcn Sheet 필터 (`/complex/[no]`)

> **상위 spec**: [docs/superpowers/specs/2026-05-20-2upekr-redesign-design.md L319-327](2026-05-20-2upekr-redesign-design.md) — PR 3 잔여 = 모바일 바텀시트 필터.

> **plan 파일**: `C:\Users\user\.claude\plans\1-soft-valiant.md` (v4 - 9-GATE 통과). 본 문서는 plan v4 의 spec 분리본.

## 9-GATE 통과 결과 (요약)

| GATE | 항목 | 최종 |
|------|------|------|
| 0 | Sonnet 크기 (단계 3 → 3-A·3-B 분할) | 🟢 |
| 1 | 영향 범위 실측 (18 항목 깨짐 0) | 🟢 |
| 2 | 실행 순서·의존 | 🟢 |
| 3 | 완전성 (trade-off #8 박제) | 🟢 |
| 4 | 적정성 | 🟢 |
| 5 | 보안 (XSS·SQL·민감정보 0) | 🟢 |
| 6 | 프↔백↔DB (25 필드 매핑 완전) | 🟢 |
| 7 | 롤백 안전성 | 🟢 |
| 8 | UX·확장성 (globals.css svh 폴백) | 🟢 |

## Context

### 왜 이 변경?

- spec PR 3 L327 잔여 = 모바일 바텀시트 필터. PR 3a (`62ce102`) 가 정보 위계·인쇄 완료, PR 3b 가 모바일 UX 마무리.
- 현재 FilterBar (151줄) + filter/*.tsx (620줄) **모바일 분기 0건** — 7개 가로 FilterDropdown 이 모바일에서 줄바꿈되어 답답.
- viewport 분기 골격은 page.tsx:272-278 에 이미 존재 (filterOpen + md:hidden + hidden md:block).
- 세션 215 박제 = vaul 2025 하반기 unmaintained → **shadcn Sheet** 로 대체.

### 사용자 결정

| # | 항목 | 결정 |
|---|------|------|
| 1 | 모바일 임계점 | md (768px) 미만 |
| 2 | 트리거 위치·형태 | 상단 (인라인, sticky 별도 PR) + 필터 개수 배지 |
| 3 | Sheet 내용 범위 | 필터 7종 + 정렬 + Preset 전부 |
| 4 | 구현 구조 | B안 (FilterBarMobileSheet 신규 + filter/* 재사용) |
| 5 | reducer 공유 | a안 (각자 reducer, URL=SSOT) |
| 6 | 트리거 아이콘 | SlidersHorizontal (lucide-react ^1.16.0) |
| 7 | Sheet title | "필터" (정렬은 DetailSection 안) |
| 8 | Footer 버튼 | 좌 [초기화 outline] · 우 [결과 보기 default] |

## Critical Files

| 경로 | 변경 | 추정 라인 | 단계 |
|------|------|-----------|------|
| `frontend/src/components/ui/sheet.tsx` | 신규 (shadcn 자동) | 138 | 1 |
| `frontend/src/app/globals.css` | 수정 (svh 폴백) | +5 | 1 |
| `frontend/src/components/filter/activeCount.ts` | 신규 | ~35 | 2 |
| `frontend/src/components/filter/__tests__/activeCount.test.ts` | 신규 | ~60 | 2 |
| `frontend/src/components/FilterBarMobileSheet.tsx` (3-A 골격) | 신규 | ~150 | 3-A |
| `frontend/src/components/FilterBarMobileSheet.tsx` (3-B 추가) | 수정 | +30 | 3-B |
| `frontend/src/components/__tests__/FilterBarMobileSheet.test.tsx` | 신규 | ~150 | 4 |
| `frontend/src/app/complex/[no]/page.tsx` | 수정 | +3 / -0 | 5 |
| `frontend/src/app/complex/[no]/__tests__/page-hierarchy.test.tsx` | 수정 | +12 | 6 |
| `frontend/e2e/responsive.spec.ts` | 수정 | +18 | 7 |

**합계** (자동 sheet.tsx 138줄 제외): 신규 ~395줄 + 수정 ~33줄 + globals.css +5 = **~433줄**.

## 답습할 기존 자산

- `filter/reducer.ts:48/68/95` — DEFAULT_STATE/filterReducer/buildInitState
- `filter/FilterSections.tsx` 7 named export (TradeType/Price/Area/Floor/MoveIn/Room/DetailSection)
- `filter/emitFilters.ts:8-91` — buildArticleFilters (FilterState→ArticleFilters 25 필드 완전 매핑)
- `hooks/useFilterParams.ts:127-137` — setFilters 의 FILTER_KEYS 만 delete → keyword 자동 보존
- `hooks/useFilterParams.ts:33-57` — parseFiltersFromParams (INT/FLOAT/BOOL/sort_by 화이트리스트 → XSS·Injection 안전)
- `ui/button, badge, separator` — PR 1·3a 도입
- `src/test-setup.ts:10-18` — jsdom Radix 폴리필 (Sheet 도 통용)
- `lucide-react ^1.16.0` SlidersHorizontal · `radix-ui ^1.4.3` umbrella · `lib/utils.ts cn()`
- `page.tsx:50, 272-278` — `filterOpen` + viewport 분기 골격
- `lib/constants.ts:83` — `DEBOUNCE_MS = 300`
- `Header.tsx:101` — `document.querySelector('[role="menu"]')` 직접 패턴 (test 답습)

## 정정·보강 13 + 8건

### 정정 13건 (v1→v2→v3→v4 누적)

1. SheetTitle h2 회귀 → `<SheetTitle asChild><h3>필터</h3></SheetTitle>` 강제
2. vitest md:hidden 검증 불가 → e2e mobile smoke 필수
3. activeCount detailActive drift → `calcDetailActive` 헬퍼 export
4. page.tsx 변수명 = `filterOpen` (v2 의 `filtersExpanded` 오인 정정)
5. Sheet 닫힘 보증 → popstate useEffect + debounce cleanup
6. a11y aria-label · 배지 layout shift 방지 (`min-w-6`)
7. Header.test.tsx 답습 = `document.querySelector('[role="menu"]')` 직접
8. Sheet 인쇄 출력 방지 → SheetContent 에 `no-print` 클래스
9. 디바운스 race · 배지 lag → `flushDebounce` + `activeFilterCountImmediate`
10. useFilterParams keyword 보존 (자동 해소, useFilterParams.ts:127-137 실측)
11. 단계 3 분할 (3-A 골격 150 + 3-B race 30) — GATE 0
12. 트리거 "상단 고정" trade-off #8 박제 — GATE 3
13. iOS Safari svh 폴백 globals.css `@supports` — GATE 8

### 보강 8건

1. iOS Safari svh + globals.css `@supports` 폴백
2. components.json git diff 확인 (변경 0 검증)
3. FilterBar.test.tsx 57 케이스 (12 describe) 정확 표현
4. Sheet `showCloseButton={false}` (footer 와 시각 중복 방지)
5. Trade-off 박제 8건 누적
6. SheetDescription a11y `sr-only`
7. playwright `--webpack` flag 제거 (Next 16 기본 webpack)
8. Bundle size 측정 (선택, npm run build)

## Build Sequence (10 단계)

### 단계 1 — shadcn Sheet + globals.css svh 폴백

```bash
cd frontend
npx shadcn@latest add sheet
git diff components.json package.json   # 변경 0 확인
```

`frontend/src/app/globals.css` 끝에:

```css
/* iOS Safari < 15 svh 폴백 (PR 3b) */
@supports not (height: 85svh) {
  [data-slot="sheet-content"] {
    max-height: min(85vh, calc(100vh - 44px)) !important;
  }
}
```

### 단계 2 — filter/activeCount.ts + 테스트

`activeCount.ts`: `calcDetailActive`, `activeFilterCount`, `activeFilterCountImmediate` 3 export.

`activeCount.test.ts`: 10 케이스.

### 단계 3-A — FilterBarMobileSheet 골격 (~150줄)

FilterBar.tsx:22-83 답습 + Sheet JSX + a11y + popstate / debounce cleanup useEffect 2개.

### 단계 3-B — flushDebounce + no-print (+30줄)

```tsx
const flushDebounce = useCallback(() => {
  Object.values(debounceMapRef.current).forEach(clearTimeout);
  emitChangeRef.current({});
}, []);

// "결과 보기" onClick:
onClick={() => { flushDebounce(); setOpen(false); }}
```

SheetContent `className` 에 `no-print`.

### 단계 4 — FilterBarMobileSheet.test.tsx (9 케이스)

1. 트리거 렌더 + aria-label "필터 창 열기"
2. 활성 0 시 배지 미표시
3. 활성 N 시 배지 N + aria-label "필터 창 열기 (활성 N개)"
4. 트리거 클릭 → Sheet 열림 (`document.querySelector('[role="dialog"]')`)
5. SheetTitle "필터" h3 + SheetDescription sr-only
6. 거래유형 매매 → onChange 즉시
7. minPrice → 300ms 디바운스 → 결과 보기 → flushDebounce → onChange
8. 초기화 → onChange({}) + 배지 0
9. 결과 보기 → Sheet 닫힘

### 단계 5 — page.tsx 임베드 (+3 / -0)

`page.tsx:268-279`:
- line 20 근방: import 추가
- line 271 직전: `<FilterBarMobileSheet key={`mobile-${navKey}`} ... />`
- line 272: `md:hidden` → `hidden md:flex`
- line 276: `filterOpen ? "" : "hidden md:block"` → `filterOpen ? "hidden md:block" : "hidden"`

### 단계 6 — page-hierarchy.test.tsx 모바일 가드 (+12)

h2 4개 유지 + h3 "필터" 1개 케이스 추가.

### 단계 7 — e2e responsive.spec.ts smoke (+8)

> ★ 정정 14: 본 spec v4 의 단계 7 예제는 `/complex/12345` seed 데이터
> 의존 (트리거 노출·클릭·SheetTitle h3 확인) — BE 데이터 없으면
> ComplexLoadState 에 멈춰 flaky. SheetTrigger·열기·닫기 인터랙션
> 검증은 jsdom vitest (단계 4 9 케이스 + 단계 6 트리거 임베드 가드) 가
> 더 안정적. e2e 는 응답 코드·헤더 가시성 smoke 만.

```ts
test("모바일 — /complex/[no] 진입 응답 200 + 헤더 (PR 3b smoke)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const res = await page.goto("/complex/12345");
  expect(res?.status()).toBeLessThan(500);
  await expectHeader(page);
});
```

### 단계 8 — 전체 회귀 검증

```bash
cd frontend
npx tsc --noEmit       # 0 error
npm run lint           # 0 warning
npm test -- --run      # 1388 → 1404 (+16)
npm run build          # PASS
```

### 단계 9 — PR 생성 + 머지

```bash
git checkout -b feat/pr-3b-mobile-filter-sheet
git add (9 파일)
git commit -m "feat(complex): 모바일 shadcn Sheet 필터 (PR 3b)"
git push -u origin feat/pr-3b-mobile-filter-sheet
gh pr create ...
```

### 단계 10 — Post-merge QA (1주일 내)

iOS 13-14 svh 폴백 / iOS 15+ 키보드 + footer / Android Chrome 동작 / 인쇄 / popstate / pathname 변경 / 새로고침 state 복원.

## Verification

### 모바일 (375×667 iPhone SE, DevTools)

1. 상단 "필터" 버튼 + 배지 0
2. 탭 → Sheet 슬라이드업, SheetTitle "필터" h3 + 7섹션
3. **immediate** "매매" → URL 즉시 + 배지 1
4. **debounced** minPrice "30000" → 배지 변동 0, 300ms 후 URL 반영
5. "결과 보기" → flushDebounce → URL 즉시 + Sheet 닫힘
6. popstate / pathname / 인쇄 → 박제 답습

### 데스크탑 (1280×720)

기존 FilterBar 그대로, MobileSheet 완전 비노출, baseline bit-identical.

## Trade-offs (8건 박제)

1. viewport 경계 디바운스 손실 (희박, reducer hoist 별도 PR)
2. iOS Safari < 15 svh 미지원 → globals.css @supports 폴백
3. 모바일 baseline 0건 (smoke only, admin-mobile project 별도 PR)
4. detailSummary 미공유 (FilterBar 로컬, MobileSheet 는 calcDetailActive 만)
5. Sheet 안 정렬 변경 시 즉시 결과 미표시 ("결과 보기" 명시)
6. 결과 0건일 때 Footer "결과 보기" 텍스트 고정
7. 배지 = setImmediate 필터만 (debounced 필드는 배지 즉시 미증가)
8. 트리거 = 인라인 (스크롤 시 화면 밖). sticky 적용은 별도 PR.

## 다음 단계 (PR 3b 머지 후)

- PR 3b 후속 (선택) — sticky 트리거 (trade-off #8)
- PR 4 — `/search` 검색·필터 (FilterBarMobileSheet 재사용 가능성)
- PR 5 — `/tools/*` 7종 입력·결과
- PR 6 — `/dashboard` + driver.js 온보딩
- PR 7 — `/pricing` + 인증 페이지
