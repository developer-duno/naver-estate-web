# 개선 리포트 — 세션 271 (2026-06-04)

> **방식**: 하네스 5축 실측 (워크플로우 5에이전트 스캔 + 6에이전트 적대 검증 + 직접 grep/tsc/npm audit/npm outdated).
> **원칙**: 코드 수정 0. 추측 0 — 모든 판정은 실제 명령 출력·파일:줄 증거 기반.
> **검증 효과**: 적대 검증이 스캔 단계 과대 주장 2건을 정정함(예: UX "isError 삼킴 8건" → 실제 3건, 4건은 이미 에러 UI 보유 오탐).

---

## 한 줄 요약

**개선 항목 9건 (오탐 제외) — 🔴 즉시 0건 · 🟡 곧 2건 · 🟢 여유 7건.**
프로젝트는 전반적으로 **매우 건강**하다. 보안 누락·심각 부채·monolith·타입오류 0건. 발견된 것은 대부분 위생/품질 수준의 여유 항목.

---

## IMPROVE 1: 기술 부채 (실측)

| 항목 | 실측 증거 | 판정 |
|---|---|---|
| TODO/FIXME/HACK/XXX/WORKAROUND | FE(*.ts,*.tsx) **0건**(No matches). BE(*.py) 1건 = `childcare_api.py:238` XML `<errcode>XXX</errcode>` 설명(오탐) | ✅ 부채 마커 사실상 전무 |
| `any` 타입 | frontend/src **5건/4파일** — 4건 테스트(test-setup·RegionSelector·ArticleDetail), 프로덕션 1건 `MbComparePriceChart.tsx:39`(Recharts 콜백, `eslint-disable` 명시) | ✅ 위험 any 0 |
| 미사용 export | lib/ 전수: **3건** — `MB_SORT_OPTIONS`(constants.ts:249), `MAX_AGE_DEDUCTION_RATE`/`MAX_HOLD_DEDUCTION_RATE`(property-tax-brackets.ts:79~80). 각 참조 0 | 🟢 세법 상수 2건은 향후 사용 의도 가능 — 삭제 전 확인 |
| tsc --noEmit | **EXIT 0, error 0건** | ✅ 타입 클린 |
| monolith(800줄+) | **0건**. FE 최대 compare/page.tsx 445줄, BE 최대 service_discover.py 539줄 | ✅ 분할 양호 |

---

## IMPROVE 2: 성능 (실측)

| 항목 | 실측 증거 | 판정 |
|---|---|---|
| 무거운 라이브러리 lazy 로드 | recharts 직접 import 10파일이나, compare·mibunyang 차트·ErrorRateChart·ComplexPriceAreaSection 전부 `dynamic(ssr:false)` 래핑(grep 7파일+). | ✅ 번들 최적화 양호 |
| 이미지 | raw `<img>` **1건**(`admin/VerificationReview.tsx:113`, dataURL 미리보기·alt 보유 = next/image 부적합 정당). public 이미지 전부 SVG, 최대 14KB | ✅ 문제 없음 |
| 렌더 최적화 | React.memo 12파일 / useMemo 73 / useCallback 59 | ✅ 충분 |
| DB 쿼리 N+1 | `.all()` 54건(대부분 작은 결과셋). enricher 평형 N+1은 **세션 269~270 PR#114에서 이미 제거** | ✅ 신규 N+1 0 |
| #110 article_detail | (작업2 실측) 신선도 정렬 정상, proc=0=dead고갈. 인덱스 추가 금지(combined_aggregate_index_void 4회 폐기) | ✅ 방치 정답 |

---

## IMPROVE 3: 보안 (실측)

| 항목 | 실측 증거 | 판정 |
|---|---|---|
| npm audit | **1 high / 0 critical** = `tmp@0.2.5`(exceljs 전이의존, GHSA-ph9p-34f9-6g65 path traversal). `npm audit fix` 가능 | 🟡 위생 패치(실악용 가능성 낮음 — exceljs가 사용자입력 미전달) |
| NEXT_PUBLIC_ 변수 | 11종 전부 공개 안전값(SUPABASE_URL/ANON_KEY·NAVER_MAP_CLIENT_ID·SITE_URL 등). **키/시크릿/서비스롤 노출 0** | ✅ |
| BE 시크릿 | SERVICE_KEY·JWT_SECRET·SMTP_PASS·TELEGRAM_TOKEN 전부 백엔드 전용, FE 노출 0 | ✅ |
| admin 인증 | `@router` 30개 = `Depends(get_admin_user)` 30개 **1:1 완전매칭, 보호 누락 0**. verify/users도 get_current_user | ✅ |
| 입력검증 | live/search Query(min/max_length), upload-license content-type+5MB, recrawl batch 50~500 range | ✅ |
| CORS/헤더 | allow_origins 명시도메인(와일드카드 0). nosniff·X-Frame-DENY·HSTS(prod) | ✅ |
| .env 커밋 | git ls-files: 실제 .env 커밋 0, .example 템플릿 3종만 | ✅ |
| RLS(V029)·anon차단(V031) | 세션 254·261에서 이미 완료 | ✅ 해결됨 |

---

## IMPROVE 4: UX (실측 + 적대검증 정정)

| 항목 | 실측 증거 | 판정 |
|---|---|---|
| isError를 return null로 삼킴 | ⚠️ 스캔 "8건" → **검증 정정: 실제 3건** (CompetingListings:26·MarketPosition:23·MaintenanceCost:26). 나머지 4건(CompareCharts·ComplexPriceArea/Floor·MbCompareUnsold)은 **이미 빨간 에러 UI 보유=오탐** | 🟢 보조카드 3건만 소규모 부채(네트워크 실패≠빈데이터 구분) |
| 자격증 파일 업로드 input 접근성 | `(auth)/verify/page.tsx:293` hidden file input에 aria-label/id 0(같은폼 타 필드는 Label htmlFor 정상). 키보드/스크린리더 무명 | 🟢 선택필드·1회성 화면, aria-label 1줄급 |
| admin 텍스트 input 라벨 | `admin/logs/page.tsx:56`(사용자ID)·`admin/data/page.tsx:62`(staleDays) placeholder만, programmatic label 0. (PromptModal은 dialog aria-label 있어 완전무명 아님) | 🟢 관리자 전용 |
| 차트 로딩 "로딩 중..." 텍스트 | `ComplexPriceAreaSection:27`·`PriceChartSection:90` 맨 텍스트(Skeleton 자산 있으나 미사용). h-48 고정이라 점프는 없음 | 🟢 일관성 디테일 |
| 빈 상태(EmptyState) | 19파일 적용, mb 테이블 3종 전부 커버. 세션 268 이후 충족 | ✅ 갭 적음 |
| alt/접근성 | Image/img 7건 **전부 alt 보유**. aria-label 183건 | ✅ 대체로 양호 |
| auth 4페이지 반응형 0건 | login/signup/verify/forgot 0건(단 단일컬럼 폼이라 결함 단정 불가, verify만 모바일 실측 권장) | 🟢 |

---

## IMPROVE 5: 아키텍처 & 확장성 (실측 + 적대검증)

| 항목 | 실측 증거 | 판정 |
|---|---|---|
| **Mb*Bar.tsx 14개 구조 100% 중복** | mb/ 지표막대 14개 동일 골격(role=progressbar+3티어 색/라벨), MAX·임계·라벨·포맷만 차이. 합계 678줄. 공유 MetricBar 부재. ⚠️검증 보강: 변형 3건(MbUnitsBar 팔레트 다름·MbNoxiousBar 49줄 가드·UnsoldRate aria 주입) → config가 흡수해야 | 🟡 `<MetricBar config>` 1+config로 수렴 가능(테스트 it.each), 화면변화 0 |
| query_helpers.py 직접 테스트 0 | tests/ import 0. ⚠️검증 정정: "5모듈 공유"는 과장(실소비자 article_queries 1 + barrel 1). 핵심경로는 get_articles_by_complex 통합테스트로 간접커버. 미커버=복잡분기(min_yield·building_age·move_in regex, PG전용 SQL→dialect분기 필요) | 🟢 간접커버 있음, 복잡분기만 |
| env_crime.py / env_emergency.py 테스트 0 | collect_crime_stats/collect_emergency_data 직접 호출 테스트 0(admin 테스트는 collector 모킹). CSV폴백·인구조인 미커버. childcare silent failure 이력 | 🟢 환경수집 가드 가치 있으나 분기별 잡 |
| article_queries.py 테스트 0 | 56줄, queries.py 경유 간접만 | 🟢 작아서 쉬움 |
| 플랫 폴더 | components 직속 44개·crawler 32개(env_*8). 깊이는 건강(BE 3단·FE 5단) | 🟢 하위폴더 분리 여지(import 대량변경=회귀위험) |
| 하드코딩 host/port | FE 0건. BE는 전부 env-gated dev 기본값(`main.py:120` FRONTEND_URL 폴백 등) | ✅ 프로덕션 하드코딩 0 |
| 문서화 | service_discover.py(최대파일) 함수 9개 전부 docstring. SSOT 룰 5종 git추적 | ✅ |

---

## 패키지 상태 (npm outdated 실측)

**메이저 업데이트 후보(주의 필요 — breaking 가능):**
- `typescript` 5.9.3 → **6.0.3**, `eslint` 9.39.4 → **10.4.1**, `@types/node` 20 → **25**, `@supabase/ssr` 0.9 → **0.10.3**

**마이너(안전):** next 16.2.6→16.2.7, @tanstack/react-query 5.95→5.101, @supabase/supabase-js 2.98→2.107, playwright 1.58→1.60, tailwindcss 4.2→4.3, lucide-react 1.16→1.17 등

> 메이저 4종은 각각 별도 PR로 검증 동반 권장(특히 eslint 10·ts 6는 lint룰·타입 변화). 마이너는 정기 묶음 가능.

---

## 📊 개선 우선순위 매트릭스

| # | 카테고리 | 개선 항목 | 영향도 | 난이도 | 우선순위 |
|---|---|---|---|---|---|
| 1 | 보안 | npm `tmp@0.2.5` path traversal (`npm audit fix`) | 하 | 쉬움 | 🟡 |
| 2 | 아키텍처 | Mb*Bar 14개 → `<MetricBar config>` DRY 추출 | 중 | 보통 | 🟡 |
| 3 | 테스트 | env_crime.py/env_emergency.py 수집 가드 추가 | 중 | 보통 | 🟢 |
| 4 | 테스트 | query_helpers.py 복잡분기(dialect) 가드 | 중 | 보통 | 🟢 |
| 5 | UX | 보조카드 3건 isError 인라인 fallback | 중 | 보통 | 🟢 |
| 6 | UX | verify 파일업로드 + admin input aria-label | 중 | 쉬움 | 🟢 |
| 7 | 부채 | 미사용 export 3건 정리(세법상수 확인 후) | 하 | 쉬움 | 🟢 |
| 8 | UX | 차트 로딩 Skeleton 통일 | 하 | 쉬움 | 🟢 |
| 9 | 패키지 | 마이너 업데이트 묶음 / 메이저 4종 개별 PR | 하 | 보통 | 🟢 |

우선순위 기준: 🔴 즉시(보안취약·심각UX·데이터유실) / 🟡 곧(부채·성능·품질) / 🟢 여유(리팩토링·테스트·문서).

**🔴 즉시 항목 0건** — 보안 누락·데이터유실·심각UX 저하 없음.

---

## 🎯 다음 액션 플랜 (/plan 붙여넣기용)

🔴 없음. 가장 가치 높은 🟡 2건을 다음 작업 후보로:

```
아래 개선 작업을 해줘 (코드 수정, 회귀 테스트 동반):

1. [🟡 보안 위생] frontend npm audit의 tmp@0.2.5 path traversal 해소 —
   npm audit fix로 exceljs 전이의존 tmp 패치, npm test + 엑셀 export E2E 1회 확인.
2. [🟡 아키텍처 DRY] mb/Mb*Bar.tsx 14개를 <MetricBar config> 1개+config 배열로 수렴 —
   화면 동작 0 변화, 기존 15개 *Bar.test.tsx를 it.each로 재구성, 변형 3건(MbUnitsBar 팔레트·
   MbNoxiousBar 가드·UnsoldRate aria)을 config가 흡수하는지 검증.
```

🟢 7건은 아래 "개선 백로그"에 보관 — 시간 날 때 처리.

---

## 개선 백로그 (🟢 여유, 분기 내)

- **테스트**: env_crime.py·env_emergency.py 수집 오케스트레이션 가드 / query_helpers.py PG전용 복잡분기 dialect 테스트 / article_queries.py 직접 단위
- **UX**: ArticleDetail 보조카드 3건(CompetingListings·MarketPosition·MaintenanceCost) isError 인라인 "불러올 수 없어요+재시도" / verify 파일업로드 aria-label / admin logs·data input aria-label / 차트 로딩 Skeleton 통일
- **부채**: 미사용 export 3건(MB_SORT_OPTIONS·MAX_AGE/HOLD_DEDUCTION_RATE) — 세법상수는 PropertyTax 로직 확인 후 판단
- **아키텍처**: components/ 도메인 하위폴더(compare/price) · crawler/env_* env/ 서브폴더(import 대량변경=회귀위험, 화면변화 0이라 후순위)
- **패키지**: 마이너 정기 묶음 업데이트 / 메이저 4종(ts6·eslint10·@types/node25·@supabase/ssr) 개별 PR

---

## 부록 — 검증이 정정한 할루시네이션 (하네스 가치 입증)

| 스캔 주장 | 적대검증 정정 |
|---|---|
| UX "isError 삼킴 **8건**" | 실제 **3건**, 4건은 이미 빨간 에러 UI 보유(오탐) |
| 아키텍처 "query_helpers **5모듈 공유**" | 실소비자 1 + barrel 1, 핵심경로 통합테스트 간접커버 |
| 보안 "frontend .env.example **누락**" | `.env.local.example`로 존재(Next.js 관례), 누락 아님 |
| env_crime "**env_service가 import**" | 실제 env_common+env_crime_lookup/population, env_service는 re-export 쪽 |

> ⚠️ **리포트 한계**: 성능 축(IMPROVE 2)은 워크플로우 에이전트 1개가 hang되어 스캔 결과 대신 **직접 grep 실측**으로 보강함. 위 성능 표는 직접 측정값(추측 아님)이나, 다른 4축처럼 적대검증은 거치지 않았으므로 재확인 여지 있음.
