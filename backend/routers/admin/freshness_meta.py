"""데이터 신선도 카드 — 종목별 메타·임계치

표시 종목 13개의 라벨, 작업 주기(초), 기준 scheduler_job_id, 헛바퀴 감지 룰.
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
        # 세션 359: 전수조사로 발견된 사각지대. air_quality/childcare/crime_stats 는
        # 이미 등록됐는데 같은 인프라 계열인 emergency 만 등록 누락 — Infra 테이블에
        # emergency_updated_at 컬럼이 없어(emergency_hospital 등 값 컬럼만 존재)
        # CrawlJob.completed_at 경유(childcare 와 동일 패턴)로 최신성을 측정한다.
        "key": "emergency",
        "label": "응급의료기관",
        "expected_interval_seconds": 86400 * 30,  # 매월 첫째 월 03:00
        "scheduler_job_id": "collect_emergency",
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
        # trades 는 mibunyang 이 매월 6일 단독 write 하는 외부 소유 테이블 —
        # naver-estate 는 read-only(write 0건). 그래서 신선도 주기는 mibunyang 의
        # 월간 수집(30일) 기준이며 unsold 와 동형. collect_public_trades 잡은
        # complex_price_history 에 쓰지 trades 에 안 쓰므로 이 종목과 무관 → job_id=None.
        # ⚠ 거짓경보 회귀 방지(세션 343): 예전엔 7일/collect_public_trades 로 잘못 붙어
        # 매월 하순 trades age 가 21일(7일×3)을 넘겨 red → 텔레그램 가짜 경보를 냈다
        # (prod 실측 2026-07-04: max(recorded_at)=6-06, age 28.6일 = 7일 기준 4.09× red).
        # 30일 기준이면 0.95× green, red 임계 90일 → 진짜 3개월+ 장기 단절만 경보.
        "key": "public_trades",
        "label": "실거래가(미분양 수집)",
        "expected_interval_seconds": 86400 * 30,
        "scheduler_job_id": None,
        "new_rows_kind": None,  # trades 외부, created_at 없음
        "new_rows_expected": False,
    },
    {
        # "조용한 실패" 사각지대 메움 (세션 359) — officetel_presale_schedule 은 매주
        # 전량 upsert 구조라 created_at 컬럼이 없다(fetched_at 만 존재). API 가 예외 없이
        # 빈 응답을 줘도 job.status="completed"/total_items=0 으로 기록돼(정상 설계)
        # monitor.py 의 "작업 실패"(status=failed) 감지를 우회한다 — 이 카드가 "데이터
        # 미축적"(신선도 red) 축으로 그 우회를 막는 마지막 안전망.
        "key": "officetel_presale",
        "label": "오피스텔 청약",
        "expected_interval_seconds": 86400 * 7,  # 주간(월요일 05:00)
        "scheduler_job_id": "collect_officetel_presale",
        "new_rows_kind": None,  # 전량 upsert — "신규 행" 개념 없음, fetched_at 최신성만 측정
        "new_rows_expected": False,
    },
    {
        "key": "rental_presale",
        "label": "민간임대 청약",
        "expected_interval_seconds": 86400 * 7,  # 주간(월요일 05:30)
        "scheduler_job_id": "collect_rental_presale",
        "new_rows_kind": None,  # 전량 upsert
        "new_rows_expected": False,
    },
    {
        "key": "official_price",
        "label": "공동주택 공시가격",
        "expected_interval_seconds": 86400 * 30,  # 월간(매월 15일 06:30)
        "scheduler_job_id": "official_price",
        "new_rows_kind": None,  # 전량 upsert
        "new_rows_expected": False,
    },
    {
        # 세션 359: 전수조사로 발견된 사각지대 — 매물 상세 보강(crawl_details)이
        # 몇 시간이고 매번 0건만 처리(candidates 소진 등)해도 status="completed"로
        # 정상 종료돼 monitor.py 의 "작업 실패"·"작업 마비" 축 어디도 안 걸린다.
        # articles 카드(key="articles")는 scheduler_job_id="crawl_articles"(별개 잡,
        # 매물 목록 수집)에 매여 있어 이 잡을 대신 커버하지 못한다 — 전용 카드 신설.
        "key": "article_detail",
        "label": "매물 상세 보강",
        "expected_interval_seconds": 1800 * 3,  # 30분 interval 의 3배(90분) — 배치 스킵 1~2회 여유
        "scheduler_job_id": "crawl_details",
        "new_rows_kind": None,  # CrawlJob.completed_at 경유(childcare 패턴), created_at 무관
        "new_rows_expected": False,
    },
    {
        # 세션 359: 17개 스케줄러 잡 전수조사에서 "시급하지 않음"으로 분류됐던
        # 것을 사장님 지시("전체적으로 다 고쳐야")에 맞춰 마저 메운다. 매일 12시간
        # interval 로 도는데 시세 이력이 없는 단지가 소진되면(nearby_median_price
        # NULL 단지 고갈) 매번 0건만 처리해도 completed 로 조용히 끝날 수 있다.
        "key": "complex_metric",
        "label": "단지 가치지표 수집",
        "expected_interval_seconds": 43200 * 3,  # 12시간 interval 의 3배(36시간)
        "scheduler_job_id": "collect_metrics",
        "new_rows_kind": None,  # CrawlJob.completed_at 경유(childcare 패턴)
        "new_rows_expected": False,
    },
]
