"""live 패키지 공유 상태 — router, 상수, 스레드 동기화, 캐시"""

import logging
import threading

from fastapi import APIRouter

from services.cache import get_cache

logger = logging.getLogger(__name__)
router = APIRouter()

# ── 크롤링 대상 매물유형 ──
CRAWL_REAL_ESTATE_TYPES = {"APT", "ABYG", "JGC", "PRE", "OPST", "OBYG", "RDV"}

# ── Rate limit & 배치 상수 ──
MAX_SEARCH_PAGES = 50            # 검색 최대 페이지 (무한 루프 방지)
INTER_PAGE_DELAY = 0.1           # 페이지 간 대기 (초) — shared _throttle(1.0s)이 실제 제한
INTER_GROUP_DELAY = 0.2          # 검색 그룹 간 대기 (초)
DETAIL_CRAWL_DELAY = 0.3         # 상세 크롤링 건별 대기 (초) — shared _throttle과 합산
PAGE_COMMIT_INTERVAL = 5         # N페이지마다 DB 커밋
DETAIL_COMMIT_INTERVAL = 50      # N건마다 DB 커밋
DETAIL_FAILURE_THRESHOLD = 0.5   # 상세 크롤 실패율 임계치 (50% 초과 시 done_partial)

# 네이버 검색 API 키워드 접미사 그룹
KEYWORD_SUFFIX_GROUPS = [
    (None, {"APT", "ABYG", "JGC", "PRE"}),           # 기본 검색 = 아파트 계열
    ("오피스텔", {"OPST", "OBYG"}),                     # "대전 오피스텔"
    ("재건축", {"JGC"}),                                # "대전 재건축"
]

# ── TTL Cache ──
_cache = get_cache("live", dynamic=True)

# -- Background crawl progress tracking --
_crawl_status: dict[str, dict] = {}
_crawl_lock = threading.Lock()

# -- Price history collection --
_price_collect_status: dict[str, dict] = {}
_price_collect_lock = threading.Lock()
_price_collect_semaphore = threading.Semaphore(3)

# -- Price collect timeout/TTL --
_PRICE_COLLECT_TIMEOUT = 600   # 10분 — stale collection 정리
_PRICE_COLLECT_TTL = 86400     # 24시간 — 재수집 방지


def _update_crawl_status(complex_no: str, **kwargs):
    """스레드 안전 크롤 상태 업데이트"""
    with _crawl_lock:
        if complex_no in _crawl_status:
            _crawl_status[complex_no].update(kwargs)
