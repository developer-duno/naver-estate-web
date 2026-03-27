# Backend — FastAPI + SQLAlchemy

## 디렉토리 구조

| 경로 | 역할 |
|------|------|
| `main.py` | FastAPI 앱 진입점, 라우터 등록, CORS |
| `deps.py` | 인증 의존성 (get_current_user, get_admin_user) |
| `routers/live.py` | 실시간 크롤링 API (핵심) |
| `routers/complexes.py` | 단지 조회/필터/시세/가격추이 |
| `routers/articles.py` | 매물 조회/엑셀 내보내기 |
| `routers/admin.py` | 관리자 API |
| `routers/serializers.py` | ORM → dict 변환 |
| `db/models.py` | SQLAlchemy ORM 모델 |
| `db/queries.py` | DB 쿼리 함수 |
| `shared/naver_api.py` | NaverEstateAPI (수정 금지) |
| `shared/constants.py` | 상수 (수정 금지) |
| `auth/rate_limiter.py` | IP 기반 요청 제한 |
| `crawler/service.py` | 크롤링 서비스 (시세 수집, 공공데이터) |
| `crawler/scheduler.py` | APScheduler 스케줄 (매물/시세/공공데이터) |
| `crawler/public_data_api.py` | 국토교통부 공공데이터 API |
| `services/cache.py` | TTLCache (동적/고정 TTL) |

## CORS 미들웨어 순서 (중요)

- `RateLimitMiddleware` → `CORSMiddleware` 순서로 등록 (CORS가 마지막 = 가장 먼저 실행)
- 반대로 하면 OPTIONS preflight가 429 반환
