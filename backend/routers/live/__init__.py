"""live 패키지 — 실시간 크롤링 API

sub-modules: _shared, search, crawl, _crawl_bg, _detail_worker, price
"""

# 서브모듈 import → @router 데코레이터 등록  # noqa: I001
from routers.live import crawl as _crawl_mod  # noqa: F401, I001
from routers.live import price as _price_mod  # noqa: F401, I001
from routers.live import search as _search_mod  # noqa: F401, I001
from routers.live._shared import (  # noqa: I001
    CRAWL_REAL_ESTATE_TYPES as CRAWL_REAL_ESTATE_TYPES,
    MAX_SEARCH_PAGES as MAX_SEARCH_PAGES,
    _crawl_lock as _crawl_lock,
    _crawl_status as _crawl_status,
    _price_collect_lock as _price_collect_lock,
    _price_collect_status as _price_collect_status,
    router as router,
)
from routers.live.search import (  # noqa: I001
    _parse_allowed_types as _parse_allowed_types,
    _search_all_types as _search_all_types,
)
