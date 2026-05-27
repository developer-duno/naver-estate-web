# PR 6b — EmptyState 컴포넌트 5 곳 광범위 적용

작성일: 2026-05-27 · 세션 244 · 브랜치 `feat/pr-6b-empty-state-5slots`

## Context

세션 244 시작 블록 §7 사용자 명시 1순위. 현재 `frontend/src/components/ui/empty-state.tsx` 컴포넌트는 세션 220 PR #47 도입 이후 `/compare` 1 곳만 사용. 다른 사용자 가시 핫패스 (mibunyang 테이블·매물 리스트) 의 빈 상태는 단순 회색 텍스트 1 줄 또는 분기 분산 패턴으로:

- 액션 유도 약함 (mb/* 3 곳 = "X 데이터가 없습니다." 1 줄만)
- 도메인 컨텍스트 안내 0 (아이콘·설명 없음)
- silent UX 결점 (구독자가 "왜 비었는지" 알 수 없음)

**의도**: 5 호출처 통일된 빈 상태 안내 = 도메인 아이콘 + 공감형 title + 행동 유도 description. ArticleTable/Mobile 필터 활성 분기 100% 보존. EmptyState 컴포넌트 자체 변경 0 = 광역 확장 위험 0.

## 사용자 명시 결정 사항 (답습)

| 항목 | 결정 |
|---|---|
| 적용 범위 | 5 곳 큰 목록만 (mb/* 3 + Article 2). CompareCharts 3 줄 원본 유지 |
| 분기 처리 | 호출처에서 props 계산. EmptyState 컴포넌트 자체 변경 0 |
| 아이콘 | Building / TrendingUp / MapPin / Search / Search |
| 카피 톤 | 공감형 친근 + 행동 유도 description (title/description 2 분할) |
| PR 분할 | 1 PR + 단계 2 커밋 분리 |

## 변경 파일 (10 파일, 단계 2 커밋 분리)

### 단계 1 커밋 (`b8ec00e`)

| 파일 | 변경 |
|---|---|
| `frontend/src/components/mb/MbApartmentTable.tsx` | 빈 분기 → EmptyState (icon=Building) |
| `frontend/src/components/mb/MbTradeTable.tsx` | 빈 분기 → EmptyState (icon=TrendingUp) |
| `frontend/src/components/mb/MbRegionStatsTable.tsx` | 빈 분기 → EmptyState (icon=MapPin) |
| `frontend/src/components/mb/__tests__/MbApartmentTable.test.tsx` | 카피 1 줄 갱신 |
| `frontend/src/components/mb/__tests__/MbRegionStatsTable.test.tsx` | 카피 1 줄 갱신 |

### 단계 2 커밋 (`d8c5513`)

| 파일 | 변경 |
|---|---|
| `frontend/src/components/ArticleTable.tsx` | 빈 분기 22 줄 → EmptyState + hasActiveFilters props 계산 |
| `frontend/src/components/ArticleCardMobile.tsx` | 동일 |
| `frontend/src/components/__tests__/ArticleTable.test.tsx` | 빈 매물 매처 갱신 ("매물이 없어요" 추가) |
| `frontend/src/components/__tests__/ArticleCardMobile.test.tsx` | 동일 |
| `frontend/src/components/__tests__/MbApartmentTable.test.tsx` | 구 위치 별개 파일 카피 정정 (plan v1 빈틈 박제) |

## 카피·아이콘 SSOT (spec drift 방지)

### mb/* 3 곳 (단순 빈 상태)

| 파일 | icon | title | description |
|---|---|---|---|
| MbApartmentTable | `Building` | 표시할 미분양 단지가 없어요 | 조건을 바꿔보거나 잠시 후 다시 조회해주세요 |
| MbTradeTable | `TrendingUp` | 표시할 실거래가 없어요 | 조건을 바꿔보거나 잠시 후 다시 조회해주세요 |
| MbRegionStatsTable | `MapPin` | 표시할 지역 통계가 없어요 | 조건을 바꿔보거나 잠시 후 다시 조회해주세요 |

### Article 2 곳 (필터 활성/비활성 2 분기)

| 분기 | icon | title | description | action |
|---|---|---|---|---|
| 필터 활성 + onResetFilters 있음 | Search | 조건에 맞는 매물이 없어요 | 필터 조건이 너무 좁을 수 있어요 | [필터 초기화] 버튼 |
| 필터 활성 + onResetFilters 없음 | Search | 조건에 맞는 매물이 없어요 | 필터 조건이 너무 좁을 수 있어요 | 없음 |
| 필터 비활성 | Search | 표시할 매물이 없어요 | 위의 "데이터 갱신" 버튼을 눌러보세요 | 없음 |

## 기존 자산 재활용 (CLAUDE.md §2 Simplicity)

- `frontend/src/components/ui/empty-state.tsx` — 변경 0, 그대로 재사용
- `lucide-react` Building/TrendingUp/MapPin/Search — 신규 dep 0
- 기존 테스트 5 파일 (단계 1 = mb/* 3 중 2 + 단계 2 = Article 2 + 구 위치 1) 카피만 갱신, 신규 파일 0

## 검증

```bash
cd frontend && npx tsc --noEmit  # PASS
cd frontend && npm run lint       # 0 errors (1 warning = 기존 ArticleTable useReactTable, 본 PR 무관)
cd frontend && npx vitest run     # 165 파일 1505 테스트 PASS, 회귀 0
```

## plan v1 빈틈 박제 (사용자 명시 잣대 답습)

**사건**: 단계 1 vitest 부분 검증 (`npx vitest run src/components/mb`) 은 통과했으나, 전체 검증 시 별개 위치 `src/components/__tests__/MbApartmentTable.test.tsx` (구 위치) 1 케이스 회귀 발견. plan v1 의 변경 파일 표 #4 (`components/mb/__tests__/MbApartmentTable.test.tsx`) 만 grep 했고 같은 이름의 구 위치는 누락.

**박제 룰** (자가 점검 §11):
- 테스트 파일 grep 시 `find src/components -name "<Name>.test.tsx"` 로 전체 위치 동시 확인 의무
- 부분 vitest (`run src/components/mb`) 는 단계 1 검증으로 부족 → 단계 N 마지막 = 전체 vitest 의무
- "테스트 파일 1 곳" 단정 = grep 빈틈 위험. 같은 컴포넌트의 별개 위치 테스트 파일 존재 가능

## 위험·완화 답습

| 위험 | 결과 |
|---|---|
| Article 분기 props UX 회귀 (필터 초기화 버튼 사라짐) | ✅ 단계 2 vitest 회귀 0 |
| 새 카피 spec drift | ✅ 본 spec 표 + plan 표 + 커밋 메시지 카피 1 줄 인용 = SSOT 3중 |
| visual regression (e2e baseline) | EmptyState 자체 변경 0 = baseline 영향 없을 가능성. CI workflow_dispatch 답습 (세션 213·237·241) — 본 PR CI 가 fail 시 update_snapshots 갱신 |
| 10 파일 = planning.md '3 파일 이하' 룰 위반 | ✅ 1 PR + 단계 2 커밋 분리. 단계 당 5 파일 |

## 후속 백로그

- PR 6c: monitor.py 채움률 임계 알림 (monitor_alerts V026 활용)
- PR 6d: starlette <1.1 → <2 상향 (1.1.0 출시 후 안정성 검증)
- PR 6e: CLAUDE.md 카운트 자동 갱신 스크립트
