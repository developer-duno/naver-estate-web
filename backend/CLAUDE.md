# Backend — FastAPI + SQLAlchemy

Next.js + FastAPI + Supabase 기반 부동산 웹 서비스의 백엔드 모듈입니다.

## 🚀 핵심 실행 및 검증 명령

```bash
# 개발 서버 실행 (반드시 backend/ 디렉터리 안에서)
uvicorn main:app --host 0.0.0.0 --port 8002 --reload

# 린트 검사 (커밋 전 필수)
ruff check .

# 테스트 스위트 실행 (SQLite 기반 격리 실행)
python -m pytest --tb=short -q
```

---

## 🛡️ 핵심 아키텍처 규칙 & 안전 제약

1. **엄격한 계층 경계 준수**:
   - `db/` 계층에서 상위 `routers/` 모듈을 절대 import하지 않습니다. (역참조 0건 유지)
2. **실시간 네이버 크롤링 & 세마포어**:
   - 사전 수집이 아닌 검색 시점 실시간 수집. `curl_cffi` 기반 차단 방지 및 `_live_search_semaphore` 준수.
   - 네이버 쿨다운(429) 발생 시 사이트 먹통 방지를 위해 DB 단지 검색(`db_fallback`)으로 자동 전환.
3. **결제 잠금 상태 (PAYMENT_ENABLED)**:
   - 코드 기본값은 `PAYMENT_ENABLED=false` (무료 운영 중). 결제 API 7종은 **403**(`결제 기능이 비활성화되어 있습니다`) 반환이 정상 동작입니다.
4. **미들웨어 순서 (CORS & RateLimit)**:
   - `RateLimitMiddleware` → `CORSMiddleware` 순서로 등록해야 OPTIONS preflight가 429로 튕기지 않습니다.
5. **관리자 판정 기준**:
   - `deps.is_admin_user()` = `role == "admin"` 또는 `user_id ∈ ADMIN_USER_IDS` 사용. **이메일로 관리자를 판정하지 않습니다** (세션 417).
6. **CI 테스트 환경 (SQLite)**:
   - CI는 file-based SQLite + NullPool을 사용하므로, PostgreSQL 전용 문법(예: `NOW() - INTERVAL`) 대신 파이썬 측에서 계산해 바인딩합니다.

---

## 📁 주요 디렉토리 구조

| 경로 | 역할 |
|---|---|
| `main.py` | FastAPI 앱 진입점, lifespan(스케줄러 락, stale job 정리), 미들웨어, 라우터 등록 |
| `deps.py` | 인증/인가 의존성 (Supabase JWT ES256 로컬 검증, 관리자 판정) |
| `routers/live/` | 실시간 크롤링 및 검색 API (`search.py`, `crawl.py`, `price.py`) |
| `routers/complexes.py` | 단지 조회/필터/시세/가격추이 API |
| `routers/articles.py` | 매물 조회/엑셀 내보내기 (xlsxwriter 엔진) |
| `routers/admin/` | 관리자 API 분할 10개 모듈 |
| `routers/mb.py` | 미분양/청약/지역통계 API |
| `db/models.py` | SQLAlchemy ORM 모델 (단지, 매물, 실거래가 등) |
| `db/database.py` | DB 연결 풀(SQLAlchemy) 및 세션 팩토리 |
| `db/migrations/` | SQL 마이그레이션 (V000~V074, 75 버전) |
| `crawler/scheduler.py` | APScheduler 정기 수집/백필 (단일 인스턴스 파일락 기반) |
| `crawler/service.py` | 크롤링 서비스 통합 re-export |
| `shared/naver_api.py` | NaverEstateAPI 네이버 연동 클라이언트 (임의 수정 금지) |

---

## 📋 새 스케줄러 잡 추가 체크리스트

| # | 등록 위치 | 등록 내용 및 주의사항 |
|---|---|---|
| 1 | `crawler/scheduler.py` | `add_job(id="...", name="...")` (name은 쉬운 우리말) |
| 2 | `crawler/job_error_listener.py` | `_JOB_LABEL_FALLBACK`에 동일 우리말 라벨 등록 |
| 3 | `routers/admin/freshness_meta.py` | `FRESHNESS_ITEMS` 신선도 감시 등록 |
| 4 | `routers/admin/scheduler.py` | `SCHEDULER_JOB_META` 관리자 화면 메타 등록 |
| 5 | `crawler/plain_words.py` | `JOB_WORDS` + FE `crawl-job-labels.ts` 동기화 |
| 6 | `crawler/monitor.py` | `_STALE_HOURS_BY_TYPE` 타임아웃 상한 설정 |
| 7 | `scripts/gen_restart_schedule_table.py` | 시각표 재생성 (`--write ../.claude/rules/release.md`) |
| 8 | `.claude/rules/infra.md` | 스케줄러 설명 표 행 추가 |

---

## 🗄️ DB 마이그레이션 현황

- **방식**: Flyway 스타일 SQL 파일 (`db/migrations/V000__` ~ `V074__`, 총 75 버전)
- **최신 버전**: **V074** (`complex_area_trade_stats.trades` 거래 하나하나 칸, 2026-10-25 적용 완료) — V072 `region_stats`(10-18) · V073 `complex_area_trade_stats`+`complexes.rep_area_m2`(10-19)
- **적용 규칙**: 자동 러너 없음 (Supabase SQL Editor 수동 적용 원칙, 백업 후 선행 적용 필수)
- 📖 **V014~V074 전 버전 상세 적용 역사 & 사후 검증 기록**: [`.claude/rules-detail/backend-details.md`](../.claude/rules-detail/backend-details.md#db-마이그레이션-실행-완료) 참조

---

## 📚 상세 토픽 문서

- 백엔드 종합 상세 역사 및 마이그레이션 전수 기록: [`.claude/rules-detail/backend-details.md`](../.claude/rules-detail/backend-details.md)
- 공인중개사 검증 및 미분양 상세 워크플로: [`backend/.claude/details.md`](./.claude/details.md)
- 스케줄러 일정 및 인프라 가이드: [`.claude/rules/infra-scheduler.md`](../.claude/rules/infra-scheduler.md)
