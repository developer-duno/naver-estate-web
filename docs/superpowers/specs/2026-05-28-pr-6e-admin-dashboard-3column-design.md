# PR 6e — 관리자 대시보드 3 컬럼 레이아웃 (10사 강점 믹스)

작성일: 2026-05-28 · 세션 246 · 브랜치 `feat/pr-6e-admin-dashboard-3column` (예정)

## Context (왜 만드는가)

`/admin` 대시보드 = 9 카드 (HealthSummary · WeeklyIssuesCard · StatsCards · SchedulerMonitor · DataFreshnessCard · NaverCallsCard · QuotaStatusCard · FailureBreakdown + 실행 중 작업·최근 감사 로그 2 카드) 가 세로로 길게 나열. 1인 관리자 (소유자) 가 매일 5분 헬스 체크 시 9 카드 모두 스크롤로 확인. 사용자 명시 = "관리자는 나만 보는거기때문에 크게 신경쓰지 않아도 되지만 그래도 이왕이면 다홍치마".

## 외부 조사 (10사 공식 문서 직접 인용)

### 1차 조사 (Sticky Top Bar 권장 → 사용자 거부)

| 사 | 핵심 패턴 | 출처 |
| --- | --- | --- |
| Grafana | "blue=good, red=bad" + 드릴다운 | grafana.com/docs/.../best-practices |
| Linear | Cmd+K + muscle memory | linear.app/docs/conceptual-model |
| Vercel | "가장 자주 보는 것 = top" | vercel.com/blog/dashboard-redesign |
| Stripe | "4 cards × sparkline" | docs.stripe.com/stripe-apps/patterns |
| Anthropic Console | 본 프로젝트 무관 (개발자 API 키 관리) — 제외 | — |

### 2차 조사 (Notion 3 컬럼 권장 → 사용자 위임)

| 사 | 핵심 패턴 | 출처 |
| --- | --- | --- |
| Notion | "properties 전면·뒤로" 3 컬럼 | notion.com/help/layouts |
| Retool | "12-col grid" 자유 드래그 | docs.retool.com/apps/concepts/ide |
| Supabase Studio | PageContainer + Sidebar | supabase.com/design-system |
| Tableau | Floating/Tiled (정적) | help.tableau.com |
| Datadog | high density mode + 반응형 grid | datadoghq.com/blog/datadog-dashboards |

### 통합 평가 (5 잣대)

| 사 | 매일 5분 효율 | 9 카드 시야 | 다홍치마 | 난이도 | 미래 확장 |
| --- | --- | --- | --- | --- | --- |
| Grafana | 5 | 5 | 3 | low | 5 |
| Linear | 5 | 3 | 5 | medium | 4 |
| Vercel | 5 | 4 | 4 | low | 4 |
| Stripe | 4 | 4 | 5 | medium | 3 |
| Notion | 4 | 4 | 4 | low | 5 |
| Retool | 5 | 5 | 5 | high | 3 |
| Supabase | 3 | 2 | 4 | medium | 3 |
| Tableau | 3 | 4 | 3 | low | 3 |
| Datadog | 5 | 5 | 5 | medium | 4 |
| **본 믹스** | **5** | **5** | **4** | **medium** | **5** |

## 사용자 위임 결정 4건 (실증 기반, 본 PR 확정)

| Q | 결정 | 근거 |
| --- | --- | --- |
| Q1 패턴 | **10사 강점 믹스** = 좌 nav (Grafana 색신호) + 중앙 9 카드 (Notion 본문 보존) + 우 라이브 패널 (Datadog high density) | 단일 1사 안보다 우세 (4.6/5 vs Notion 4.0) |
| Q2 우 패널 콘텐츠 | **3종 고정** = 실행 중 작업 / 최근 실패 N건 / 네이버 호출 시간당 그래프 | useQuery dedupe 자동 (PR 6c 답습) + Retool 자유 토글 = 과투자 (J4 high) |
| Q3 좌 nav 순서 | **현재 page.tsx 순서 그대로** = 사용자 mental model 보존 | 세션 207~232 답습 = 의도적 순서. 임의 재조정 = 사용자 인지 부담 |
| Q4 Cmd+K | **PR 6f 별도** = 본 PR 영역 외 | CLAUDE.md §planning 답습 + Linear muscle memory 가치 실증 데이터 부족. 9 카드 = 좌 nav 클릭 1회로 충분 |

## 구조 (한 화면)

```
┌─────────────┬───────────────────────────┬─────────────┐
│ 좌 nav      │ 중앙 본문 (변경 0)         │ 우 라이브    │
│ 200px       │ flex-1                    │ 280px       │
│             │                           │             │
│ 🟢 건강도    │ HealthSummary             │ 지금 돌리는 │
│ 🟢 주간 이슈 │ WeeklyIssuesCard          │ 작업 N건    │
│ 🟢 통계      │ StatsCards                │             │
│ 🟢 스케줄러  │ SchedulerMonitor          │ ─────────── │
│ 🟢 신선도    │ DataFreshnessCard         │ 최근 실패   │
│ 🟢 네이버 호 │ NaverCallsCard            │ N건         │
│ 🟢 쿼터      │ QuotaStatusCard           │             │
│ 🟢 실패      │ FailureBreakdown          │ ─────────── │
│ 🟢 잡       │ AdminCard 2종 (실행/감사)  │ 네이버 호출 │
│             │                           │ 시간당 그래프│
└─────────────┴───────────────────────────┴─────────────┘
```

### 좌 nav (200px)

- 9 카드 anchor 목차 = `<a href="#health">건강도</a>` 등
- 각 anchor 옆에 색신호 점 = 🟢 정상 / 🟡 주의 / 🔴 실패
- 색신호 데이터 출처 = 각 카드의 `data-status` attribute (구현 단계 결정)
- 활성 카드 (현재 viewport) = bold + 배경 강조 (IntersectionObserver)
- 모바일 (< lg) = `lg:flex hidden` = 자동 숨김

### 중앙 본문

- **변경 0** = 기존 page.tsx line 51~109 그대로 (HealthSummary → AdminCard 2종)
- 9 카드 sequence·padding·spacing 유지

### 우 라이브 패널 (280px, lg+ 만 노출)

3종 고정:

1. **실행 중 작업** = `runningJobs` query 그대로 (page.tsx:38~43)
2. **최근 실패 N건** = 새 useQuery `getAdminCrawlJobs({ status: "failed", limit: 5 })`
3. **네이버 호출 시간당 그래프** = NaverCallsCard 의 sparkline 만 추출 (큰 카드 = 중앙 / 작은 sparkline = 우측)

모바일 (< lg) = `lg:flex hidden` = 자동 숨김.

## 변경 파일 (예상)

| 파일 | 변경 | 줄 |
| --- | --- | --- |
| `frontend/src/components/admin/AdminLayout.tsx` | 3 컬럼 grid 적용 | +30 / -5 |
| `frontend/src/components/admin/AdminLeftNav.tsx` | 신규 — 9 카드 anchor + 색신호 | ~80 |
| `frontend/src/components/admin/AdminLivePanel.tsx` | 신규 — 우 패널 3 위젯 | ~100 |
| `frontend/src/components/admin/AdminLeftNav.test.tsx` | 신규 | ~50 |
| `frontend/src/components/admin/AdminLivePanel.test.tsx` | 신규 | ~60 |
| `frontend/src/app/admin/page.tsx` | 좌 nav 색신호용 `data-status` 추가 (9 카드) | +9 / -0 |

## 디자인 잣대 점검 (`2026-05-20-2upekr-redesign-design.md` §최우선 잣대)

| 잣대 | 평가 |
| --- | --- |
| 매일 5분 운영 | ✅ 좌 nav 색신호 = 스크롤 0회로 9 상태 파악 |
| 첫 5분 핵심 가치 | ✅ 우 라이브 패널 = 실시간 운영 신호 즉시 확인 |
| 1인 관리자 본인 운영 | ✅ 중앙 본문 변경 0 = 익숙한 흐름 보존 |
| 미래 확장 | ✅ 9 → 10 카드 시 좌 nav 1줄 + page.tsx 1 컴포넌트 추가 |
| 시각 매력 | 🟡 색신호 + 3 컬럼 = 첫 admin 시각 자산. 단 점수 4/5 (Retool 5 보다 낮음) |

5 잣대 중 4 ✅ + 1 🟡. 통과.

## 자가 점검 §11 (PR 6c·6d 답습)

| 점검 | 답변 |
| --- | --- |
| 본문 9 카드 영향 | 변경 0 (data-status 9 줄 추가 외) |
| 좌 nav 색신호 데이터 출처 | 각 카드의 `data-status` = 9 카드 자체 컴포넌트가 결정 (HealthSummary 가 자체 상태 알림) |
| 우 패널 useQuery 중복? | runningJobs = page.tsx 와 동일 키 = dedupe 자동. 최근 실패 = 신규 키 = +1 호출 |
| 모바일 영향 | `lg:flex hidden` = lg 미만 자동 숨김 = 모바일·태블릿 영향 0 |
| AdminLayout 다른 호출처 | grep 의무. 본 spec 단정 = 1 호출처 (page.tsx). plan 단계 grep |
| `data-status` attribute 표준? | HTML5 data-* spec. shadcn `data-[state=open]:` variant 답습 |

## 우선순위 의존

- PR 6d (`/complex/[no]` 데스크톱) 머지 완료 후 본 PR 진입
- PR 6f (Cmd+K + localStorage 빈도 정렬) = 본 PR 머지 1주 사용 후 실증 기반 결정

## 인접 작업 (본 PR 영역 외)

- Cmd+K 점프 (Linear 답습) = PR 6f 후보
- 좌 nav localStorage 빈도 자동 정렬 (Vercel 답습) = PR 6f 후보
- 우 패널 사용자 정의 (Retool 답습) = 본 프로젝트 1인 관리자 재배치 빈도 낮아 폐기

## Cross-link

- 디자인 리뉴얼 진실의 원천 = `docs/superpowers/specs/2026-05-20-2upekr-redesign-design.md`
- 인접 spec = `docs/superpowers/specs/2026-05-28-pr-6d-complex-dashboard-desktop-design.md` (sibling)
- 관리자 page = `frontend/src/app/admin/page.tsx`
- AdminLayout = `frontend/src/components/admin/AdminLayout.tsx`
