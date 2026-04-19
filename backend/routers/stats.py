"""통계 API 엔드포인트"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db import queries
from deps import get_db
from services.cache import get_cache

router = APIRouter()

_STATS_CACHE_KEY = "db_stats"


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """DB 통계 (홈페이지용). 동적 TTL 캐시 (KST 시간대별 30m~3h)."""
    cache = get_cache("stats", dynamic=True)
    cached = cache.get(_STATS_CACHE_KEY)
    if cached is not None:
        return cached
    result = queries.get_db_stats(db)
    cache.set(_STATS_CACHE_KEY, result)
    return result
