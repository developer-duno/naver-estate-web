"""FastAPI 백엔드 진입점

실행: cd backend && uvicorn main:app --reload
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.responses import Response

from auth.rate_limiter import RateLimitMiddleware
from routers import admin, articles, complexes, crawl, live, regions, stats, users
from services.cache import get_dynamic_ttl

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

IS_DEBUG = os.getenv("DEBUG", "").lower() in ("1", "true")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 시 실행"""
    logger.info("FastAPI 서버 시작")
    scheduler = None
    try:
        from crawler.scheduler import create_scheduler

        scheduler = create_scheduler()
        scheduler.start()
        logger.info("크롤러 스케줄러 시작됨")
    except Exception as e:
        logger.warning("크롤러 스케줄러 시작 실패 (DB 미연결?): %s", e)

    yield

    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("크롤러 스케줄러 종료됨")
    logger.info("FastAPI 서버 종료")


app = FastAPI(
    title="네이버 아파트 매물 조회 API",
    description="네이버 부동산 데이터 기반 아파트 매물 조회/분석 API",
    version="1.0.0",
    lifespan=lifespan,
)

# GZip 압축 (1KB 이상 응답 자동 압축)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS 설정 (FRONTEND_URL: 콤마 구분 복수 도메인 지원)
_frontend_urls = os.getenv("FRONTEND_URL", "http://localhost:3000" if IS_DEBUG else "")
if not IS_DEBUG and not _frontend_urls:
    logger.critical("FRONTEND_URL 환경변수가 설정되지 않았습니다 (프로덕션 모드)")
allowed_origins = [u.strip() for u in _frontend_urls.split(",") if u.strip()]
if IS_DEBUG:
    for dev_url in ["http://localhost:3000", "http://localhost:3001"]:
        if dev_url not in allowed_origins:
            allowed_origins.append(dev_url)
# Rate Limiting 미들웨어 (CORS보다 먼저 등록 = CORS 이후에 실행)
app.add_middleware(RateLimitMiddleware)

# CORS 설정 (가장 먼저 실행되어야 preflight OPTIONS 처리 가능)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=3600,
)


# 보안 헤더 미들웨어
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if not IS_DEBUG:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # GET 응답에 엔드포인트별 캐시 적용
    if request.method == "GET" and request.url.path.startswith("/api/") and "Cache-Control" not in response.headers:
        path = request.url.path
        if path.startswith("/api/regions"):
            response.headers["Cache-Control"] = "public, max-age=86400"  # 24시간 (정적 데이터)
        elif "/articles" not in path and path.startswith("/api/complexes/"):
            response.headers["Cache-Control"] = "private, max-age=3600"  # 1시간 (단지 정보)
        elif path.startswith("/api/live/"):
            response.headers["Cache-Control"] = f"private, max-age={get_dynamic_ttl()}"
        else:
            response.headers["Cache-Control"] = "private, max-age=30"  # 30초 (기본)
    return response


# 라우터 등록
app.include_router(live.router, prefix="/api/live", tags=["실시간 크롤링"])
app.include_router(complexes.router, prefix="/api/complexes", tags=["단지"])
app.include_router(articles.router, prefix="/api/articles", tags=["매물"])
app.include_router(crawl.router, prefix="/api/crawl", tags=["크롤링"])
app.include_router(stats.router, prefix="/api", tags=["통계"])
app.include_router(regions.router, prefix="/api", tags=["지역"])
app.include_router(admin.router, prefix="/api/admin", tags=["관리자"])
app.include_router(users.router, prefix="/api/users", tags=["사용자"])


@app.get("/health")
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
