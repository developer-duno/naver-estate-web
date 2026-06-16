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
PAGE_COMMIT_INTERVAL = 1         # 매 페이지마다 DB 커밋 (크롤 중 FE 실시간 반영용)
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

# -- 단지별 active guard --
# 스케줄러 배치(crawl_articles_batch)와 live 경로(_background_crawl)가 같은
# complex_no를 동시에 긁어 DB upsert 충돌 / 네이버 2배 호출을 내지 않도록
# 전역 active set을 공유. 먼저 들어온 쪽이 소유권을 가지며, 뒤늦게 온
# 호출은 skip된다. 반드시 try/finally로 release 보장.
_active_complexes: set[str] = set()


def try_acquire_complex(complex_no: str) -> bool:
    """complex_no에 대한 크롤 소유권 획득 시도. 이미 진행 중이면 False."""
    with _crawl_lock:
        if complex_no in _active_complexes:
            return False
        _active_complexes.add(complex_no)
        return True


def release_complex(complex_no: str) -> None:
    """크롤 종료 시 소유권 반환. try/finally에서 반드시 호출."""
    with _crawl_lock:
        _active_complexes.discard(complex_no)

# -- Price history collection --
_price_collect_status: dict[str, dict] = {}
_price_collect_lock = threading.Lock()
_price_collect_semaphore = threading.Semaphore(3)

# -- Price collect timeout/TTL --
_PRICE_COLLECT_TIMEOUT = 600   # 10분 — stale collection 정리
_PRICE_COLLECT_TTL = 86400     # 24시간 — 재수집 방지

# -- Live search 동시성 가드 --
# 캐시 miss 로 네이버를 실제 호출하는 검색의 동시 실행 수 상한. 동시 검색 폭주 시
# Starlette threadpool 고갈 → 전 sync 라우트 stall + 네이버 IP 차단을 막는다
# (infra.md §IP차단 방지). 캐시 hit 은 이 세마포어를 우회(네이버 호출 0).
# _price_collect_semaphore(Semaphore(3)) 선례 답습 — 단 검색은 blocking=True+timeout.
_live_search_semaphore = threading.Semaphore(10)
_LIVE_SEARCH_ACQUIRE_TIMEOUT = 20.0   # 슬롯 대기 상한(초). 초과 시 503.


def _update_crawl_status(complex_no: str, **kwargs):
    """스레드 안전 크롤 상태 업데이트. key 없으면 신규 생성."""
    with _crawl_lock:
        if complex_no in _crawl_status:
            _crawl_status[complex_no].update(kwargs)
        else:
            _crawl_status[complex_no] = dict(kwargs)
