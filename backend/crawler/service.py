"""크롤링 서비스 barrel re-export — 기존 import 호환 유지

실제 구현은 도메인별 모듈로 분리됨:
  service_common.py — 공통 헬퍼 (시세 upsert, 체크포인트)
  service_discover.py — 단지 발견 + 매물 수집 + 상세 보강
  service_price.py — 시세 수집 (배치 + on-demand)
  service_public.py — 공공데이터 실거래가 수집
"""

from crawler.service_common import (  # noqa: F401
    _extract_price_list,
    _upsert_price_history,
)
from crawler.service_discover import (  # noqa: F401
    CRAWL_REAL_ESTATE_TYPES,
    crawl_article_details,
    crawl_articles_batch,
    crawl_complex_articles,
    crawl_complex_details_batch,
    crawl_popular_complexes,
    discover_all_regions,
    discover_complexes_by_region,
)
from crawler.service_price import (  # noqa: F401
    collect_price_history,
    collect_price_history_for_complex,
    contaminated_complex_nos,
    find_contaminated_b1_ids,
    recollect_b1_price_for_complex,
)
from crawler.service_public import collect_public_trade_data  # noqa: F401
