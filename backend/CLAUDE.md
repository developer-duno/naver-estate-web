# Backend — FastAPI + SQLAlchemy

## 디렉토리 구조

| 경로 | 역할 |
|------|------|
| `main.py` | FastAPI 앱 진입점, 라우터 등록, CORS |
| `deps.py` | 인증 의존성 (get_current_user, get_approved_user, get_admin_user) |
| `routers/live.py` | 실시간 크롤링 + 실거래가 on-demand 수집 API |
| `routers/complexes.py` | 단지 조회/필터/시세/가격추이 |
| `routers/articles.py` | 매물 조회/엑셀 내보내기 (xlsxwriter 엔진) |
| `routers/crawl.py` | 관리자 크롤링 트리거 |
| `routers/admin.py` | 관리자 API |
| `routers/stats.py` | 통계 API |
| `routers/regions.py` | 지역 데이터 API |
| `routers/users.py` | 사용자 로그인 기록 |
| `routers/serializers.py` | ORM → dict 변환 |
| `db/models.py` | SQLAlchemy ORM 모델 |
| `db/queries.py` | DB 쿼리 함수 |
| `db/migrations/` | Flyway 스타일 SQL 마이그레이션 (V000~V011) |
| `shared/naver_api.py` | NaverEstateAPI (수정 금지) |
| `shared/constants.py` | 상수 (수정 금지) |
| `auth/permissions.py` | 역할 체크 (require_role) + 일일 쿼터 (check_quota) |
| `auth/rate_limiter.py` | IP 기반 요청 제한 |
| `auth/audit.py` | 감사 로그 |
| `crawler/service.py` | 크롤링 서비스 (시세 수집, 공공데이터, on-demand 수집) |
| `crawler/scheduler.py` | APScheduler 스케줄 (매물/시세/공공데이터/인기단지) |
| `crawler/public_data_api.py` | 국토교통부 공공데이터 API |
| `crawler/utils.py` | AdaptiveThrottle, CheckpointManager |
| `services/cache.py` | TTLCache (동적/고정 TTL, delete_by_prefix) |
| `services/upsert.py` | DB upsert 헬퍼 (_do_upsert: pg_insert/sqlite_insert 자동 분기) |
| `services/enricher.py` | 단지 상세 정보 보강 |

## 실거래가 on-demand 수집 (live.py)

| 엔드포인트 | 메서드 | 인증 | 설명 |
|-----------|--------|------|------|
| `/{no}/price-history/start-collect` | POST | admin/expert | 수집 시작 (24시간 TTL, Semaphore 3, 쿼터 제한) |
| `/{no}/price-history/collect-status` | GET | 없음 | 진행 상태 폴링 |

- 24시간 내 수집 데이터 있으면 `{"status": "fresh"}` 반환 (수집 스킵)
- 백그라운드 스레드에서 `collect_price_history_for_complex()` 호출
- on-demand 전용 throttle: `_throttle_ondemand` (min 2.0s, 스케줄러와 분리)
- 수집 중 실시간 진행률: `on_progress` 콜백으로 collected/failed/total 업데이트
- 완료 시 `_price_history_cache` 캐시 무효화 (delete_by_prefix)

## DB 듀얼 엔진 (mibunyang 통합 준비)

- `db/database.py`에 estate DB + mibunyang DB 듀얼 엔진 설정
- `MB_DATABASE_URL` 환경변수 있을 때만 mb 엔진 활성화 (조건부)
- `MBBase`, `MBSessionLocal`, `get_mb_db()` — mb 전용 세션

## CORS 미들웨어 순서 (중요)

- `RateLimitMiddleware` → `CORSMiddleware` 순서로 등록 (CORS가 마지막 = 가장 먼저 실행)
- 반대로 하면 OPTIONS preflight가 429 반환

## DB 마이그레이션

- `db/migrations/` 폴더에 `V000__` ~ `V011__` SQL 파일
- Supabase SQL Editor에서 수동 실행
- 롤백: 각 마이그레이션 파일의 역방향 SQL 실행
