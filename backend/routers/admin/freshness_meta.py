"""데이터 신선도 카드 — 종목별 메타·임계치

표시 종목 8개의 라벨, 작업 주기(초), 기준 scheduler_job_id, 헛바퀴 감지 룰.
신호등 임계치는 주기의 1.5배(노랑) / 3배(빨강).

- scheduler_job_id: crawler/scheduler.py SCHEDULER_JOB_META 와 일치 유지
- new_rows_kind: 작업 후 신규 행 카운트 방식
    "created_at" — 테이블의 created_at 으로 정확히 신규만 (articles/complexes)
    "recorded_at" — 작업 시작 후 갱신된 행 수 (신규+업데이트, complex_price_history)
    None — 측정 불가 (외부 프로젝트 / 컬럼 없음)
- new_rows_expected: True 면 작업 후 신규 행 0 일 때 헛바퀴 빨강 격상
"""

FRESHNESS_ITEMS: list[dict] = [
    {
        "key": "complexes",
        "label": "단지",
        "expected_interval_seconds": 86400 * 7,
        # crawl_articles 부수효과로 신규 단지 발견 — 그 작업 기준
        "scheduler_job_id": "crawl_articles",
        "new_rows_kind": "created_at",
        "new_rows_expected": False,  # 단지는 매번 신규 안 나와도 정상
    },
    {
        "key": "articles",
        "label": "매물",
        "expected_interval_seconds": 43200,
        "scheduler_job_id": "crawl_articles",
        "new_rows_kind": "created_at",
        "new_rows_expected": True,  # 매물 크롤은 신규 매물이 나와야 정상
    },
    {
        "key": "complex_price_history",
        "label": "시세 이력",
        "expected_interval_seconds": 86400 * 7,
        "scheduler_job_id": "collect_prices",
        "new_rows_kind": "recorded_at",
        "new_rows_expected": True,  # 시세 수집은 갱신 데이터 포인트가 있어야 정상
    },
    {
        "key": "unsold",
        "label": "미분양 이력",
        "expected_interval_seconds": 86400 * 30,
        "scheduler_job_id": None,  # 외부 mibunyang 프로젝트
        "new_rows_kind": None,
        "new_rows_expected": False,
    },
    {
        "key": "air_quality",
        "label": "대기질",
        "expected_interval_seconds": 86400,
        "scheduler_job_id": "collect_air_quality",
        "new_rows_kind": None,  # infra.created_at 없음
        "new_rows_expected": False,
    },
    {
        "key": "childcare",
        "label": "어린이집",
        "expected_interval_seconds": 86400 * 30,
        "scheduler_job_id": "collect_childcare",
        "new_rows_kind": None,
        "new_rows_expected": False,
    },
    {
        "key": "crime_stats",
        "label": "범죄통계",
        "expected_interval_seconds": 86400 * 90,
        "scheduler_job_id": "collect_crime_stats",
        "new_rows_kind": None,
        "new_rows_expected": False,
    },
    {
        "key": "public_trades",
        "label": "공공데이터 실거래가",
        "expected_interval_seconds": 86400 * 7,
        "scheduler_job_id": "collect_public_trades",
        "new_rows_kind": None,  # trades 외부, created_at 없음
        "new_rows_expected": False,
    },
]
