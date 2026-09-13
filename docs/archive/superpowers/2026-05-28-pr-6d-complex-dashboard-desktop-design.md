# PR 6d — 단지 상세 대시보드 데스크톱 통합 (모바일·데스크톱 단일 컴포넌트)

작성일: 2026-05-28 · 세션 246 · 브랜치 `feat/pr-6d-complex-dashboard-desktop`

## Context (왜 만드는가)

세션 244·245 PR 6c 머지 (커밋 02ee768) 후 `/complex/[no]` 모바일 화면은 박스 2×2 + 별도 펼침 영역 패턴 = "한눈에 핵심 4 지표 + 클릭해서 깊이" 흐름으로 정착. 같은 페이지의 **데스크톱 (md+) 화면은 여전히 옛 구조** = `hidden md:block` 으로 4 섹션 (시세 + 매물 + 차트 + 단지 정보) 이 위에서 아래로 길게 펼쳐짐.

사용자 명시 (2026-05-28) = "PC 버전에서도 4 등분해서 클릭하면 펼쳐지게 하는게 어때". 이유 추정:

1. 모바일 PR 6c 패턴이 PC 24인치 환경에서도 자연스럽게 작동 = 정보 위계 단일화
2. 현재 데스크톱은 페이지 시작 시 시세 차트가 바로 보이고 매물 섹션까지 마우스 스크롤 필요 = 매물 도착이 느림 (매물이 핵심 정보)
3. 보조 자료 (시세·차트·단지 정보·면적별 시세) 가 항상 펼쳐져 있어 페이지가 너무 김

## 사용자 명시 결정 사항 (2026-05-28 답습)

| 항목 | 결정 |
| --- | --- |
| 데스크톱 적용 | PR 6c 패턴 그대로 = 박스 2×2 바둑판 + 매물 섹션은 하단 유지 |
| 4 박스 라벨 | 시세 · 실거래가 · 단지정보 · 면적별 시세 (모바일 동일) |
| 컴포넌트 명명 | `ComplexDashboardMobile` → **`ComplexDashboard`** 로 리네임 (모바일·데스크톱 단일 컴포넌트, drift 방지) |
| 호출처 (page.tsx) | `md:hidden` 제거 = 모든 화면 크기에서 `ComplexDashboard` 노출. 기존 `hidden md:block` 4 섹션 제거 |
| 매물 섹션 | 그대로 (md:hidden / hidden md:block 분기 변경 없음) = 페이지 하단 유지 |

## 비결정 사항 (구현 단계에서 결정)

- 박스 padding/font 데스크톱 전용 조정 = Tailwind `md:p-4 md:text-base` 등 prefix 활용. 모바일과 자연 같은 크기여도 무방. 본 spec 에서는 결정하지 않고 plan/구현 단계의 시각 검증으로 확정.
- 펼친 본문의 너비 = 그리드 외부 (가로 전체) 패턴 그대로 유지 (PR 6c F1·F2 답습 = 그리드 셀 안 갇힘 방지)

## 변경 파일 (실측 4 파일)

| 파일 | 변경 | 예상 줄 |
| --- | --- | --- |
| `frontend/src/components/complex/ComplexDashboardMobile.tsx` | 파일명 `ComplexDashboard.tsx` 로 rename + 컴포넌트명 정정 + JSDoc 갱신 | rename + 5줄 |
| `frontend/src/components/complex/__tests__/ComplexDashboardMobile.test.tsx` | 파일명 + import + describe 정정 | rename + 10줄 |
| `frontend/src/app/complex/[no]/page.tsx` | import 정정 + `md:hidden` 제거 + 기존 `hidden md:block` 3 섹션 + Separator 3개 삭제 | -65 / +2 |
| `frontend/src/hooks/__tests__/useComplexArticleAvg.test.ts` | 변경 없음 (훅은 그대로) | 0 |

## 데스크톱 page.tsx 변경 상세

### Before (현재)

```tsx
{complex && (
  <div className="md:hidden">
    <ComplexDashboardMobile complex={complex} complexNo={complexNo} ... />
  </div>
)}

{/* 🥇 시세 (가격 강조) */}
<section className="space-y-4 hidden md:block">
  <h2>시세</h2>
  <ComplexPriceFloorSection ... />
  <ComplexPriceAreaSection ... />
</section>

<Separator className="no-print hidden md:block" />

{/* 🥈 매물 리스트 */}
<section> ... </section>

<Separator className="no-print hidden md:block" />

{/* 🥉 차트 */}
<section className="hidden md:block">
  <h2>실거래가 추이</h2>
  <PriceChartSection ... />
</section>

<Separator className="no-print hidden md:block" />

{/* 🏷 단지 정보 */}
<section className="hidden md:block">
  <h2>단지 정보</h2>
  <ComplexBasicInfo ... />
  <PyeongDetailsList ... />
</section>
```

### After (정정 후)

```tsx
{complex && (
  <ComplexDashboard complex={complex} complexNo={complexNo} ... />
)}

{/* 🥈 매물 리스트 — 모바일·데스크톱 공통 (기존 그대로) */}
<section> ... </section>

{/* 시세·차트·단지정보·면적별 시세 = 박스 4개 안에서 모두 표시되므로 별도 섹션 제거 */}
```

핵심 변경:
- `md:hidden` 래퍼 제거 = 모든 화면에서 `ComplexDashboard` 노출
- 3 섹션 (`hidden md:block` 시세 + 차트 + 단지 정보) + Separator 3개 완전 제거 = 페이지 -65줄
- 매물 섹션 (line 274~398) = 변경 없음 (그대로 페이지 하단)
- 모바일 인쇄 모드도 자연 적용 (박스 펼침 영역도 인쇄 됨)

## 인쇄 영향 (no-print 분석)

기존 데스크톱 4 섹션 = 인쇄 시 모두 노출 (no-print 클래스 없음). PR 6d 후 = 박스 4개는 닫혀 있으면 4 박스만 노출, 펼쳐진 박스만 본문 인쇄. 사용자가 인쇄 전 원하는 박스를 펼치는 추가 절차 발생.

대안 = 인쇄 시 모든 박스 자동 펼침 (`@media print` 에서 `openSection` 무관하게 모든 AccordionContent 노출). PR 6c 의 cmd+P 동작 답습. **결정 = plan 단계에서 시각 검증 + 인쇄 모드 시연 후 결정**.

## 디자인 잣대 점검 (`2026-05-20-2upekr-redesign-design.md` §최우선 잣대)

| 잣대 | 평가 |
| --- | --- |
| 매일 쓸 때 편한가 | ✅ 매물 도착 시간 단축 (스크롤 1회 = 박스 4개 위 = 매물 헤더) |
| 첫 5분에 핵심 가치 경험 | ✅ 박스 4개 = 한눈에 시세·실거래가·단지·평형 파악 |
| 고객 동석 시 즉답 | ✅ 박스 클릭 = 즉시 펼침 (마우스 1회) |
| 노안 시작 사용자 (40~60대) | 🟡 박스 글자 크기 = Tailwind 기본 `text-sm`. 데스크톱에서 `md:text-base` 권장 (plan 단계 결정) |
| 전문가다운 시각 신뢰 | ✅ 박스 + 펼침 = 정형 디자인 시스템 답습 |

5 잣대 중 4 ✅ + 1 🟡 (plan 단계 시각 결정). 통과.

## 자가 점검 §11 (PR 6c 답습)

| 점검 | 답변 |
| --- | --- |
| 모바일 영향? | 변경 없음 (ComplexDashboard 컴포넌트 자체는 동일) |
| useComplexArticleAvg 훅 영향? | 없음 (호출 시점·횟수 동일) |
| 매물 섹션 영향? | 없음 (`md:hidden / hidden md:block` 분기 그대로) |
| 기존 4 섹션 데이터 매핑 누락? | 시세 = 박스 1, 차트 = 박스 2, 단지정보 = 박스 3, 면적별 시세 = 박스 4. 1:1 매핑 완전 |
| ComplexDashboard 가 받는 props? | 그대로 (`complex` / `complexNo` / `pyeongDetails` / `sessionToken` / `onFilterChange` 5종) |
| `hidden md:block` 4 섹션의 다른 호출처? | grep 의무. 본 spec 단정 = 0 = 부재. plan 단계에서 grep 실측 |

## 우선순위 의존

- PR #82 (md drift 정정) 머지 완료 = main 기준
- 관리자 대시보드 = 별도 PR 6e (다음 세션 또는 본 세션 다른 트랙)

## 인접 작업 (본 PR 영역 외)

- 매물 카드 중간 모양 차별화 = PR 6f 후보 (세션 244 결정)
- 데스크톱 4 섹션 안에 있던 인쇄 동작 (`@media print expandAll`) 정정 = 본 PR 단계 D 후보

## Cross-link

- PR 6c spec = `docs/superpowers/specs/2026-05-27-pr-6b-empty-state-design.md` (이전 sibling)
- 디자인 리뉴얼 진실의 원천 = `docs/superpowers/specs/2026-05-20-2upekr-redesign-design.md`
- 컴포넌트 = `frontend/src/components/complex/ComplexDashboardMobile.tsx` (PR 6c 신설)
- 페이지 = `frontend/src/app/complex/[no]/page.tsx` (line 248~257, 261~424)
