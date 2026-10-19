"""크롤링 서비스 — 공공데이터 실거래가 수집

E. 국토교통부 아파트 매매 실거래가 API → complex_price_history 저장
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from crawler.public_trade_match import (  # _strip_n_danji = 옛 시험 import 보존
    OFFICETEL_TYPES,
    _strip_n_danji,  # noqa: F401
)
from crawler.service_common import (
    RESUME_LOOKBACK_LIMIT,
    RESUME_MAX_AGE_HOURS,
    _checkpoint,
    _upsert_area_stats,
    _upsert_price_history,
    fail_job_safely,
)
from db.database import SessionLocal
from db.models import Complex, CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)


def _recent_months(today, n: int) -> list[str]:
    """오늘이 속한 달부터 거꾸로 n개의 달력 달(YYYYMM)을 오래된 순으로 반환.

    세션 421: 옛 코드는 "30일씩 거슬러 올라가며 그 날짜가 속한 달을 취함" 방식이라
    한 달을 28~31일로 계산했다 — 30일 초과인 달(31일)이 겹치면 자연히 중복 제거로
    흡수되지만, 28일인 2월을 건너뛰면 그 앞뒤 두 델타가 모두 같은(2월이 아닌) 달을
    가리켜 2월 자체가 통째로 빠지고 그만큼 오래된 달이 중복으로 끼어든다(예: 오늘이
    2026-03이면 202602 누락 + 202512 중복). 달력의 달 단위로 직접 계산해 이 문제를
    원천 차단한다. n=0 이면 빈 리스트.
    """
    months = []
    for delta in range(n):
        total = today.year * 12 + (today.month - 1) - delta
        y, m0 = divmod(total, 12)
        months.append(f"{y:04d}{m0 + 1:02d}")
    return sorted(months)


# 정리 쿼리 한 번에 넣는 단지 수 — 큰 시군구도 문장마다 8초 statement_timeout 안에 끝나게(세션 469)
_STALE_CHUNK = 500


def _gov_rows_conds(complex_nos: list[str], months: list[str], before: datetime | None) -> list:
    """정부 줄(A1·area_no '') 중 그 단지들·그 달들의 조건 목록 — before 를 주면 그보다 앞서 쓰인 줄만.

    area_no NULL 은 정부 줄로 치지 않는다 — 2u 저장은 늘 ''(_upsert_price_history) 이고 NULL 은
    공유 표의 미분양 몫이라 지우지 않는다(공유 DB 소유권 가드, 세션 469). 공공 경로 표식인 6자리 달
    (YYYYMM)도 글자로 박는다 — 네이버 경로는 8자리(YYYYMMDD)라 달 목록과 무관하게 걸러진다.
    쿼리 객체가 아니라 조건만 돌려준다 — 호출부가 `db.query(ComplexPriceHistory).filter(*조건)` 으로
    시작해야 소유권 가드가 지우는 표를 글자 그대로 읽는다.
    """
    from sqlalchemy import func

    from db.models import ComplexPriceHistory

    conds = [
        ComplexPriceHistory.complex_no.in_(complex_nos),
        ComplexPriceHistory.trade_type == "A1",
        ComplexPriceHistory.area_no == "",
        func.length(ComplexPriceHistory.base_month) == 6,
        ComplexPriceHistory.base_month.in_(months),
    ]
    if before is not None:
        conds.append(ComplexPriceHistory.recorded_at < before)
    return conds


def _count_gov_rows(db, complex_nos: list[str], months: list[str], before: datetime | None = None) -> int:
    if not complex_nos or not months:
        return 0
    from db.models import ComplexPriceHistory

    return sum(
        db.query(ComplexPriceHistory)
        .filter(*_gov_rows_conds(complex_nos[i:i + _STALE_CHUNK], months, before))
        .count()
        for i in range(0, len(complex_nos), _STALE_CHUNK)
    )


def _delete_stale_gov_rows(db, complex_nos: list[str], months: list[str], started_at: datetime) -> int:
    """이번 회차에 다시 쓰이지 않은 옛 정부 실거래가 줄을 지우고 지운 수를 돌려준다 (세션 469).

    정부 줄 = trade_type 'A1' 이고 area_no 가 ''(네이버 줄은 area_no 가 채워져 있고, NULL 은 미분양 몫이라 안 건드린다).
    이번 회차에 다시 저장된 줄은 recorded_at 이 회차 시작 뒤라 남는다 — 그보다 앞선 줄은
    "이번에 그 단지·그 달에 짝이 안 됐다"는 뜻이다. 대상 단지·달 밖은 건드리지 않는다.
    단지를 _STALE_CHUNK 개씩 나눠 여러 문장으로 지운다.
    """
    if not complex_nos or not months:
        return 0
    from db.models import ComplexPriceHistory

    return sum(
        db.query(ComplexPriceHistory)
        .filter(*_gov_rows_conds(complex_nos[i:i + _STALE_CHUNK], months, started_at))
        .delete(synchronize_session=False)
        for i in range(0, len(complex_nos), _STALE_CHUNK)
    )


def _cleanup_sigungu_stale_rows(
    db, sigungu_cd: str, complex_nos: list[str], months: list[str], started_at: datetime,
) -> int:
    """주간 수집의 시군구 하나 정리 — 지울 줄이 그 시군구·그 달들 보유 정부 줄의 절반을 넘으면 건너뛴다.

    이름 규칙이나 정부 응답 모양이 크게 어긋난 날 한 시군구의 차트를 통째로 비우지 않게 하는 차단기다
    (세션 469 검사관 C). 지운 수를 돌려준다(건너뛰면 0).
    """
    stale = _count_gov_rows(db, complex_nos, months, started_at)
    if stale == 0:
        return 0
    existing = _count_gov_rows(db, complex_nos, months)
    if existing > 0 and stale * 2 > existing:
        logger.warning(
            "[정부 실거래가] 시군구 %s 옛 줄 정리 건너뜀 — 지울 줄 %d 이 보유 %d 의 절반을 넘음",
            sigungu_cd, stale, existing,
        )
        return 0
    deleted = _delete_stale_gov_rows(db, complex_nos, months, started_at)
    logger.info("[정부 실거래가] 시군구 %s 옛 줄 %d개 정리 (보유 %d)", sigungu_cd, deleted, existing)
    return deleted


def _area_rows_conds(complex_nos: list[str], months: list[str], before: datetime | None) -> list:
    """면적별 정부 실거래 줄(complex_area_trade_stats, V073) 중 그 단지들·그 달들 — before 를 주면 그보다 앞서 쓰인 줄만.

    옛 달 평균 줄 정리(_gov_rows_conds)와 같은 단지·같은 달·같은 시각 기준을 쓴다(세션 474 B27).
    """
    from db.models import ComplexAreaTradeStat

    conds = [
        ComplexAreaTradeStat.complex_no.in_(complex_nos),
        ComplexAreaTradeStat.base_month.in_(months),
    ]
    if before is not None:
        conds.append(ComplexAreaTradeStat.recorded_at < before)
    return conds


def _count_area_rows(db, complex_nos: list[str], months: list[str], before: datetime | None = None) -> int:
    if not complex_nos or not months:
        return 0
    from db.models import ComplexAreaTradeStat

    return sum(
        db.query(ComplexAreaTradeStat)
        .filter(*_area_rows_conds(complex_nos[i:i + _STALE_CHUNK], months, before))
        .count()
        for i in range(0, len(complex_nos), _STALE_CHUNK)
    )


def _delete_stale_area_rows(db, complex_nos: list[str], months: list[str], started_at: datetime) -> int:
    """이번 회차에 다시 쓰이지 않은 면적별 줄을 지우고 지운 수를 돌려준다 (세션 474 B27).

    recorded_at 이 회차 시작보다 앞선 줄 = 이번에 그 단지·그 달·그 면적 묶음에 거래가 안 붙었다는 뜻이다
    (예: 지난주엔 84㎡ 거래로 붙었던 거래가 이번에 해제돼 빠짐). 대상 단지·달 밖은 건드리지 않는다.
    """
    if not complex_nos or not months:
        return 0
    from db.models import ComplexAreaTradeStat

    return sum(
        db.query(ComplexAreaTradeStat)
        .filter(*_area_rows_conds(complex_nos[i:i + _STALE_CHUNK], months, started_at))
        .delete(synchronize_session=False)
        for i in range(0, len(complex_nos), _STALE_CHUNK)
    )


def _cleanup_sigungu_stale_area_rows(
    db, sigungu_cd: str, complex_nos: list[str], months: list[str], started_at: datetime,
) -> int:
    """주간 수집의 시군구 하나 — 면적별 줄 정리. 옛 달 평균 줄 정리(_cleanup_sigungu_stale_rows)와 같은 차단기:
    지울 줄이 그 시군구·그 달들 보유 면적별 줄의 절반을 넘으면 건너뛴다. 지운 수를 돌려준다(건너뛰면 0).
    """
    stale = _count_area_rows(db, complex_nos, months, started_at)
    if stale == 0:
        return 0
    existing = _count_area_rows(db, complex_nos, months)
    if existing > 0 and stale * 2 > existing:
        logger.warning(
            "[정부 실거래가] 시군구 %s 면적별 옛 줄 정리 건너뜀 — 지울 줄 %d 이 보유 %d 의 절반을 넘음",
            sigungu_cd, stale, existing,
        )
        return 0
    deleted = _delete_stale_area_rows(db, complex_nos, months, started_at)
    logger.info("[정부 실거래가] 시군구 %s 면적별 옛 줄 %d개 정리 (보유 %d)", sigungu_cd, deleted, existing)
    return deleted


# 세션 420: 국토부 창구 호출이 실패(재시도 소진·429·일일 한도)한 것을 "거래 없는 빈 달"로
# 삼키던 결함(2026-09-26 토요일: 05:40 부터 전부 429 인데 completed·759,061건으로 마감).
# 실패는 실패로 세고, 연속으로 이만큼 실패하면 회차를 멈춘다(주간 = 시군구, 소급 = 단지).
PUBLIC_TRADE_ABORT_AFTER_SIGUNGU = 5
BACKFILL_ABORT_AFTER_COMPLEXES = 3

_QUOTA_WORDS = "정부 실거래가 창구가 하루 요청 한도 초과라고 답해"

# 창구 남은 횟수 알림의 여유분 — 1,000건 넘는 달은 여러 쪽으로 나뉘어 예상(시군구×달)보다
# 많이 쓴다. 남은 횟수가 "예상 + 여유"보다 적으면 알린다(사장님 결정 2026-09-27, 주간 문턱 7,072).
_REMAINING_MARGIN = 1_000


class PublicTradeFetchError(RuntimeError):
    """국토부 실거래가 호출 실패 — 빈 수집으로 위장하지 않고 호출자에게 알린다.

    kind: "quota"(하루 요청 한도 초과) | "other". 메시지는 관리자 화면·알림에
    그대로 쓰이므로 쉬운 우리말로 만든다.
    """

    def __init__(self, message: str, kind: str):
        super().__init__(message)
        self.kind = kind


def _fmt_remaining(rl: dict | None) -> str:
    """남은 횟수 표기 — "9,755/10,000" · 한도를 모르면 "9,755" · 값이 없으면 "알 수 없음"."""
    if rl is None:
        return "알 수 없음"
    if rl.get("limit") is None:
        return f"{rl['remaining']:,}"
    return f"{rl['remaining']:,}/{rl['limit']:,}"


def _alert_if_short(job_type: str, rl: dict, expected: int, upper_bound: bool) -> None:
    """창구 남은 횟수가 이번 회차 예상 호출 수 + 여유(_REMAINING_MARGIN)보다 적으면
    경고 로그 + 텔레그램 1건 (세션 421, 여유는 세션 422)."""
    from crawler.plain_words import job_words

    remaining = rl["remaining"]
    threshold = expected + _REMAINING_MARGIN
    if remaining < threshold:
        limit = rl.get("limit")
        limit_part = f"(하루 한도 {limit:,}번)" if limit else ""
        if remaining == 0:
            text = (
                f"[서버 알림] 정부 실거래가 창구의 오늘 남은 횟수가 0번이라 "
                f"이번 회차({job_words(job_type)})는 곧바로 멈춰요{limit_part}. "
                "이 열쇠는 KOSPI·미분양 사이트와 같이 씁니다 — 오늘 그쪽 수집이 먼저 돌았는지 봐 주세요."
            )
        else:
            need = "최대 약" if upper_bound else "약"
            text = (
                f"[서버 알림] 정부 실거래가 창구의 오늘 남은 횟수가 {remaining:,}번뿐이에요{limit_part}. "
                f"이번 회차({job_words(job_type)})는 {need} {expected:,}번이 필요해 도중에 멈출 수 있어요. "
                "이 열쇠는 KOSPI·미분양 사이트와 같이 씁니다 — 오늘 그쪽 수집이 먼저 돌았는지 봐 주세요."
            )
        logger.warning(
            "[정부 실거래가] 창구 남은 횟수 부족: %s, 이번 회차 예상 %s%s번 (여유 %s 포함 문턱 %s번)",
            _fmt_remaining(rl), "최대 " if upper_bound else "", f"{expected:,}",
            f"{_REMAINING_MARGIN:,}", f"{threshold:,}",
        )
        try:
            from services.telegram import send_telegram
            send_telegram(text)
        except Exception as e:  # 알림 실패로 수집을 멈추지 않는다
            logger.warning("[정부 실거래가] 남은 횟수 알림 발송 실패: %s", type(e).__name__)


class _RemainingWatch:
    """이번 회차의 창구 남은 횟수 — 첫 응답 뒤 '시작', 끝날 때 '끝'을 로그 한 줄로 (세션 421).

    PublicDataAPI 가 응답 헤더에서 보관한 값을 읽기만 한다(추가 호출 0). 회차 시작 전에 본 값
    (앞 회차·다른 잡)은 이번 회차 값으로 치지 않는다. 기록은 로그뿐 — crawl_jobs.error_message 는
    관리자 화면 사유 칸이라 넣지 않는다.
    """

    def __init__(self, api, job_type: str, upper_bound: bool):
        self._api = api
        self._job_type = job_type
        self._upper_bound = upper_bound
        self._started_at = datetime.now(timezone.utc)
        self.expected: int | None = None  # 이번 회차 예상 호출 수 — 대상이 정해지면 채운다
        self.start: dict | None = None

    def _fresh(self) -> dict | None:
        rl = self._api.last_rate_limit()
        if rl is None or rl["at"] < self._started_at:
            return None
        return rl

    def observe(self) -> None:
        """창구 호출 뒤마다 부른다 — 이번 회차 첫 응답이면 시작값을 잡고 부족하면 알린다(회차당 1회)."""
        if self.start is not None:
            return
        rl = self._fresh()
        if rl is None:
            return
        self.start = rl
        if self.expected is not None:
            _alert_if_short(self._job_type, rl, self.expected, self._upper_bound)

    def log_end(self) -> None:
        from crawler.plain_words import job_words

        logger.info(
            "[%s] 창구 남은 횟수: 시작 %s → 끝 %s (이 열쇠는 KOSPI·미분양 사이트와 같이 씁니다)",
            job_words(self._job_type), _fmt_remaining(self.start), _fmt_remaining(self._fresh()),
        )


def collect_public_trade_data(batch_size: int = 300, scheduler_job_id: str | None = None):
    """공공데이터포털 아파트 매매 실거래가 수집 → complex_price_history 저장.

    국토교통부 API에서 시군구별 실거래가를 가져와 기존 단지에 매칭 후 저장.
    IP 차단 우려 없이 네이버 시세 데이터를 보완한다.
    """
    api_key = os.getenv("PUBLIC_DATA_API_KEY")
    if not api_key:
        logger.info("정부 실거래가 열쇠가 설정돼 있지 않아 건너뜀 — 공공데이터 수집")
        if scheduler_job_id:
            db = SessionLocal()
            job = CrawlJob(
                job_type="public_trade_data", scheduler_job_id=scheduler_job_id,
                status="cancelled", started_at=utcnow(), completed_at=utcnow(),
                error_message="정부 실거래가 열쇠가 설정돼 있지 않아 건너뜀",
            )
            db.add(job)
            db.commit()
            db.close()
        return

    # lazy import — import chain 실패 방지
    from crawler.public_data_api import PublicDataAPI
    from crawler.public_trade_match import SigunguMatcher

    PublicDataAPI.clear_trade_cache()  # 지난 회차(소급 포함)가 받아 둔 달을 재사용하지 않는다(세션 422)
    db = SessionLocal()

    # 재개(resume) — 직전 실행이 중단(failed/cancelled)됐다면 그 체크포인트를 이어받는다.
    # 시군구 목록은 매 실행 DB 쿼리로 새로 뽑혀 순서 보장이 없으므로(distinct, ORDER BY 없음),
    # "몇 번째까지"가 아니라 "이미 처리한 시군구 코드 집합"으로 저장해 순서 변동에 안전하게 함.
    #
    # ⚠ 가장 최근 job 1건만 보면 안 됨(세션 346 코드리뷰 발견) — 체크포인트는 5개 처리마다
    # 저장되므로, 연속 2회 실패 중 2번째 job이 자기 체크포인트를 저장하기 전에 죽으면
    # (예: 1~4개만 처리하고 죽음) "가장 최근 job"엔 체크포인트가 없어 1번째 job이 남긴
    # 진행분을 못 찾고 처음부터 재시작하게 된다. 최근 N건을 최신순으로 훑어 체크포인트가
    # 실제로 있는 첫 번째를 찾는다 — 오래된 job까지 무한정 훑지 않도록 상한을 둔다.
    #
    # ⚠ 건수 상한(RESUME_LOOKBACK_LIMIT)만으론 부족하다(세션 370 발견) — 실패 잡의
    # 체크포인트는 영구 잔존하므로 어느 토요일 실행이 중간 실패하면 그 체크포인트가
    # **이후 매주** 스캔에 걸려 같은 시군구들을 계속 건너뛴다(신규 실패가
    # 상한(RESUME_LOOKBACK_LIMIT)만큼 쌓여 창 밖으로 밀릴 때까지). 재개는
    # "중단 직후 곧 재실행" 의도이므로 신선도(RESUME_MAX_AGE_HOURS)로도 함께 막는다.
    done_codes: set[str] = set()
    resume_cutoff = utcnow() - timedelta(hours=RESUME_MAX_AGE_HOURS)
    recent_stopped_jobs = (
        db.query(CrawlJob)
        .filter(
            CrawlJob.job_type == "public_trade_data",
            CrawlJob.status.in_(["failed", "cancelled"]),
            CrawlJob.started_at >= resume_cutoff,
        )
        .order_by(CrawlJob.id.desc())
        .limit(RESUME_LOOKBACK_LIMIT)
        .all()
    )
    for prev_job in recent_stopped_jobs:
        prev_state = _checkpoint.load(db, prev_job.id)
        if prev_state and prev_state.get("done_codes"):
            done_codes = set(prev_state["done_codes"])
            logger.info("공공데이터 수집 재개: 이전 job %d 에서 %d개 시군구 완료분 이어받음", prev_job.id, len(done_codes))
            break

    job = CrawlJob(
        job_type="public_trade_data", scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow()
    )
    # 옛 줄 정리 기준 시각(UTC aware) — commit 뒤 ORM 재조회 없이 그대로 쓴다(세션 469)
    run_started_at = job.started_at
    db.add(job)
    db.commit()
    job_id = job.id  # except 에서 깨진 세션의 ORM 속성 접근 피하기 위해 미리 확보
    # upper_bound=False: 주간은 (시군구, 달) 조합이 겹치지 않아 캐시로 줄 몫이 없고, 여러 쪽 달은
    # 더 쓰므로 예상은 상한이 아니라 하한 쪽이다 — "약" 표현, 초과분은 여유 1,000 이 덮는다(세션 422)
    watch = _RemainingWatch(PublicDataAPI, "public_trade_data", upper_bound=False)

    try:
        # 수집 대상 월: 최근 24개월 (차트 분별력 확보, 일일 한도 10,000회 충분)
        # 세션 421: 30일 간격 계산이 2월(28일)을 건너뛰던 결함 수정 — 달력 달 기준.
        from datetime import date
        today = date.today()
        months = _recent_months(today, 24)

        # DB에서 고유 시군구코드 추출 (cortar_no 앞 5자리)
        from sqlalchemy import func
        sigungu_rows = (
            db.query(
                func.left(Complex.cortar_no, 5).label("sigungu_cd"),
            )
            .filter(Complex.cortar_no.isnot(None))
            .filter(func.length(Complex.cortar_no) >= 5)
            .distinct()
            .limit(batch_size)
            .all()
        )
        sigungu_codes = [r.sigungu_cd for r in sigungu_rows if r.sigungu_cd]
        remaining_codes = [c for c in sigungu_codes if c not in done_codes]
        if done_codes:
            logger.info(
                "공공데이터 수집 시작: %d개 시군구 중 %d개 남음 (재개, %d개월)",
                len(sigungu_codes), len(remaining_codes), len(months),
            )
        else:
            logger.info("공공데이터 수집 시작: %d개 시군구 x %d개월", len(sigungu_codes), len(months))
        # 이번 회차가 요청할 (시군구, 월) 조합 수 — 체크포인트로 끝난 시군구는 뺀 실제 반복 대상
        watch.expected = len(remaining_codes) * len(months)

        processed = 0
        matched = 0
        stale_deleted = 0       # 이번에 짝이 안 된 옛 정부 줄을 지운 수(세션 469)
        area_stale_deleted = 0  # 이번에 안 쓰인 면적별 줄을 지운 수(세션 474 F7)
        area_unreadable = 0     # 짝은 됐는데 전용면적을 못 읽어 면적별 표에서 뺀 거래 수(세션 474 F7)
        ok_sigungu = 0         # 이번 회차에 끝까지 받은 시군구 수
        failed_sigungu = 0      # 이번 회차에 호출 실패로 못 받은 시군구 수
        consecutive_failed = 0  # 연속 실패 — 하나라도 성공하면 0
        any_quota = False
        aborted_kind: str | None = None

        for i, sigungu_cd in enumerate(remaining_codes):
            # 세션 469: 해당 시군구 단지 목록으로 짝짓기 색인 — 소급과 같은 규칙(법정동으로 가르기·
            # 오피스텔 제외·해제 거래 제외·끝 '단지' 떼기·N단지 흡수)이 crawler/public_trade_match.py 에 있다.
            matcher = SigunguMatcher.from_db(db, sigungu_cd)
            if not matcher.complex_nos:
                continue
            sigungu_written = 0  # 이 시군구에서 이번에 저장한 줄 수 — 0 이면 옛 줄 정리를 하지 않는다
            traded_months: list[str] = []  # 정상 응답으로 거래가 1건 이상 온 달 — 이 달들만 정리한다

            # lawd_cd 는 cortar_no 앞 5자리를 번역 없이 그대로 넘긴다. 광주·전남 12 체계도
            # 실거래가 창구가 직접 받는다(2026-10-01 27 시군구 전수 실측: 새 코드 25/27 건수 있음 ·
            # 옛 29/46 코드 0/27). 옛 코드로 번역하던 동안(8/10~9/30) 2,838단지가 0건이었다(세션 424).
            # 공시가격(V-WORLD)은 여전히 옛 코드라 to_vworld_cortar 로 번역한다 — 이 경로와 다르다.
            fetch_failed = False
            for deal_ymd in months:
                trades = PublicDataAPI.get_all_apt_trades(sigungu_cd, deal_ymd)
                watch.observe()
                if trades is None:
                    # 호출 실패 ≠ 거래 없는 달. 남은 달은 시도하지 않고 이 시군구를 실패로 센다.
                    fetch_failed = True
                    break
                if not trades:
                    continue  # 정상 응답인데 거래가 없는 달 — 옛 줄도 그대로 둔다
                traded_months.append(deal_ymd)

                # 단지별로 모은 가격 → 월별 min/max/avg 1줄(여러 국토부 이름이 한 단지로 모이면 합친다)
                for complex_no, prices in matcher.aggregate(trades).items():
                    _upsert_price_history(
                        db,
                        complex_no=complex_no,
                        trade_type="A1",
                        area_no=None,
                        price_upper=max(prices),
                        price_lower=min(prices),
                        price_avg=round(sum(prices) / len(prices)),
                        base_month=deal_ymd,
                    )
                    matched += 1
                    sigungu_written += 1
                # 세션 474 B27: 같은 거래를 전용면적 묶음(정수 ㎡)별로 한 번 더 묶어 면적별 표에 저장(옛 줄은 그대로)
                for complex_no, by_area in matcher.aggregate_by_area(trades).items():
                    for area_m2, area_prices in by_area.items():
                        _upsert_area_stats(db, complex_no, deal_ymd, area_m2, area_prices)

                processed += len(trades)

            area_unreadable += matcher.area_unreadable  # 이 시군구 matcher 누적(세션 474 F7)
            if fetch_failed:
                # done_codes 에 넣지 않는다 — 다음 회차(재개 포함)가 이 시군구를 다시 받는다.
                kind = PublicDataAPI.last_failure_kind() or "other"
                any_quota = any_quota or kind == "quota"
                failed_sigungu += 1
                consecutive_failed += 1
                logger.warning(
                    "공공데이터 수집: 시군구 %s 호출 실패(%s) — 연속 %d개",
                    sigungu_cd, kind, consecutive_failed,
                )
                if consecutive_failed >= PUBLIC_TRADE_ABORT_AFTER_SIGUNGU:
                    aborted_kind = kind
                    break
                continue

            # 세션 469: 24달을 모두 받았으니 이번에 다시 안 쓰인 옛 정부 줄을 지운다 — 거래가 온 달만,
            # 짝이 될 수 있는 단지(+오피스텔)만, 지울 줄이 보유의 절반을 넘으면 건너뜀. 이 시군구에서
            # 한 줄도 못 붙였으면 이름 규칙이 통째로 어긋난 날일 수 있어 차트를 비우지 않는다.
            if sigungu_written > 0:
                stale_deleted += _cleanup_sigungu_stale_rows(
                    db, sigungu_cd, matcher.cleanup_complex_nos, traded_months, run_started_at,
                )
                # 면적별 줄도 같은 단지·같은 달·같은 시각 기준으로(세션 474 B27)
                area_stale_deleted += _cleanup_sigungu_stale_area_rows(
                    db, sigungu_cd, matcher.cleanup_complex_nos, traded_months, run_started_at,
                )
            else:
                # 거래가 왔고 짝이 될 단지도 있는데 0줄이면 이상 신호(WARNING), 그 밖(거래 0·후보 0)은 평범(INFO)
                level = logging.WARNING if traded_months and matcher.has_apt_candidates else logging.INFO
                logger.log(level, "[정부 실거래가] 시군구 %s 는 이번에 붙인 줄이 없어 옛 줄을 정리하지 않음", sigungu_cd)
            consecutive_failed = 0
            ok_sigungu += 1
            done_codes.add(sigungu_cd)

            # 체크포인트 — 완료된 시군구 코드 집합을 저장 (재개 시 이 집합을 건너뜀).
            # sorted()는 다음 실행이 순서를 신뢰해서가 아니라(재개 시 다시 set으로 씀),
            # DB에 저장된 JSON을 사람이 볼 때 순서가 일정해 디버깅하기 편하기 위함.
            if _checkpoint.should_save(i + 1):
                db.commit()
                _checkpoint.save(db, job.id, {"done_codes": sorted(done_codes), "total": len(sigungu_codes)})
                logger.info("공공데이터 수집 중간 저장: %d/%d 시군구 완료", len(done_codes), len(sigungu_codes))

        # 성공·실패 마감 모두에 남도록 마감 분기 앞에서 한 줄(알림·사유 칸 아님 — 세션 469)
        logger.info(
            "[정부 실거래가] 이번에 짝이 안 된 옛 줄 %d개 정리 · 면적별 옛 줄 %d개 정리 · 면적 못 읽음 %d건",
            stale_deleted, area_stale_deleted, area_unreadable,
        )

        job.total_items = processed
        job.processed_items = matched
        job.completed_at = utcnow()

        if aborted_kind is not None or failed_sigungu > ok_sigungu:
            # 연속 실패로 중단했거나, 끝까지 갔어도 실패가 성공보다 많으면 failed
            # (kapt_costs mostly_failed 선례). 받은 곳까지 체크포인트를 남겨 재개가 이어받게 한다.
            # 정기 회차는 재개 창(RESUME_MAX_AGE_HOURS) 밖이라 처음부터 다시 받는다 — "이어받아요"
            # 가 아니라 "다시 받아요"가 사실이다(세션 420 검사관 L3).
            if aborted_kind is not None:
                # 중단 직전 실패만이 아니라 이번 회차에 한도 초과가 한 번이라도 있었으면
                # 한도 문구 — 한도 뒤에 다른 실패가 섞여 끝나도 원인을 가리지 않는다(L2).
                head = (
                    _QUOTA_WORDS if any_quota
                    else f"정부 실거래가 창구 호출이 시군구 {PUBLIC_TRADE_ABORT_AFTER_SIGUNGU}곳 연속 실패해"
                )
                message = (
                    f"{head} {len(done_codes)}/{len(sigungu_codes)}개 시군구까지만 받고 중단"
                    " — 다음 회차가 다시 받아요"
                )
            else:
                head = _QUOTA_WORDS if any_quota else "정부 실거래가 창구 호출이 실패해"
                message = (
                    f"{head} {failed_sigungu}개 시군구를 못 받음(받은 곳 {ok_sigungu}개)"
                    " — 다음 회차가 다시 받아요"
                )
            db.commit()
            _checkpoint.save(db, job.id, {"done_codes": sorted(done_codes), "total": len(sigungu_codes)})
            job.status = "failed"
            job.error_message = message
            db.commit()
            logger.warning("공공데이터 수집 실패 마감: %s (%d건 처리, %d건 매칭)", message, processed, matched)
            return

        job.status = "completed"
        if failed_sigungu:
            job.error_message = f"{failed_sigungu}개 시군구는 못 받음(다음 회차 재시도)"
        db.commit()
        _checkpoint.delete(db, job.id)
        logger.info(
            "공공데이터 수집 완료: %d건 처리, %d건 매칭, 못 받은 시군구 %d개",
            processed, matched, failed_sigungu,
        )

    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            fail_job_safely(job_id, str(e))  # 연결 끊김 대비 새 세션 보장 (세션 266)
        logger.exception("공공데이터 수집 실패")
    finally:
        # 첫 줄 — 아래 close/log_end 가 던져도 받은 거래 수십만 건은 반납된다(세션 422)
        PublicDataAPI.clear_trade_cache()
        db.close()
        watch.log_end()  # DB 를 닫은 뒤 — 로그가 실패해도 연결은 이미 반납됐다(세션 422)


def backfill_price_history(complex_no: str, months_back: int = 60) -> dict:
    """특정 단지의 과거 실거래가를 국토교통부 API로 소급 수집.

    네이버 시세 API가 최근 데이터만 반환하는 단지에 대해
    장기 이력을 보강하여 차트 기간 선택(6M/1Y/2Y/전체)이 의미있게 동작.

    Args:
        complex_no: 단지 번호
        months_back: 소급 기간 (기본 60개월 = 5년)

    Returns:
        {"collected": N, "months_covered": N, "complex_name": "..."}
    """
    from datetime import date

    from crawler.public_data_api import PublicDataAPI, _normalize_apt_name
    from crawler.public_trade_match import SigunguMatcher

    started_at = utcnow()  # 이 시각보다 앞선 정부 줄 = 이번에 다시 안 쓰인 옛 줄(정리 대상)
    db = SessionLocal()
    try:
        cpx = db.get(Complex, complex_no)
        if not cpx:
            raise ValueError(f"단지 {complex_no}을 찾을 수 없습니다")
        if not cpx.cortar_no or len(cpx.cortar_no) < 5:
            raise ValueError(f"단지 {complex_no}의 법정동코드(cortar_no)가 없습니다")

        # 앞 5자리를 번역 없이 그대로 — 광주·전남 12 체계도 실거래가 창구가 직접 받는다
        # (세션 424, 주간 수집 collect_public_trade_data 의 같은 자리 주석 참조).
        sigungu_cd = cpx.cortar_no[:5]
        norm_name = _normalize_apt_name(cpx.complex_name)
        if not norm_name:
            raise ValueError(f"단지명 정규화 실패: {cpx.complex_name}")

        # 세션 469: 주간 수집과 같은 짝짓기 하나를 쓴다 — 법정동으로 가르고(같은 시군구의
        # 같은 이름 단지끼리 섞이지 않게) 끝 '단지' 떼기·N단지 흡수(형제 없을 때만, 세션 359)·
        # 오피스텔 제외·해제 거래 제외 규칙이 전부 crawler/public_trade_match.py 에 있다.
        matcher = SigunguMatcher.from_db(db, sigungu_cd)

        # 소급 대상 월 생성 (세션 421: 달력 달 기준 — 30일 간격 계산의 2월 건너뛰기 결함 수정)
        today = date.today()
        months = _recent_months(today, months_back)

        collected = 0
        fetch_failure: str | None = None
        traded_months: list[str] = []  # 정상 응답으로 거래가 1건 이상 온 달 — 이 달들만 정리한다
        for deal_ymd in months:
            trades = PublicDataAPI.get_all_apt_trades(sigungu_cd, deal_ymd)
            if trades is None:
                # 호출 실패 — 빈 수집으로 위장하지 않고 이 단지를 실패로 끝낸다(세션 420).
                fetch_failure = PublicDataAPI.last_failure_kind() or "other"
                break
            if not trades:
                continue  # 거래 없는 달 — 옛 줄도 그대로 둔다
            traded_months.append(deal_ymd)

            # 이 단지와 짝이 된 거래만
            prices = matcher.aggregate(trades).get(complex_no, [])

            if prices:
                _upsert_price_history(
                    db,
                    complex_no=complex_no,
                    trade_type="A1",
                    area_no=None,
                    price_upper=max(prices),
                    price_lower=min(prices),
                    price_avg=round(sum(prices) / len(prices)),
                    base_month=deal_ymd,
                )
                collected += 1
            # 세션 474 B27: 이 단지 거래를 전용면적 묶음(정수 ㎡)별로 면적별 표에 저장(옛 줄은 그대로)
            for area_m2, area_prices in matcher.aggregate_by_area(trades).get(complex_no, {}).items():
                _upsert_area_stats(db, complex_no, deal_ymd, area_m2, area_prices)

        # 세션 469: 달을 모두 받았으면 이번에 다시 안 쓰인 옛 정부 줄(이 단지·거래가 온 달)을 지운다.
        # 저장 0 이어도 지운다 — 이 단지가 이제 어느 거래에도 짝이 안 되는 게 사실이면 옛 값이
        # 남는 쪽이 더 틀리다. 호출이 하나라도 실패했으면 못 받은 달이 있으니 지우지 않는다.
        # 법정동을 모르거나 유형이 비어 짝이 될 수 없는 단지는 건너뛴다(주간과 같은 범위).
        deleted = 0
        if fetch_failure is None and complex_no in matcher.cleanup_complex_nos:
            deleted = _delete_stale_gov_rows(db, [complex_no], traded_months, started_at)
            # 면적별 줄도 같은 조건·같은 시각 기준으로(세션 474 B27)
            _delete_stale_area_rows(db, [complex_no], traded_months, started_at)

        # V046: 매칭 결과(collected==0 포함)와 무관하게 "시도했다"는 사실만 기록.
        # 국토부에 원천적으로 실거래가 없는 단지를 무한 재시도하지 않기 위한 마커
        # (세션 360 — remaining 이 안 줄어드는데 success 로만 카운트되던 문제 근본수정).
        # ⚠ 하루 요청 한도 초과로 실패했으면 찍지 않는다 — 찍으면 90일 동안 재시도
        #   대상에서 빠져 "한도 때문에 못 받은 단지"가 빈 단지처럼 묻힌다(세션 420).
        #   그 밖의 실패는 기존대로 찍는다 — 영구 오류 단지가 매일 큐 맨 앞을 막아
        #   연속 실패 중단 규칙으로 배치 전체가 멈추는 것을 막기 위함.
        if fetch_failure != "quota":
            cpx.public_data_attempted_at = utcnow()
        db.commit()
        if fetch_failure is not None:
            head = (
                _QUOTA_WORDS if fetch_failure == "quota"
                else "정부 실거래가 창구 호출이 실패해"
            )
            logger.warning(
                "소급 수집 실패: complex=%s (%s), %d/%d 월 매칭 후 중단(%s)",
                complex_no, cpx.complex_name, collected, len(months), fetch_failure,
            )
            raise PublicTradeFetchError(f"{head} 이 단지의 지난 실거래가를 다 받지 못했어요", fetch_failure)
        logger.info(
            "소급 수집 완료: complex=%s (%s), %d/%d 월 매칭, 옛 줄 정리 %d줄",
            complex_no, cpx.complex_name, collected, len(months), deleted,
        )
        return {
            "collected": collected,
            "months_covered": len(months),
            "complex_name": cpx.complex_name,
        }
    finally:
        db.close()


# V046: 최근 이 기간 내 국토부 백필을 이미 시도한 단지는 재시도 대상에서 뺀다.
# 국토부에 원천적으로 실거래가 없는 단지(세션 360 실측 92%)를 무한 재시도하며
# API 쿼터·시간을 낭비하지 않기 위함 — "성공"이 아니라 "시도했다"는 사실만
# 기준이므로, 지역에 새 거래가 실제로 생겼을 가능성을 감안해 완전 영구제외가
# 아니라 기간을 두고 재시도 여지를 남긴다.
PUBLIC_DATA_RETRY_COOLDOWN_DAYS = 90


def backfill_price_batch(
    batch_size: int = 20, scheduler_job_id: str | None = None, clear_cache: bool = True,
):
    """가격 이력이 부족한 상위 단지 일괄 소급 수집.

    선정 기준: 세대수 상위 + price_history 6개월 미만 + 최근 90일 내 미시도 단지.

    clear_cache: 기본 True — 시작·끝에서 실거래가 캐시를 비운다(스케줄러 경로). 배치를 반복
    호출하는 일회성 스크립트만 False 로 넘겨 배치 사이에 캐시를 나눠 쓰고, 스크립트가 끝날 때
    한 번 비운다(세션 422).
    """
    from datetime import timedelta

    from sqlalchemy import func, or_, select

    from crawler.public_data_api import PublicDataAPI
    from db.models import ComplexPriceHistory

    months_back = 24  # 단지당 소급 달 수 — 예상 호출 수(남은 횟수 경보)에도 같은 값을 쓴다
    if clear_cache:
        # 캐시는 이 배치 안에서만 단지끼리 나눠 쓴다 — 어제 배치·지난 주간 회차 것은 버린다(세션 422)
        PublicDataAPI.clear_trade_cache()
    db = SessionLocal()
    # 어드민 scheduler-status 는 CrawlJob(scheduler_job_id) 최신 행으로 last_run 을
    # 보여준다 — 본 함수만 기록이 없어 화면에 항상 last_run: null 로 떠 실행 여부를
    # 알 수 없었다 (세션 288 라이브 점검). 같은 파일 collect_public_trade_data 패턴 답습.
    job = CrawlJob(
        job_type="price_backfill", scheduler_job_id=scheduler_job_id,
        status="running", started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    job_id = job.id  # except 에서 깨진 세션의 ORM 속성 접근 피하기 위해 미리 확보
    watch = _RemainingWatch(PublicDataAPI, "price_backfill", upper_bound=True)

    try:
        rich_nos = (
            select(ComplexPriceHistory.complex_no)
            .group_by(ComplexPriceHistory.complex_no)
            .having(func.count() >= 6)
        )
        retry_cutoff = utcnow() - timedelta(days=PUBLIC_DATA_RETRY_COOLDOWN_DAYS)

        complexes = (
            db.query(Complex.complex_no)
            .filter(
                Complex.total_household_count.isnot(None),
                Complex.cortar_no.isnot(None),
                # 세션 469: 아파트 매매 창구라 오피스텔은 영영 0건 — 헛호출만 남아 뺀다.
                # NULL 유형은 기존대로 대상(SQL 의 NOT IN 은 NULL 을 빼므로 따로 살린다).
                or_(
                    Complex.real_estate_type_code.is_(None),
                    Complex.real_estate_type_code.notin_(OFFICETEL_TYPES),
                ),
                ~Complex.complex_no.in_(rich_nos),
                or_(
                    Complex.public_data_attempted_at.is_(None),
                    Complex.public_data_attempted_at < retry_cutoff,
                ),
            )
            .order_by(Complex.total_household_count.desc())
            .limit(batch_size)
            .all()
        )

        total = len(complexes)
        # 상한 — 같은 (시군구, 월) 은 캐시로 한 번만 부르므로 실제는 이보다 적을 수 있다
        watch.expected = total * months_back
        success = 0
        failed = 0
        quota_exhausted = False
        consecutive_fetch_failed = 0  # 호출 실패 연속 단지 수 — 하나라도 성공하면 0
        fetch_failed = 0              # 창구 호출 실패 단지 수(개별 예외 제외) — 마감 판정용
        aborted_kind: str | None = None
        for (cno,) in complexes:
            # 세션 361: 쿼터를 이미 다 쓴 뒤에도 남은 단지 수만큼 backfill_price_history()를
            # 계속 호출하면, 그 안에서 매 단지 x 24개월씩 "쿼터 초과" 경고만 반복하며
            # 헛돌았다(어제 4500회+ 반복, 로그 5MB). 실제 API 요청은 안 나가 IP차단·데이터
            # 오염 위험은 없지만, 쿼터 초과가 확인되면 남은 단지는 시도 자체를 접고
            # 배치를 조기 종료한다 — 어차피 오늘은 더 이상 진행이 안 되므로.
            from crawler.quota_db import get_api_quota_status
            quota = get_api_quota_status(SessionLocal)
            if quota["remaining"] == 0:
                quota_exhausted = True
                logger.info(
                    "국토부 API 쿼터 소진 — 배치 조기 종료 (성공 %d / 처리시도 %d / 전체 %d)",
                    success, success + failed, total,
                )
                break
            try:
                backfill_price_history(cno, months_back=months_back)
                success += 1
                consecutive_fetch_failed = 0
            except PublicTradeFetchError as e:
                # 한 단지 실패로 배치를 끝내지 않는다 — 실패로 세고, 연속으로 쌓이면 멈춘다.
                db.rollback()
                failed += 1
                fetch_failed += 1
                consecutive_fetch_failed += 1
                logger.warning("소급 수집 호출 실패: %s (%s) — 연속 %d단지", cno, e.kind, consecutive_fetch_failed)
                # 한도 초과는 연속 여부와 무관하게 즉시 멈춘다 — 앞 단지의 달이 캐시에 있으면
                # 그 단지는 "성공"으로 세어져 연속 카운터가 0 이 되므로, 연속 규칙만으로는
                # 429 폭주 속에서도 배치가 끝까지 헛돈다(세션 420 검사관 M3).
                # 연속 규칙은 한도가 아닌 실패에만 쓴다.
                if e.kind == "quota" or consecutive_fetch_failed >= BACKFILL_ABORT_AFTER_COMPLEXES:
                    aborted_kind = e.kind
                    break
            except Exception:
                # ⚠ 세션 346 코드리뷰 정정: backfill_price_history()는 이 db와 별개인
                # 자신만의 SessionLocal()을 열어 쓴다(NullPool=독립 물리 연결)라서,
                # 여기서 실패해도 바깥 db 트랜잭션이 실제로 오염되지는 않는다 —
                # crawl_complex_details_batch(같은 db를 파라미터로 공유하는 구조)와는
                # 다르다. 지금 당장 InFailedSqlTransaction 연쇄를 막는 효과는 없지만,
                # 향후 리팩터로 db를 공유하게 되면 필요해질 방어 코드라 남겨둔다.
                db.rollback()
                failed += 1
                logger.exception("소급 수집 개별 실패: %s", cno)
            finally:
                # 첫 단지의 응답 뒤 시작값을 잡는다(그 단지 호출분만큼 이미 줄어 있을 수 있다)
                watch.observe()

        job.status = "completed"
        if aborted_kind is not None:
            head = (
                _QUOTA_WORDS if aborted_kind == "quota"
                else f"정부 실거래가 창구 호출이 단지 {BACKFILL_ABORT_AFTER_COMPLEXES}곳 연속 실패해"
            )
            job.status = "failed"
            job.error_message = f"{head} {total}개 단지 중 {success}개까지만 받고 중단 — 남은 단지는 내일 이어서 받아요"
        elif fetch_failed > success:
            # 끝까지 갔어도 창구 호출 실패가 성공보다 많으면 failed — 주간 수집기·kapt
            # mostly_failed 와 같은 규칙. 창구 호출 실패(PublicTradeFetchError)만 센다 — 그 밖의
            # 개별 예외는 기존대로 completed 안에서 실패 수로만 남긴다(문구가 "창구"라 원인이 다르면 거짓).
            job.status = "failed"
            job.error_message = (
                f"정부 실거래가 창구 호출이 실패해 {fetch_failed}개 단지를 못 받음(받은 곳 {success}개)"
                # 이 분기의 실패는 전부 한도가 아닌 실패라 시도 마커가 찍힌다(:482) —
                # 그래서 "내일"이 아니라 재시도 창이 지난 뒤다(검사관 재검사 N1).
                f" — 못 받은 단지는 {PUBLIC_DATA_RETRY_COOLDOWN_DAYS}일 뒤에 다시 시도해요"
            )
        elif quota_exhausted:
            # 우리 하루 예산(사전 확인)에 걸려 멈춘 회차 — 계획된 멈춤이라 completed 그대로 두고
            # 사유만 남긴다(세션 420). 옛 코드는 문구 없이 completed 라 "다 받았다"로 읽혔다.
            # 남은 단지는 backfill_price_history 를 부르기 전에 멈춰 시도 마커(:483)가 안 찍히므로
            # 내일 같은 순서로 다시 뽑힌다. 머리는 "정부 실거래가 창구" — plain_words 원문 보존 규칙이
            # 숫자를 지키게(한도 규칙이 먼저 잡으면 숫자가 사라진다).
            job.error_message = (
                f"정부 실거래가 창구에 오늘 쓸 요청 몫을 다 써 {total}개 단지 중 {success}개까지 받고 멈춤"
                " — 남은 단지는 내일 이어서 받아요"
            )
        job.total_items = total
        job.processed_items = success
        job.completed_at = utcnow()
        db.commit()
        logger.info(
            "소급 배치 %s: 성공 %d / 실패 %d / 전체 %d%s",
            "중단" if aborted_kind is not None else "완료",
            success, failed, total, " (쿼터 소진으로 조기 종료)" if quota_exhausted else "",
        )
        return {"success": success, "failed": failed, "total": total, "quota_exhausted": quota_exhausted}
    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            job.completed_at = utcnow()
            db.commit()
        except Exception:
            # 연결이 끊긴 세션이면 위 commit 도 던진다 — 새 세션으로 확실히 마킹
            fail_job_safely(job_id, str(e)[:500])
        logger.exception("소급 배치 실패")
        return {"success": 0, "failed": 0, "total": 0, "error": str(e)[:200]}
    finally:
        if clear_cache:
            # 첫 줄 — 아래 close/log_end 가 던져도 메모리는 반납된다(세션 422)
            PublicDataAPI.clear_trade_cache()
        db.close()
        watch.log_end()  # DB 를 닫은 뒤 — 로그가 실패해도 연결은 이미 반납됐다(세션 422)
