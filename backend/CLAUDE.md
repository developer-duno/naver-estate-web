# Backend — FastAPI + SQLAlchemy

## 디렉토리 구조

| 경로 | 역할 |
| --- | --- |
| `main.py` | FastAPI 앱 진입점, 라우터 등록, CORS |
| `deps.py` | 인증 의존성 (get_current_user, get_approved_user, get_admin_user) |
| `routers/live/` | 실시간 크롤링 + 실거래가 on-demand 수집 API (search 등 분할) |
| `routers/complexes.py` | 단지 조회/필터/시세/가격추이 |
| `routers/articles.py` | 매물 조회/엑셀 내보내기 (xlsxwriter 엔진) |
| `routers/admin/` | 관리자 API 분할 10 파일 (`collect`/`data`/`freshness`/`freshness_meta`/`jobs`/`naver_calls`/`recrawl`/`scheduler`/`users` + `_shared` 공통 의존성) |
| `routers/stats.py` | 통계 API |
| `routers/regions.py` | 지역 데이터 API |
| `routers/users.py` | 사용자 로그인 기록 |
| `routers/verify.py` | 공인중개사 검증 (odcloud API) |
| `routers/payment.py` | 유료 구독 결제 (PortOne V2 — prepare/complete/webhook, 멱등·환불·위변조 방어) |
| `routers/billing.py` | 빌링키 자동결제 (정기결제 — 발급 prepare/카드 등록+첫결제, 카드 여러 장 보관 + 기본 1장) |
| `routers/serializers.py` | ORM → dict 변환 barrel re-export (3모듈) |
| `routers/estate_serializers.py` | Complex/Article ORM → dict |
| `routers/filter_builder.py` | 필터 파라미터 → dict 변환 |
| `routers/mb_serializers.py` | mibunyang ORM → dict (10개 모델) |
| `routers/mb.py` | mibunyang 데이터 API (미분양/실거래/지역통계) |
| `db/models.py` | SQLAlchemy ORM 모델 (estate) |
| `db/mb_models.py` | mibunyang 테이블 ORM 모델 (같은 Base 상속) |
| `db/queries.py` | DB 쿼리 barrel re-export (5모듈) |
| `db/query_helpers.py` | 필터 조건 빌더 + 정렬 빌더 |
| `db/complex_queries.py` | 단지 조회 쿼리 |
| `db/article_queries.py` | 매물 조회 쿼리 (필터+정렬+페이지네이션) |
| `db/price_queries.py` | 가격 이력/통계/추이 쿼리 |
| `db/stats_queries.py` | DB 통계 + 필터 옵션 쿼리 |
| `db/mb_queries.py` | mibunyang 쿼리 barrel re-export (3모듈) |
| `db/mb_query_helpers.py` | mibunyang 중복 제거 + 정렬 + 필터 헬퍼 |
| `db/mb_apartment_queries.py` | mibunyang 아파트 단지 + 미분양 조회 쿼리 |
| `db/mb_misc_queries.py` | mibunyang 지역 통계 + 실거래 + 단지 부속 쿼리 |
| `db/migrations/` | Flyway 스타일 SQL 마이그레이션 (V000~V028, 29 버전) |
| `shared/naver_api.py` | NaverEstateAPI (수정 금지) |
| `shared/constants.py` | 상수 (수정 금지) |
| `auth/permissions.py` | 역할 체크 (require_role) + 일일 쿼터 (check_quota) |
| `auth/rate_limiter.py` | IP 기반 요청 제한 |
| `auth/audit.py` | 감사 로그 |
| `crawler/service.py` | 크롤링 서비스 barrel re-export (기존 import 호환) |
| `crawler/service_common.py` | 공통 헬퍼 (시세 upsert, 체크포인트) |
| `crawler/service_discover.py` | 단지 발견 + 매물 수집 + 상세 보강 |
| `crawler/service_price.py` | 시세 수집 (배치 + on-demand) |
| `crawler/service_public.py` | 공공데이터 실거래가 수집 |
| `crawler/service_official_price.py` | 공동주택 공시가격 수집 (법정동 루프 + 단지 매칭 + 평형별 중위가) |
| `crawler/scheduler.py` | APScheduler 스케줄 (매물/시세/공공데이터/인기단지) |
| `crawler/public_data_api.py` | 국토교통부 공공데이터 API |
| `crawler/vworld_price_api.py` | V-WORLD 공동주택 공시가격 API (getApartHousingPriceAttr, 전 페이지 수집) |
| `crawler/utils.py` | AdaptiveThrottle, CheckpointManager |
| `services/cache.py` | TTLCache (동적/고정 TTL, delete_by_prefix) |
| `services/upsert.py` | DB upsert 헬퍼 (_do_upsert: pg_insert/sqlite_insert 자동 분기) |
| `services/enricher.py` | 단지 상세 정보 보강 |
| `formatters/price_core.py` | 가격 포맷 코어 (format_price_value, format_price_data) |
| `formatters/complex_area.py` | 단지/면적 HTML 포맷 |
| `formatters/analysis.py` | 전세가율/대출분석 HTML 포맷 |
| `formatters/school.py` | 학군 HTML 포맷 |
| `formatters/area_price_detail.py` | 면적별 시세 상세 HTML 포맷 |
| `price_school_formatter.py` | HTML 포맷 barrel re-export (5모듈) |

## 토픽 인덱스 (BE 깊이 자료, 명시 참조 — 자동 로드 안 됨)

| 토픽 파일 | 내용 |
| --- | --- |
| `backend/.claude/details.md` | 실거래가 on-demand + mibunyang 통합 + 공인중개사 검증 워크플로 + 미분양 중복 제거 |

## CI 테스트 인프라

- **엔진**: file-based SQLite + NullPool + WAL + busy_timeout 5초
- **dialect 분기**: `_search_all_types()`는 SQLite에서 ThreadPoolExecutor 대신 순차 실행
  - `_do_upsert()`도 dialect-aware (pg_insert/sqlite_insert 자동 분기)
- **테스트**: 루트 `CLAUDE.md` §테스트 현황 참조 (`python -m pytest --tb=short -q`)
- **conftest.py**: `sys.modules["db.database"]` 교체로 테스트 엔진 주입

## CORS 미들웨어 순서 (중요)

- `RateLimitMiddleware` → `CORSMiddleware` 순서로 등록 (CORS가 마지막 = 가장 먼저 실행)
- 반대로 하면 OPTIONS preflight가 429 반환

## DB 마이그레이션 (실행 완료)

| 버전 | 내용 | 실행일 |
| --- | --- | --- |
| V014 | crawl_jobs.scheduler_job_id | 2026-04-03 |
| V015/V016 | apartments/trades 인덱스 7개 + trigram | 2026-04-07 |
| V017 | agent_verifications 테이블 | — |
| V018 | agent_verifications.license_doc_path | — |
| V019 | infra.childcare_nearest_type/teachers | — |
| V020 | naver_call_counter Supabase 영속화 | 2026-04-22 (세션 54) |
| V021~V023 | 단지/매물 유형명 backfill + 유형별 인덱스 | 2026-05-17 (세션 195) |
| V024 | articles 매물 가치 필드 12개 (에픽 D #9) | 2026-05-17 (세션 195) |
| V025 | articles 매물 상세 4필드 (에픽 D #10) | 2026-05-18 (세션 196) |
| V026 | monitor_alerts 테이블 (크롤링 모니터) | 2026-05-18 (세션 196) |
| V027 | crawl_jobs scheduler_started 인덱스 (PR #21) | 2026-05-21 (세션 207) |
| V028 | user_profiles.agree_marketing (회원가입 마케팅 동의) | 2026-05-31 (세션 252) |
| V029 | RLS 11 테이블 활성화 (anon 노출 차단) | 2026-05-31 (세션 254) |
| V030 | trades 중복 인덱스 3개 제거 (~57MB, prod 적용완료 세션 270 라이브검증) | 2026-06-02 (세션 260) |
| V031 | 공유 4테이블 anon/authenticated REST 노출 차단 (prod 적용완료, 세션 261 라이브검증) | 2026-06-02 (세션 261) |
| V032 | complex_price_history 제약명 정합 (V001 uq_cph_composite → 코드·prod의 complex_price_history_upsert_key, 멱등 no-op on prod) | 2026-06-07 (세션 280) |
| V033 | agent_verifications.phone 컬럼 추가 (공인중개사 검증 연락처 수집, PR #171) | 2026-06-15 (prod 적용완료, 세션 307 라이브검증: phone 저장 확인) |
| V034 | agent_verifications broker_verified/broker_jurirno/broker_status 3컬럼 (V-WORLD 중개사 대조 결과, 세션 308 PR B) | 2026-06-15 (prod 적용완료, 세션 308 직접 실측: 3컬럼 확인) |
| V035 | user_profiles.paid_until + payments 테이블 (결제 시스템 PR1 — 유료 구독 이용권) | 2026-06-24 (prod 적용완료, 세션 322: 사장님 SQL Editor 실행 → Claude 재검증 paid_until·payments·인덱스 EXISTS) |
| V036 | billing_keys 테이블 (빌링키 자동결제 — 정기결제 PR1, 방식 B 우리 cron, 세션 327) | 2026-06-27 (prod 적용완료, 세션 329: 사장님 SQL Editor 실행 → information_schema 13컬럼·타입 일치 확인. PR2+ 결제 엔드포인트 INSERT/SELECT 준비됨) |
| V037 | billing_keys.is_default 컬럼 + 부분 유니크 인덱스 (카드 여러 장 보관, 자동결제는 기본 1장 — 정기결제 PR2, 세션 329) | 2026-06-27 (prod 적용완료, 세션 329: 사장님 SQL Editor 실행 → Claude prod 직접 실측 is_default(boolean·default true)·uq_billing_keys_default 인덱스 EXISTS 확인) |
| V038 | articles.updated_at 인덱스 (ix_articles_updated_at DESC — 신선도 monitor timeout 방지, 세션 342) | 2026-07-04 (prod 적용완료, 세션 342: Claude 가 CREATE INDEX CONCURRENTLY autocommit 엔진 실행 5.7초·락0. 라이브 검증 = max(updated_at) 2.7초 Seq Scan → 0.071초 Index Only Scan(38배), EXPLAIN `ix_articles_updated_at` 확인) |
| V039 | articles.created_at 인덱스 (ix_articles_created_at — 신선도 new_rows 헛바퀴감지 timeout 방지, 세션 342) | 2026-07-04 (prod 적용완료, 세션 342: CREATE INDEX CONCURRENTLY 5.9초·락0. 라이브 검증 = new_rows(created_at≥job_start count) 3.8초 Seq Scan → 0.021초 Index Scan(180배), compute_freshness 전체 9.2초 → 0.6초) |
| V040 | presale_schedule_official·applyhome_unit_supply 에 house_type 컬럼 추가 (오피스텔·도시형·생활숙박을 기존 아파트 청약 테이블에 흡수, 이슈 #323) | 2026-08-08 (prod 적용완료, 세션 352: 사장님 SQL Editor 실행 → Claude 재검증 house_type 컬럼 EXISTS) |
| V041 | rental_schedule_official 신규 테이블 (공공지원 민간임대 공고 일정, apartments 로스터와 독립, 이슈 #323) | 2026-08-08 (prod 적용완료, 세션 352: 사장님 SQL Editor 실행 → Claude 재검증 테이블 EXISTS) |
| V042 | rental_unit_supply 신규 테이블 (공공지원 민간임대 평형별 공급정보, rental_schedule_official FK, 이슈 #323) | 2026-08-08 (prod 적용완료, 세션 352: 사장님 SQL Editor 실행 → Claude 재검증 테이블 EXISTS) |
| V043 | presale_schedule_official.house_nm 컬럼 추가 (오피스텔 실제 단지명 저장 — apartments JOIN 제거로 화면에 apartment_id placeholder 만 노출되던 문제 해결, 이슈 #323) | 2026-08-08 (prod 적용완료, 세션 352: 사장님 SQL Editor 실행 → Claude 재검증 house_nm 컬럼 EXISTS) |
| V044 | complex_official_prices 신규 테이블 (공동주택 공시가격 — V-WORLD getApartHousingPriceAttr, 단지×연도×전용면적 중위값. RLS+GRANT REVOKE 이중 빗장, 세션 354) | 2026-08-09 (prod 적용완료, 세션 355: 사장님 SQL Editor 실행 → Claude information_schema 4요소 재검증(컬럼·RLS·정책·anon/authenticated GRANT 0건) 통과) |
| V045 | officetel_presale_schedule·officetel_unit_supply 신규 테이블 (오피스텔·도시형 청약 완전 분리 — presale_schedule_official/applyhome_unit_supply/apartments 에 apartment_id placeholder 로 끼워 넣던 방식 폐기, mibunyang 무결성 전제 보존. rental V041/V042 선례 답습). 2026-08-10 재설계: officetel_unit_supply 는 아파트 청약 틀(general_supply/special_supply/special_by_type, 오피스텔 API가 안 주는 죽은 컬럼) 대신 실제 응답 필드(supply_hshldco/supply_amount/subscrpt_reqst_amount)로 재구성, top_amount 는 시리얼라이저·FE 공유 키라 컬럼만 유지(항상 NULL). officetel_presale_schedule 에 region_name(SUBSCRPT_AREA_CODE_NM) 컬럼 신설 — 지역 필터 로직은 미구현(dead parameter), 데이터 적재만 | 2026-08-10 (prod 적용완료, 세션 358: 사장님 SQL Editor 실행 → Claude information_schema 4요소 재검증(officetel_presale_schedule·officetel_unit_supply 두 테이블 존재·FK는 officetel_unit_supply→officetel_presale_schedule만이고 apartments 없음·컬럼 전부·RLS 활성화) 통과, PR #352 커밋 9429522 머지완료) |

| V047 | subway_stations 신규 테이블 (전국 도시철도 역사 1,099행 — 국가철도공단 레일포털 표준데이터, 단지 상세 "가까운 지하철" 표시용. RLS+GRANT REVOKE 이중 빗장 V044 답습, 세션 367) | **prod 적용 대기** — 코드 머지 전 SQL Editor 선행 적용 필수 (ORM 매핑됨, 미적용 시 /subway 엔드포인트 500). 적용 후 `python -m scripts.import_subway_stations` 로 1,099행 적재 |

- `db/migrations/` 폴더에 `V000__` ~ `V047__` SQL 파일 = 48 버전 (⚠ V046(complex_public_data_attempted, 세션 360)은 위 표에 행 누락 상태 — 다음 문서 정비 시 보강 필요)
- Supabase 에 SQLAlchemy 엔진으로 실행 (V023 = 973,837행 backfill)
- 롤백: 각 마이그레이션 파일의 역방향 SQL 실행
- 최신 = V047 (subway_stations 신규 테이블, 세션 367 — **prod 적용 대기**, 코드 머지 전 SQL Editor 선행 적용 필수). 새 마이그레이션 시 본 표 1행 추가 의무 (`.claude/rules/release.md` 답습 — backend zombie 회피)
  - V043 = prod 적용완료·backend 재시작(zombie 해소) 완료 — 세션 352 라이브 검증: `/presale/officetel-rental` 200 정상 응답 확인.
  - V043 = house_nm TEXT nullable 컬럼 추가 — 기존 아파트 청약 행은 NULL 로 두면 되므로 기존 데이터 영향 0. `ADD COLUMN IF NOT EXISTS` 라 멱등·안전. 코드(`db/mb_models.py`)가 이미 이 컬럼에 매핑돼 SELECT 목록에 포함되므로 **prod 선행 적용 필수** — 세션 352 에 적용·재검증 완료.
  - V040~V042 = 이슈 #323(청약홈 오피스텔·도시형·민간임대 편입) 3종 세트 — `CREATE TABLE/ADD COLUMN IF NOT EXISTS` 라 멱등·안전. V040 은 기존 컬럼에 `NOT NULL DEFAULT 'apt'`로 추가해 기존 아파트 데이터에 영향 0. V041/V042 는 신규 독립 테이블이라 공유 DB(mibunyang) 영향 0. 코드(`db/mb_models.py`)는 이미 이 컬럼/테이블에 매핑돼 있으므로 **prod 선행 적용 필수** — 세션 352 에 적용·재검증 완료.
  - V038 = `ix_articles_updated_at` 신규 인덱스 — 코드(freshness.py max/count 분리)는 인덱스 없어도 동작(Seq Scan 느릴 뿐)이라 즉시 500 위험 0. prod 는 CONCURRENTLY 로 락 없이 적용(5.7초). 공유 DB(mibunyang)도 articles upsert 하나 인덱스 유지 오버헤드 미미. `CREATE INDEX IF NOT EXISTS` 라 멱등·안전(마이그 파일은 비-CONCURRENTLY 지만 이미 존재해 no-op).
  - V036 = billing_keys 신규 테이블 — `BillingKey` 가 ORM 매핑되나 PR1 시점엔 INSERT/SELECT 하는 코드가 없어 즉시 500 위험 0. 빌링키 발급/결제 엔드포인트(PR2+) 머지 전 prod 적용 필수. `CREATE TABLE/INDEX IF NOT EXISTS` 라 멱등·안전. 공유 DB(mibunyang) 영향 = 신규 테이블이라 0.
  - V035 = 코드보다 prod 선행 실행 완료 — `paid_until`(user_profiles)·`Payment` 가 ORM 매핑돼 INSERT/SELECT 목록 포함 → 컬럼/테이블 부재 시 get_current_user·결제 엔드포인트 500 이었으나, 세션 322 에 적용·재검증 완료. `ADD COLUMN/CREATE TABLE IF NOT EXISTS` 라 멱등·안전.
  - V034 = 코드보다 prod 선행 실행 완료 — broker_verified 등 3컬럼이 ORM 에 매핑돼 INSERT/SELECT 목록 포함 → 컬럼 부재 시 submit/status/admin 전부 500. `ADD COLUMN IF NOT EXISTS` 라 멱등·안전.
  - ⚠ V033 = 코드보다 **prod 선행 실행 필수** — ORM 에 phone 매핑돼 INSERT/SELECT 컬럼 목록에 포함되므로, 컬럼 부재 시 submit/status/admin 전부 500. `ADD COLUMN IF NOT EXISTS` 라 멱등·안전.
- ⚠️ **마이그레이션 자동 러너 없음** — V030/V031 + `db/maintenance/*.sql` 은 Supabase SQL Editor **수동 실행** 필수 (파일만 있으면 효과 0). 정기 VACUUM 은 `vacuum_maintenance` 스케줄러 잡(매일 03:50)이 자동 처리.
  - V031 = anon/authenticated 의 articles/complexes/trades/complex_price_history SELECT·쓰기 GRANT REVOKE + permissive 정책 DROP. 외부가 anon key 로 매물 전량 긁어 micro RAM 압박(세션 261 실증, PostgREST 부하 1위)한 것 차단 + B2B 모델 유출 봉합. 적용 후 `db/maintenance/verify_anon_shared_locked.sql` 로 라이브 검증. 회귀 가드 = `tests/test_migration_v031_anon_lock.py` (SQLite 라 텍스트 자산 검사).

## 코드 구조 (분리 완료)

- BE service.py → **5 파일** (`service.py` barrel + `service_common`/`service_discover`/`service_price`/`service_public` 4 분할)
- BE formatters/ → **5 파일** (`analysis`/`area_price_detail`/`complex_area`/`price_core`/`school`)
- BE db/ → **14 파일** (`__init__`/`article_queries`/`complex_queries`/`database`/`mb_apartment_queries`/`mb_misc_queries`/`mb_models`/`mb_queries` barrel/`mb_query_helpers`/`models`/`price_queries`/`queries` barrel/`query_helpers`/`stats_queries`)
- BE serializers → **3 파일** (`routers/serializers.py` barrel + `routers/estate_serializers.py` + `routers/mb_serializers.py`)

> **공인중개사 검증 + 미분양 중복 제거**: `backend/.claude/details.md` 참조
