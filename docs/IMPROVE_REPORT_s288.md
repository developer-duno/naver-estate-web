# IMPROVE_REPORT_s288 — 세션 288 개선점 발굴 라운드 (2026-06-10)

> 생성: 울트라코드 워크플로우 67 에이전트 (5관점 finder + 건별 3렌즈 적대검증: 실재성·사용자가치·회귀위험).
> 원시 24건 → confirmed 20 → 오케스트레이터 교차검증·중복 통합 후 실행 13건 + 기각 4건 + 이월 3건.
> 선행 입력 = Phase B 라이브 점검 리드 3건 (scheduler-status·crawl-jobs 실측).

## 이번 세션 구현 완료

### PR #140 — FE 에러 다시시도 + 수집버튼 로그인 안내 (🟡×3)

| 항목 | 파일 |
|---|---|
| 실거래가 추이 isError 에 "다시 시도" 버튼 | `PriceChartSection.tsx` |
| 층수별 가격 error 에 optional onRetry 버튼 | `ComplexPriceFloorTab.tsx` + `ComplexPriceFloorSection.tsx` |
| 비로그인 시 수집버튼 silent disabled → "로그인 후 수집할 수 있습니다" | `PriceChartSection.tsx` |

### PR #141 — safeSetItem 잔여 7곳 + 모바일 크롤링 시각 (🟡×2 + 🟢)

| 항목 | 파일 |
|---|---|
| 비교 추가/제거 유일 쓰기 경로 raw setItem → safeSetItem | `useLocalStorageList.ts` |
| storage.ts add/remove Mb 6곳 (instanceof Error 함정·inline try) 통일 | `storage.ts` |
| "마지막 크롤링" 배지 모바일(<640px) 비노출 해소 | `ComplexHeader.tsx` |

### PR #142 (본 PR) — BE 관측성·안정성 묶음 (🔴 + 🟡×2 + 🟢 docs)

| 항목 | 근거 |
|---|---|
| crawl_details 후보 SELECT 배치 세션 한정 statement_timeout 8s→30s | 라이브 24h 31회 중 2회 QueryCanceled (잡 24699 실측) + 동일 쿼리 EXPLAIN 1.4~3.3s. 인덱스는 세션 266·267 폐기 답습 유지, 배치 축소는 PR #19 가속 답습 위배라 제외 — 세션 한정 SET 이 최소수정 (NullPool 누수 0) |
| discover_regions job.total_items 미설정 → 어드민 total 0/processed 1250 표시 어긋남 | 라이브 점검 L3 + service_discover.py:119 직독 |
| backfill_price_batch CrawlJob 기록 없음 → 어드민 last_run 영구 null | 라이브 점검 + 같은 파일 collect_public_trade_data 패턴 답습. ast 가드 목록에도 등록 |
| infra.md 스케줄러 표·시간분리 표에 backfill_price(매일 03:30) 행 누락 | docs drift (L2) — grep 0건 실측 |

## 다음 세션 이월 (confirmed, 구현 보류)

1. **🔴 admin 모달 a11y** — `VerificationReview.tsx` 모달 2개 + `UserTable.tsx` 승인 모달: role="dialog"/aria-modal/aria-labelledby/포커스트랩/ESC/닫기 aria-label 전부 부재. UserTable 행별 select aria-label 2곳 포함. 선례 = ArticleDetail.tsx 포커스트랩·PromptModal. 보류 사유 = 운영자 전용 화면(user-value 렌즈 반박)이라 이번 세션 사용자 화면 우선 원칙에서 후순위. 1 PR(2파일)로 묶기 적합.
2. **🟡 ChartAccordion aria-controls** — 토글 버튼 aria-controls + 패널 id/role="region" 부재 (useId 사용, 1파일 10줄). 시각 영향 0.
3. **L1 후속 관찰** — statement_timeout 30s 적용 후 crawl_details stats_24h failures 추세 1주 관찰 (기대: QueryCanceled 0).

## 기각 (재조사 금지)

| 항목 | 기각 근거 |
|---|---|
| ArticleDetail staleTime 추가 | 전역 기본값 이미 존재 — `query-client.ts:7 staleTime: 30_000`. 워크플로 confirmed 였으나 오케스트레이터 직독으로 기각 |
| V033 partial index (detail_crawled 부분 인덱스) | 세션 266·267·268 적대검증 3회 폐기 답습. 오늘 라이브 EXPLAIN 1.38~3.29s = 8s 내 — 간헐 꼬리는 timeout 상향으로 해소 |
| 검색 헤더 단지 수 변수 불일치 | sortComplexes 는 순수 정렬 — 길이 불변이라 표시 불일치 자체가 없음 |
| 미분양 추이 히스토리 무음 실패 | 이미 `mibunyang/[id]/page.tsx:142` error 분기 존재 — finder 의 구버전 가정 |

## Phase B 라이브 점검 기록 (2026-06-10)

- **backend zombie 완전 해소**: 부팅 6/10 15:45 (backend.log·orchestrator.pid) > PR#131 머지 6/8. 21개 잡 전부 enabled + 새 코드 표시값 (monitor 10분·metrics 04:30·detail 4h) 라이브 확인.
- **#110 헛돈크롤 추세**: article_detail 최근 50건 proc=0 = 80% (세션 270 = 82%) — 변화 없음, 방치 정답 유지. 인덱스·최적화 금지 박제 유효.
- **보안 감사**: BE pip-audit 0건 / FE npm audit 0건.
