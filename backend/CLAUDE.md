# Backend — FastAPI + SQLAlchemy

## 디렉토리 구조

| 경로 | 역할 |
| --- | --- |
| `main.py` | FastAPI 앱 진입점, 라우터 등록, CORS |
| `deps.py` | 인증 의존성 (get_current_user, get_approved_user, get_admin_user) |
| `routers/live/` | 실시간 크롤링 + 실거래가 on-demand 수집 API (search 등 분할) |
| `routers/complexes.py` | 단지 조회/필터/시세/가격추이 |
| `routers/articles.py` | 매물 조회/엑셀 내보내기 (xlsxwriter 엔진) |
| `routers/admin/` | 관리자 API 분할 9 파일 (`collect`/`data`/`freshness`/`freshness_meta`/`jobs`/`naver_calls`/`recrawl`/`scheduler`/`users` + `_shared`) |
| `routers/stats.py` | 통계 API |
| `routers/regions.py` | 지역 데이터 API |
| `routers/users.py` | 사용자 로그인 기록 |
| `routers/verify.py` | 공인중개사 검증 (odcloud API) |
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
| `crawler/scheduler.py` | APScheduler 스케줄 (매물/시세/공공데이터/인기단지) |
| `crawler/public_data_api.py` | 국토교통부 공공데이터 API |
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

- `db/migrations/` 폴더에 `V000__` ~ `V033__` SQL 파일 = 34 버전
- Supabase 에 SQLAlchemy 엔진으로 실행 (V023 = 973,837행 backfill)
- 롤백: 각 마이그레이션 파일의 역방향 SQL 실행
- 최신 = V033 (2026-06-15 prod 적용완료, 세션 307 라이브검증). 새 마이그레이션 시 본 표 1행 추가 의무 (`.claude/rules/release.md` 답습 — backend zombie 회피)
  - ⚠ V033 = 코드보다 **prod 선행 실행 필수** — ORM 에 phone 매핑돼 INSERT/SELECT 컬럼 목록에 포함되므로, 컬럼 부재 시 submit/status/admin 전부 500. `ADD COLUMN IF NOT EXISTS` 라 멱등·안전.
- ⚠️ **마이그레이션 자동 러너 없음** — V030/V031 + `db/maintenance/*.sql` 은 Supabase SQL Editor **수동 실행** 필수 (파일만 있으면 효과 0). 정기 VACUUM 은 `vacuum_maintenance` 스케줄러 잡(매일 03:50)이 자동 처리.
  - V031 = anon/authenticated 의 articles/complexes/trades/complex_price_history SELECT·쓰기 GRANT REVOKE + permissive 정책 DROP. 외부가 anon key 로 매물 전량 긁어 micro RAM 압박(세션 261 실증, PostgREST 부하 1위)한 것 차단 + B2B 모델 유출 봉합. 적용 후 `db/maintenance/verify_anon_shared_locked.sql` 로 라이브 검증. 회귀 가드 = `tests/test_migration_v031_anon_lock.py` (SQLite 라 텍스트 자산 검사).

## 코드 구조 (분리 완료)

- BE service.py → **5 파일** (`service.py` barrel + `service_common`/`service_discover`/`service_price`/`service_public` 4 분할)
- BE formatters/ → **5 파일** (`analysis`/`area_price_detail`/`complex_area`/`price_core`/`school`)
- BE db/ → **14 파일** (`__init__`/`article_queries`/`complex_queries`/`database`/`mb_apartment_queries`/`mb_misc_queries`/`mb_models`/`mb_queries` barrel/`mb_query_helpers`/`models`/`price_queries`/`queries` barrel/`query_helpers`/`stats_queries`)
- BE serializers → **3 파일** (`routers/serializers.py` barrel + `routers/estate_serializers.py` + `routers/mb_serializers.py`)

> **공인중개사 검증 + 미분양 중복 제거**: `backend/.claude/details.md` 참조
