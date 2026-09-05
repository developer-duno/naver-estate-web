"""APScheduler 기반 크롤러 스케줄러"""

import logging
import os
import re

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

from crawler.billing_charge import charge_due_billing_keys
from crawler.service import (
    backfill_price_batch,
    collect_price_history,
    crawl_article_details,
    crawl_articles_batch,
    crawl_complex_details_batch,
    crawl_popular_complexes,
    discover_all_regions,
)
from crawler.service_metrics import collect_complex_metrics
from crawler.vacuum_maintenance import run_vacuum_maintenance

load_dotenv()
logger = logging.getLogger(__name__)

CRAWL_INTERVAL_HOURS = int(os.getenv("CRAWL_INTERVAL_HOURS", "12"))
CRAWL_DETAIL_INTERVAL_MIN = int(os.getenv("CRAWL_DETAIL_INTERVAL_MIN", "30"))
CRAWL_DETAIL_BATCH_SIZE = int(os.getenv("CRAWL_DETAIL_BATCH_SIZE", "500"))
CRAWL_BATCH_SIZE = int(os.getenv("CRAWL_BATCH_SIZE", "50"))
POPULAR_CRAWL_ENABLED = os.getenv("POPULAR_CRAWL_ENABLED", "true").lower() == "true"
POPULAR_CRAWL_BATCH_SIZE = int(os.getenv("POPULAR_CRAWL_BATCH_SIZE", "50"))
PUBLIC_DATA_ENABLED = os.getenv("PUBLIC_DATA_ENABLED", "false").lower() == "true"
PUBLIC_DATA_BATCH_SIZE = int(os.getenv("PUBLIC_DATA_BATCH_SIZE", "300"))
OFFICIAL_PRICE_ENABLED = os.getenv("OFFICIAL_PRICE_ENABLED", "false").lower() == "true"
# K-apt 관리비 연동 (V051) — 기본 false. 첫 배포는 꺼서 나가고, 관리자 수동 트리거로
# 매칭·수집을 실측 검증한 뒤 켠다. ⚠ 단지 하나에 22콜(공용 17 + 개별 5)이 나가
# 배치 크기가 곧 쿼터 소모량이다. 관리비 두 서비스도 운영계정(10만/일) 전환이 끝나
# 500 으로 운영 중(2026-08-31 실측: 하루 kapt 32,035콜, 실패 0·쿼터 에러 0).
KAPT_ENABLED = os.getenv("KAPT_ENABLED", "false").lower() == "true"
KAPT_COST_BATCH_SIZE = int(os.getenv("KAPT_COST_BATCH_SIZE", "500"))
# 시세 이력 부족 단지 소급 수집 (국토교통부 실거래가). PUBLIC_DATA_ENABLED 와 같은
# data.go.kr 키 사용 — 일일 쿼터(10,000회, mibunyang 공유) 보호 위해 배치 작게.
PUBLIC_PRICE_BACKFILL_BATCH_SIZE = int(os.getenv("PUBLIC_PRICE_BACKFILL_BATCH_SIZE", "30"))
AIR_QUALITY_ENABLED = os.getenv("AIR_QUALITY_ENABLED", "false").lower() == "true"
AIR_QUALITY_BATCH_SIZE = int(os.getenv("AIR_QUALITY_BATCH_SIZE", "100"))
EMERGENCY_ENABLED = os.getenv("EMERGENCY_ENABLED", "false").lower() == "true"
EMERGENCY_BATCH_SIZE = int(os.getenv("EMERGENCY_BATCH_SIZE", "100"))
CHILDCARE_ENABLED = os.getenv("CHILDCARE_ENABLED", "false").lower() == "true"
# 0 = 전량(위경도 보유 2,938단지). 시군구당 1콜 + 런 내 캐시 재사용 구조라 전량이어도
# 호출 상한 = 단지가 걸친 (region,gu) 조합 수 ≈ 248 (2026-09-05 prod 실측).
CHILDCARE_BATCH_SIZE = int(os.getenv("CHILDCARE_BATCH_SIZE", "0"))
CRIME_STATS_ENABLED = os.getenv("CRIME_STATS_ENABLED", "false").lower() == "true"
COMPLEX_DETAIL_ENABLED = os.getenv("COMPLEX_DETAIL_ENABLED", "true").lower() == "true"
COMPLEX_DETAIL_BATCH_SIZE = int(os.getenv("COMPLEX_DETAIL_BATCH_SIZE", "1000"))
COMPLEX_DETAIL_APT_INTERVAL_HOURS = int(os.getenv("COMPLEX_DETAIL_APT_INTERVAL_HOURS", "4"))
COMPLEX_DETAIL_OPST_INTERVAL_HOURS = int(os.getenv("COMPLEX_DETAIL_OPST_INTERVAL_HOURS", "4"))
COMPLEX_METRIC_ENABLED = os.getenv("COMPLEX_METRIC_ENABLED", "true").lower() == "true"
COMPLEX_METRIC_BATCH_SIZE = int(os.getenv("COMPLEX_METRIC_BATCH_SIZE", "1000"))
# 빌링키 자동결제(정기결제 PR3) — 매일 04:50 next_charge_at 도래분 결제. 기본 활성.
BILLING_AUTO_CHARGE_ENABLED = os.getenv("BILLING_AUTO_CHARGE_ENABLED", "true").lower() == "true"
MONITOR_ENABLED = os.getenv("MONITOR_ENABLED", "false").lower() == "true"
MONITOR_INTERVAL_MIN = int(os.getenv("MONITOR_INTERVAL_MIN", "30"))
# 정기 VACUUM (ANALYZE) — articles/trades visibility map 재악화 차단 (세션 260)
VACUUM_MAINTENANCE_ENABLED = os.getenv("VACUUM_MAINTENANCE_ENABLED", "true").lower() == "true"
# data.go.kr API 버전 격변 감시 — 폐기된 엔드포인트 조기 경보 (2026-08-19 사고 재발방지).
# 기본 활성: 감시 자체가 비용 0 에 가깝고(주 1회 8회 호출), 꺼두면 사고가 그대로 재현된다.
API_VERSION_MONITOR_ENABLED = os.getenv("API_VERSION_MONITOR_ENABLED", "true").lower() == "true"

# 모듈 레벨 스케줄러 참조 — admin API에서 다음 실행 시각 조회용
_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler | None:
    """실행 중인 스케줄러 인스턴스 반환 (미실행 시 None)"""
    return _scheduler


# add_job( 호출 시작 지점을 찾는 정규식 — 여기서부터 블록 단위로 id 를 찾는다.
# 파일 전체를 무차별로 id=<문자열> 패턴 스캔하면 주석·docstring 안에 우연히
# 같은 모양 문구가 있을 때 오탐한다(구현 중 실측 발견 — 세션 359). add_job(
# 호출 블록 안에서만 id 를 찾으면 이 오탐이 원천 차단된다.
#
# ⚠ 이 헬퍼는 반드시 create_scheduler() 정의보다 "앞"(= 파일의 모든 add_job(
# 호출보다 앞)에 위치해야 한다 — extract_scheduler_job_ids() 는 "각 add_job(
# 호출 지점부터 다음 add_job( 또는 파일 끝까지"를 한 블록으로 보는데, 만약
# 이 함수를 create_scheduler() *뒤*에 두면 마지막 add_job 호출 이후 "파일
# 끝까지"의 마지막 블록 안에 이 함수 자신의 소스 코드(주석 포함)까지
# 포함되어 자기 자신을 오탐하는 사고가 난다(구현 중 실측 발견).
_ADD_JOB_CALL_PATTERN = re.compile(r"\.add_job\(")
_STATIC_ID_PATTERN = re.compile(r'\bid="([a-zA-Z0-9_]+)"')


def extract_scheduler_job_ids(source: str) -> list[str]:
    """스케줄러 소스 텍스트에서 add_job 호출의 정적 id 리터럴 전부 추출.

    "새 스케줄러 잡을 추가하면서 감시 등록을 깜빡하는" 실수를 CI 가 구조적으로
    막기 위한 test_scheduler_monitoring_coverage.py 전용 헬퍼 (mibunyang
    RECORD_ALLOWLIST 패턴 답습). 순수 함수 — 부작용 없음(파일을 열지 않고
    이미 읽은 소스 텍스트 문자열을 인자로 받는다).

    구현 방식: 각 add_job 호출 지점부터 다음 add_job 호출(또는 파일 끝)까지를
    한 블록으로 보고, 그 블록 안에서만 id 큰따옴표 문자열 리터럴을 찾는다.
    파일 전체를 무차별 스캔하지 않으므로 add_job 호출 밖의 주석·docstring 에
    있는 우연한 문구에 오염되지 않는다.

    ⚠ 커버리지 범위 = "정적 id 문자열"만. create_scheduler() 안에는 for 루프로
    id 를 동적 생성하는 add_job 호출이 2곳 있다 (popular_1030/1430/1900,
    complex_detail_JGC/ABYG/OBYG) — 이 6개는 문자열 소스 파싱만으로는 안전하게
    전개할 수 없어(루프 변수 실행이 필요) 이 함수는 그 블록을 만나면 id 를
    아예 추가하지 않고 건너뛴다(동적 블록도 오탐 없이 무시). 이 6개는
    routers/admin/scheduler.py 의 SCHEDULER_JOB_META 표시 메타에는 이미 개별
    등록돼 있으나, freshness_meta.py(FRESHNESS_ITEMS/MONITORING_EXEMPT) 쪽은
    세션 359 조사에서 다루지 않은 별도 사각지대로 남아 있다(다음 세션 후보).
    """
    call_starts = [m.start() for m in _ADD_JOB_CALL_PATTERN.finditer(source)]
    call_starts.append(len(source))

    ids: list[str] = []
    for i in range(len(call_starts) - 1):
        block = source[call_starts[i] : call_starts[i + 1]]
        static_match = _STATIC_ID_PATTERN.search(block)
        if static_match:
            ids.append(static_match.group(1))
        # 동적 id(f"..." 또는 job_id 변수)는 의도적으로 건너뜀 — docstring 답습.
    return ids


def create_scheduler() -> BackgroundScheduler:
    """크롤러 스케줄러 생성 (BackgroundScheduler — 메인 스레드 차단 없음).

    add_job 호출을 래핑해 같은 id 두 번 등록 시 즉시 ValueError. APScheduler
    기본 동작은 silent 허용이라 동적 id (예: f"popular_{hour}") 충돌 시 발견
    지연 — 시작 시점에 즉시 적발.
    """
    scheduler = BackgroundScheduler()
    _seen_ids: set[str] = set()
    _orig_add_job = scheduler.add_job

    def _add_job_unique(*args, **kwargs):
        job_id = kwargs.get("id")
        if job_id is None and len(args) >= 4:
            # add_job(func, trigger, args, kwargs, id, ...) 위치 인자 호환
            job_id = args[4] if len(args) > 4 else None
        if job_id is not None:
            if job_id in _seen_ids:
                raise ValueError(
                    f"create_scheduler: 같은 id '{job_id}' 가 두 번 등록됨 — "
                    "동적 id 생성 시 충돌 의심"
                )
            _seen_ids.add(job_id)
        return _orig_add_job(*args, **kwargs)

    scheduler.add_job = _add_job_unique  # type: ignore[method-assign]

    # A. 단지 발견 — 주 1회 일요일 새벽 3시
    scheduler.add_job(
        discover_all_regions,
        "cron",
        day_of_week="sun",
        hour=3,
        kwargs={"scheduler_job_id": "discover_regions"},
        id="discover_regions",
        name="전국 단지 발견",
        misfire_grace_time=3600,
    )

    # B. 매물 수집 — N시간마다 (jitter: mibunyang 08:00 월/목 크롤링과 충돌 회피)
    #    max_instances=1: 이전 배치가 안 끝났는데 다음 주기가 시작되는 중복 실행 차단
    #    (cron job 들과 일관성 — 동시 크롤은 같은 IP 부하·DB 경합 유발).
    scheduler.add_job(
        crawl_articles_batch,
        "interval",
        hours=CRAWL_INTERVAL_HOURS,
        jitter=2700,
        kwargs={"batch_size": CRAWL_BATCH_SIZE, "scheduler_job_id": "crawl_articles"},
        id="crawl_articles",
        name="매물 수집 배치",
        max_instances=1,
        misfire_grace_time=1800,
    )

    # C. 상세 보강 — 30분마다 (jitter: 같은 IP 네이버 요청 분산)
    #    max_instances=1: B 와 동일 — 30분 주기가 밀려도 중복 실행 안 함.
    scheduler.add_job(
        crawl_article_details,
        "interval",
        minutes=CRAWL_DETAIL_INTERVAL_MIN,
        jitter=900,
        kwargs={"batch_size": CRAWL_DETAIL_BATCH_SIZE, "scheduler_job_id": "crawl_details"},
        id="crawl_details",
        name="매물 상세 보강",
        max_instances=1,
        misfire_grace_time=900,
    )

    # D. 시세 수집 — 주 1회 수요일 새벽 4시 (Phase 1)
    scheduler.add_job(
        collect_price_history,
        "cron",
        day_of_week="wed",
        hour=4,
        kwargs={"batch_size": CRAWL_BATCH_SIZE, "scheduler_job_id": "collect_prices"},
        id="collect_prices",
        name="시세 이력 수집",
        misfire_grace_time=3600,
    )

    # D-2. 시세 이력 소급 수집 — 매일 새벽 3시 30분
    #   complex_price_history 6행 미만 단지를 세대수 상위순으로 국토교통부
    #   실거래가 backfill. 가치지표(M)의 집계 대상 단지를 늘리는 근본 경로.
    #   공공데이터 API 라 네이버 IP 차단 무관. PUBLIC_DATA_ENABLED 토글 공유
    #   (같은 data.go.kr 키) — 토요일 collect_public_trades 와 시각 분리.
    if PUBLIC_DATA_ENABLED:
        scheduler.add_job(
            backfill_price_batch,
            "cron",
            hour=3,
            minute=30,
            kwargs={"batch_size": PUBLIC_PRICE_BACKFILL_BATCH_SIZE, "scheduler_job_id": "backfill_price"},
            id="backfill_price",
            name="시세 이력 소급 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("시세 이력 소급 수집 활성화: 매일 03:30 (배치 %d)", PUBLIC_PRICE_BACKFILL_BATCH_SIZE)

    # E. 인기 단지 선제적 크롤링 — 하루 3회 (10:45, 14:45, 19:15 KST)
    #    기존 스케줄(B: 12시간마다, C: 30분마다)과 충돌 회피
    #    2026-04-16: mibunyang 쿨다운 대응 — 기존 10:30/14:30/19:00에서 15분씩 시프트
    if POPULAR_CRAWL_ENABLED:
        for hour, minute, job_id in [(10, 45, "popular_1030"), (14, 45, "popular_1430"), (19, 15, "popular_1900")]:
            scheduler.add_job(
                crawl_popular_complexes,
                "cron",
                hour=hour,
                minute=minute,
                kwargs={"batch_size": POPULAR_CRAWL_BATCH_SIZE, "scheduler_job_id": job_id},
                id=job_id,
                name=f"인기 단지 크롤링 {hour:02d}:{minute:02d}",
                max_instances=1,
                misfire_grace_time=1800,
            )
        logger.info("인기 단지 선제적 크롤링 활성화: 10:45, 14:45, 19:15 (배치 %d)", POPULAR_CRAWL_BATCH_SIZE)

    # K. 단지 상세 유형별 backfill — 매물유형별 독립 job
    #    APT(4.6만)·OPST(1.5만)는 interval 가속 (PR #19 매물상세 패턴 답습),
    #    소수 유형은 주 1회 07:00 cron 유지. jitter 로 같은 IP 다른 잡과 분산.
    if COMPLEX_DETAIL_ENABLED:
        # 대량 유형 — interval (env 시간 조절, 자동 감속 throttle 자율 보호)
        scheduler.add_job(
            crawl_complex_details_batch,
            "interval",
            hours=COMPLEX_DETAIL_APT_INTERVAL_HOURS,
            jitter=600,
            kwargs={"real_estate_type": "APT", "batch_size": COMPLEX_DETAIL_BATCH_SIZE,
                    "scheduler_job_id": "complex_detail_APT"},
            id="complex_detail_APT",
            name="단지 상세 backfill APT",
            max_instances=1,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            crawl_complex_details_batch,
            "interval",
            hours=COMPLEX_DETAIL_OPST_INTERVAL_HOURS,
            jitter=600,
            kwargs={"real_estate_type": "OPST", "batch_size": COMPLEX_DETAIL_BATCH_SIZE,
                    "scheduler_job_id": "complex_detail_OPST"},
            id="complex_detail_OPST",
            name="단지 상세 backfill OPST",
            max_instances=1,
            misfire_grace_time=3600,
        )
        # 소수 유형 — 주 1회 07:00 (요일 분산)
        for dow, rtype in [("tue", "JGC"), ("wed", "ABYG"), ("thu", "OBYG")]:
            scheduler.add_job(
                crawl_complex_details_batch,
                "cron",
                day_of_week=dow,
                hour=7,
                jitter=600,
                kwargs={"real_estate_type": rtype, "batch_size": COMPLEX_DETAIL_BATCH_SIZE,
                        "scheduler_job_id": f"complex_detail_{rtype}"},
                id=f"complex_detail_{rtype}",
                name=f"단지 상세 backfill {rtype} {dow} 07:00",
                max_instances=1,
                misfire_grace_time=3600,
            )
        logger.info(
            "단지 상세 backfill 활성화: APT %dh interval / OPST %dh interval 매일, "
            "JGC·ABYG·OBYG 주1회 07:00 (배치 %d)",
            COMPLEX_DETAIL_APT_INTERVAL_HOURS, COMPLEX_DETAIL_OPST_INTERVAL_HOURS, COMPLEX_DETAIL_BATCH_SIZE,
        )

    # F. 공공데이터 실거래가 수집 — 주 1회 토요일 새벽 5시
    #    네이버 API 보완용, IP 차단 우려 없음
    if PUBLIC_DATA_ENABLED:
        from crawler.service import collect_public_trade_data

        scheduler.add_job(
            collect_public_trade_data,
            "cron",
            day_of_week="sat",
            hour=5,
            kwargs={"batch_size": PUBLIC_DATA_BATCH_SIZE, "scheduler_job_id": "collect_public_trades"},
            id="collect_public_trades",
            name="공공데이터 실거래가 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("공공데이터 실거래가 수집 활성화: 토요일 05:00 (배치 %d)", PUBLIC_DATA_BATCH_SIZE)

    # F-1. 청약홈 오피스텔·민간임대 수집 — 주 1회 월요일 새벽 5시 (이슈 #323)
    #      공공데이터 실거래가(토요일 5시)와 겹치지 않게 요일 분리.
    if PUBLIC_DATA_ENABLED:
        from crawler.service_applyhome_officetel import collect_officetel_presale
        from crawler.service_applyhome_rental import collect_rental_presale

        scheduler.add_job(
            collect_officetel_presale,
            "cron",
            day_of_week="mon",
            hour=5,
            minute=0,
            kwargs={"scheduler_job_id": "collect_officetel_presale"},
            id="collect_officetel_presale",
            name="청약홈 오피스텔 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            collect_rental_presale,
            "cron",
            day_of_week="mon",
            hour=5,
            minute=30,
            kwargs={"scheduler_job_id": "collect_rental_presale"},
            id="collect_rental_presale",
            name="청약홈 민간임대 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("청약홈 오피스텔·민간임대 수집 활성화: 월요일 05:00/05:30")

    # F-2. 공동주택 공시가격 수집 — 매월 15일 새벽 6시 30분 (V-WORLD, 네이버 0)
    if OFFICIAL_PRICE_ENABLED:
        from crawler.service_official_price import collect_official_prices

        scheduler.add_job(
            collect_official_prices, "cron",
            day="15", hour=6, minute=30,
            kwargs={"scheduler_job_id": "official_price"},
            id="official_price", name="공동주택 공시가격 수집",
            max_instances=1, misfire_grace_time=3600,
        )
        logger.info("공동주택 공시가격 수집 활성화: 매월 15일 06:30")

    # F-3. K-apt 관리비 연동 (V051) — 매칭 월 1회 + 관리비 매일.
    #      06:10/06:20 = 매월15일 06:30 official_price·일요일 06:40 api_version_probe 와
    #      겹치지 않는 빈 슬롯. 네이버 API 0건이라 IP 차단 무관(data.go.kr 전용).
    if KAPT_ENABLED:
        from crawler.service_kapt import collect_kapt_costs, match_kapt_complexes

        scheduler.add_job(
            match_kapt_complexes,
            "cron",
            day="21", hour=6, minute=10,
            kwargs={"scheduler_job_id": "kapt_match"},
            id="kapt_match", name="K-apt 단지 매칭",
            max_instances=1, misfire_grace_time=3600,
        )
        scheduler.add_job(
            collect_kapt_costs,
            "cron",
            hour=6, minute=20,
            kwargs={
                "batch_size": KAPT_COST_BATCH_SIZE,
                "scheduler_job_id": "kapt_costs",
            },
            id="kapt_costs", name="K-apt 관리비 수집",
            max_instances=1, misfire_grace_time=3600,
        )
        logger.info(
            "K-apt 관리비 연동 활성화: 매칭 매월 21일 06:10 / 관리비 매일 06:20 (배치 %d)",
            KAPT_COST_BATCH_SIZE,
        )

    # G. 에어코리아 대기질 수집 — 매일 새벽 2시
    if AIR_QUALITY_ENABLED:
        from crawler.env_service import collect_air_quality

        scheduler.add_job(
            collect_air_quality,
            "cron",
            hour=2,
            kwargs={"batch_size": AIR_QUALITY_BATCH_SIZE},
            id="collect_air_quality",
            name="에어코리아 대기질 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("에어코리아 대기질 수집 활성화: 매일 02:00 (배치 %d)", AIR_QUALITY_BATCH_SIZE)

    # H. 응급의료기관 수집 — 매월 첫째 월요일 새벽 3시
    if EMERGENCY_ENABLED:
        from crawler.env_service import collect_emergency_data

        scheduler.add_job(
            collect_emergency_data,
            "cron",
            day="1-7",
            day_of_week="mon",
            hour=3,
            kwargs={"batch_size": EMERGENCY_BATCH_SIZE},
            id="collect_emergency",
            name="응급의료기관 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("응급의료기관 수집 활성화: 매월 첫째 월요일 03:00 (배치 %d)", EMERGENCY_BATCH_SIZE)

    # I. 어린이집 수집 — 매월 첫째 목요일 새벽 1시
    #    ⚠ 01:00 고정 사유: CPMS cpmsapi030 키를 mibunyang 과 공유하는데, mibunyang
    #    childcare-detail 이 매일 04:30 에 일일 쿼터(1000건)를 전량 소진한다. 자정 리셋
    #    직후인 01:00 에 먼저 쓰고 지나가야 INFO-300 즉사를 피한다
    #    (06:00 시절 2026-07·08 두 달 연속 실패 — 세션 366). 04:30 이후로 되돌리지 말 것.
    #    ⚠ 배치 = 전량(0, 세션 393). 전량이어도 시군구당 1콜 + 런 내 캐시 재사용이라
    #    호출 상한 ~248콜(2026-09-05 prod 실측) — 일 쿼터 1,000 안에서 mibunyang 04:30
    #    소진 전에 선사용하는 구도는 그대로다.
    if CHILDCARE_ENABLED:
        from crawler.env_childcare import batch_label
        from crawler.env_service import collect_childcare_data

        scheduler.add_job(
            collect_childcare_data,
            "cron",
            day="1-7",
            day_of_week="thu",
            hour=1,
            kwargs={"batch_size": CHILDCARE_BATCH_SIZE},
            id="collect_childcare",
            name="어린이집 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info(
            "어린이집 수집 활성화: 매월 첫째 목요일 01:00 (배치 %s)",
            batch_label(CHILDCARE_BATCH_SIZE),
        )

    # J. 범죄통계 수집 — 분기 1회 (1/4/7/10월 첫째 일요일 새벽 4시)
    #    경찰청 범죄통계 분기별 공표 주기에 맞춤
    if CRIME_STATS_ENABLED:
        from crawler.env_service import collect_crime_stats

        scheduler.add_job(
            collect_crime_stats,
            "cron",
            month="1,4,7,10",
            day="1-7",
            day_of_week="sun",
            hour=4,
            id="collect_crime_stats",
            name="범죄통계 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("범죄통계 수집 활성화: 분기별 첫째 일요일 04:00")

    # L. 크롤링 모니터 — N분마다 장애 감지 + 텔레그램 알림
    if MONITOR_ENABLED:
        from crawler.monitor import run_monitor_job

        scheduler.add_job(
            run_monitor_job,
            "interval",
            minutes=MONITOR_INTERVAL_MIN,
            id="crawler_monitor",
            name="크롤링 모니터",
            max_instances=1,
            misfire_grace_time=600,
        )
        logger.info("크롤링 모니터 활성화: %d분 간격", MONITOR_INTERVAL_MIN)

    # M. 단지 가치지표 수집 — 매일 04:30
    #    complex_price_history 집계만 (네이버 API 호출 0) → IP 차단 무관.
    #    04:30 = 새벽 저트래픽 창(0~9시 매물 변동 거의 없음, services/cache.py 동적 TTL).
    #    09~12시 매물 등록 피크를 완전히 비켜감 — 배치 1000 집계가 사용자 요청과
    #    같은 micro 인스턴스 RAM 을 경합하지 않게 함 (세션 254 micro RAM 스파이크 답습).
    #    08:00 mibunyang 로컬 수집과도 더 멀어짐(기존 08:30=30분 분리 → 04:30=3.5h 분리).
    #    03:30 backfill·04:00 Wed 시세와 시작 instant 겹침 없음, 전부 max_instances=1·집계 전용.
    #    주1회→매일 전환: 집계 대상(시세 이력 보유 단지) 완주를 가속.
    if COMPLEX_METRIC_ENABLED:
        scheduler.add_job(
            collect_complex_metrics,
            "cron",
            hour=4,
            minute=30,
            kwargs={"batch_size": COMPLEX_METRIC_BATCH_SIZE, "scheduler_job_id": "collect_metrics"},
            id="collect_metrics",
            name="단지 가치지표 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("단지 가치지표 수집 활성화: 매일 04:30 (배치 %d)", COMPLEX_METRIC_BATCH_SIZE)

    # M-2. 빌링키 자동결제 — 매일 새벽 4시 50분 (정기결제 PR3, 세션 330).
    #   next_charge_at 도래분(status='active' AND is_default) 카드를 PortOne 빌링키 결제.
    #   PortOne 결제라 네이버 IP 차단 무관 → 04:50 = 04:30 metrics·03:50 vacuum 과 instant
    #   겹침 없는 빈 슬롯. 결제 대상이 소수(active 빌링키)라 가볍다. 3일 연속 실패 시 중단(알림).
    #   BILLING_AUTO_CHARGE_ENABLED=false 로 끄면 자동결제 미동작(카드 등록·첫결제는 무관).
    if BILLING_AUTO_CHARGE_ENABLED:
        scheduler.add_job(
            charge_due_billing_keys,
            "cron",
            hour=4,
            minute=50,
            kwargs={"scheduler_job_id": "billing_charge"},
            id="billing_charge",
            name="빌링키 자동결제",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("빌링키 자동결제 활성화: 매일 04:50")

    # 정기 VACUUM (ANALYZE) articles/trades — visibility map 재악화 차단 (세션 260).
    # 03:50 = 03:30 backfill·04:00 Wed 시세·04:30 metrics 와 instant 겹침 없는 빈 슬롯.
    # DB 전용(네이버 API 0) 이라 IP 차단 무관. VACUUM 은 ACCESS SHARE only = 비차단.
    if VACUUM_MAINTENANCE_ENABLED:
        scheduler.add_job(
            run_vacuum_maintenance,
            "cron",
            hour=3,
            minute=50,
            id="vacuum_maintenance",
            name="정기 VACUUM 유지보수",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("정기 VACUUM 유지보수 활성화: 매일 03:50 (articles/trades)")

    # data.go.kr API 버전 격변 감시 — 주 1회 일요일 06:40.
    # 2026-08-19 사고: data.go.kr 이 구버전 엔드포인트를 공지 체감 없이 폐기해
    # 수집기들이 조용히 죽었다. 엔드포인트 8개를 최소 호출로 찔러 폐기(코드 12)를
    # 조기 감지한다. 06:40 = 03:00 일요일 discover_regions·매월15일 06:30
    # official_price 와 겹치지 않는 빈 슬롯. 네이버 API 0건이라 IP 차단 무관이고,
    # 호출 8건이라 data.go.kr 일일 쿼터(mibunyang 공유) 영향도 무시 가능.
    if API_VERSION_MONITOR_ENABLED:
        from crawler.api_version_monitor import probe_api_versions

        scheduler.add_job(
            probe_api_versions,
            "cron",
            day_of_week="sun",
            hour=6,
            minute=40,
            kwargs={"scheduler_job_id": "api_version_probe"},
            id="api_version_probe",
            name="data.go.kr API 버전 감시",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("data.go.kr API 버전 감시 활성화: 주 1회 일요일 06:40")

    global _scheduler
    _scheduler = scheduler
    return scheduler
