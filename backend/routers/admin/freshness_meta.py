"""데이터 신선도 카드 — 종목별 메타·임계치

표시 종목 8개의 라벨과 작업 주기(초). scheduler.py SCHEDULER_JOB_META
와 일치 유지. 신호등 임계치는 주기의 1.5배(노랑) / 3배(빨강).
"""

# (key, label, expected_interval_seconds)
# - key: API 응답 식별자
# - label: 카드에 표시할 한국어 라벨
# - expected_interval_seconds: 정상 갱신 간격 (이 값의 1.5배 = yellow, 3배 = red)
FRESHNESS_ITEMS: list[dict] = [
    {"key": "complexes", "label": "단지", "expected_interval_seconds": 86400 * 7},
    {"key": "articles", "label": "매물", "expected_interval_seconds": 43200},
    {"key": "complex_price_history", "label": "시세 이력", "expected_interval_seconds": 86400 * 7},
    {"key": "unsold", "label": "미분양 이력", "expected_interval_seconds": 86400 * 30},
    {"key": "air_quality", "label": "대기질", "expected_interval_seconds": 86400},
    {"key": "childcare", "label": "어린이집", "expected_interval_seconds": 86400 * 30},
    {"key": "crime_stats", "label": "범죄통계", "expected_interval_seconds": 86400 * 90},
    {"key": "public_trades", "label": "공공데이터 실거래가", "expected_interval_seconds": 86400 * 7},
]
