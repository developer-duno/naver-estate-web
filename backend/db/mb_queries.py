"""Barrel re-export — mibunyang 읽기 쿼리 (기존 import 호환 유지)

서브모듈 3개:
  db/mb_query_helpers.py      — 중복 제거 · 정렬 · 필터 헬퍼
  db/mb_apartment_queries.py  — 아파트 단지 · 미분양 조회
  db/mb_misc_queries.py       — 지역 통계 · 실거래 · 단지 부속 정보
"""

from db.mb_apartment_queries import (  # noqa: F401
    count_apartments,
    get_apartment_by_id,
    get_apartments,
    get_apartments_page,
    get_competition_page,
    get_gu_list,
    get_presale_page,
    get_presale_schedules,
    get_unit_supplies,
    get_unsold_by_region,
    get_unsold_history,
)
from db.mb_misc_queries import (  # noqa: F401
    count_trades,
    get_apartment_prices,
    get_builder,
    get_infra,
    get_region_stats,
    get_school,
    get_trade_stats,
    get_trades,
    get_transport,
)
from db.mb_query_helpers import (  # noqa: F401
    _build_mb_order_clause,
    _build_mb_trade_order_clause,
    extract_base_name,
)
