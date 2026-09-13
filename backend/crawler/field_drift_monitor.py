"""매물 상세 필드 채움률 드리프트 감시 — "조용히 데이터가 안 쌓이는" 장애 조기 경보.

배경 (2026-09-13 실사고)
------------------------
네이버가 상세 API 응답의 키 이름을 바꿨다(예: ``heatingTypeName`` → ``aptHeatMethodTypeName``).
HTTP 200 정상 응답이라 에러도 경보도 없었고, ``heating_type``·``use_approve_ymd``·
``jibun_address``·``total_floor_count`` 4개 필드가 **6개월 넘게 0% 채움**으로 방치됐다
(prod 실측: detail_crawled=true 인 활성 매물 284,050건 전 구간 0%). 이런 유형의 장애는
"에러 유무"로는 절대 못 잡는다 — 응답 안의 **키 구성**을 감시해야 한다.

핵심 설계 — 왜 "최근 상세를 받은 매물"만 보는가
------------------------------------------------
전체 테이블(149만 행)을 모집단으로 삼으면 과거 오염분(29만 건, 위 4필드가 이미 0%인
행)이 분모에 섞여 **백필 전에는 영원히 빨간불**이 되고, 그러면 알림이 무의미해진다.
그래서 모집단을 "최근 상세를 받아 지금 막 갱신된 매물"로 좁힌다:

    is_active AND detail_crawled AND updated_at > now() - _WINDOW_HOURS

_WINDOW_HOURS=48 인 근거: 상세 보강 배치는 30분 간격(±jitter 15분) × 500건 이므로
48시간이면 최소 (48*60/45)*500 ≈ 32,000건 이상이 갱신돼 표본이 통계적으로 충분하다
(infra.md §스케줄러 crawl_details 배경 참조).

필드별 임계가 다른 이유
------------------------
prod 실측 채움률이 필드마다 크게 다르다(거의 100%부터 0%까지) — 일괄 임계는 상시
오탐이거나 상시 무의미가 된다. 필드 성격별로 임계를 나눈다(``_THRESHOLDS`` 주석 참조).

``_PENDING_FIX`` — 지금 0%인 4개 필드는 "백필/네이버 키 수정 전이라 현재는 위반이
확정적으로 발생한다"는 걸 알고 있는 상태다. 이 상태에서도 알림 대상에 넣으면 배포
즉시 알림 폭탄이 된다. 그래서 이 집합에 속한 필드는 위반이어도 텔레그램을 보내지
않고 로그만 남긴다 — 백필이 끝나면 사람이 이 집합에서 빼서 정식 감시로 승격한다.

쿨다운·해소 구조는 ``crawler/monitor.py`` 의 ``MonitorAlert`` 패턴(alert_key + status
+ last_notified 쿨다운)을 그대로 답습한다 — 별도 알림 채널을 새로 설계하지 않는다.
"""

import logging
import os
from datetime import timedelta, timezone

from sqlalchemy import and_, case, func, select

from db.models import Article, CrawlJob, MonitorAlert
from services.telegram import send_telegram
from utils import utcnow

logger = logging.getLogger(__name__)

# 모집단 관찰 창 — 상세 보강 배치가 30분±15분 간격으로 도므로, 48시간이면
# 표본이 수만 건 규모로 쌓여 "크롤이 잠깐 느려서 표본이 적다"는 오탐을 피한다.
_WINDOW_HOURS = 48

# 표본 최소치 — 이 아래면 판정하지 않고 skip. 크롤이 멈춘 날 0/0 판정으로
# 오탐(ZeroDivisionError 회피 목적이 아니라 "판정 자체가 무의미"하다는 신호)을 막는다.
_MIN_SAMPLE = 200

# 필드별 임계(%) — "이 값 아래로 떨어지면 이상". prod 실측 채움률(주석 원본, 2026-09-13)
# 에서 넉넉히 낮춰 잡는다: 거의 100% 필드는 임계 90, 매물별 선택 필드는 임계를 더 낮춘다.
#
#   room_count 99.9% / bathroom_count ~100% / realtor_address ~100% /
#   parking_count ~100% / broker_fee ~100% / acquisition_tax ~100% → 임계 90
#   detail_description 99.1% / walking_time_to_subway 97.6% / detail_status_code 97.6%
#   → 임계 90 (동일 성격 — 거의 항상 옴)
#   move_in_date 83.4%(매물별 선택 필드, 공실만 채워짐) → 임계 60
#   maintenance_cost 54.1%(전체) — 오피스텔은 낮고 아파트는 79.6%로 유형별 편차가 크다.
#   유형 분리 집계는 이번 범위 밖(비용 대비 실익 낮음 — 전체 최소치만 감시) → 임계 30
#   (54.1%의 절반 아래로 떨어지면 명백한 이상, 유형 믹스 변화로 인한 자연 변동은 흡수)
#
# ⚠ heating_type·use_approve_ymd·jibun_address·total_floor_count 는 지금 네이버 키
#   드리프트로 0% 다(장애 진행 중). 임계는 정상 수치 기준으로 두되(향후 수정 확인용),
#   _PENDING_FIX 에 넣어 알림에서는 제외한다 — 안 그러면 배포 즉시 알림 폭탄이 된다.
#   백필/수정이 끝나 실제 채움률이 회복되면 사람이 _PENDING_FIX 에서 빼서 정식 감시로 승격.
_THRESHOLDS: dict[str, int] = {
    "room_count": 90,
    "bathroom_count": 90,
    "realtor_address": 90,
    "parking_count": 90,
    "broker_fee": 90,
    "acquisition_tax": 90,
    "detail_description": 90,
    "walking_time_to_subway": 90,
    "detail_status_code": 90,
    "move_in_date": 60,
    "maintenance_cost": 30,
    # 장애 진행 중 — 정상 채움률 기준 임계(90)를 걸어두되 _PENDING_FIX 로 알림 제외.
    "heating_type": 90,
    "use_approve_ymd": 90,
    "jibun_address": 90,
    "total_floor_count": 90,
}

# 위반이어도 텔레그램을 보내지 않고 로그만 남기는 필드 — 백필/수정 완료 후 사람이 제거.
_PENDING_FIX: frozenset[str] = frozenset(
    {"heating_type", "use_approve_ymd", "jibun_address", "total_floor_count"}
)
# ⚠ 이 중 heating_type 은 **구조적으로 이 감시의 대상이 될 수 없다** — 모집단 조건이
#   `heating_type IS NOT NULL`(백필 매물 제외, compute_fill_rates 의 base_filter 참조)이라
#   비어 있는 매물은 애초에 분모에 안 들어간다. 즉 채움률이 늘 100%로 나온다.
#   heating_type 의 진척은 백필 지표(count WHERE heating_type IS NOT NULL)로 따로 본다.
#   나머지 3종(use_approve_ymd·jibun_address·total_floor_count)은 정상적으로 측정되며,
#   백필·파서 수정이 끝나면 _PENDING_FIX 에서 빼 정식 감시로 승격한다.

_ALERT_PREFIX = "field_drift"


def _cooldown_hours() -> int:
    """쿨다운 시간 — monitor.py 와 같은 env 키 재사용(기본 6h)."""
    return int(os.getenv("MONITOR_COOLDOWN_HOURS", "6"))


def compute_fill_rates(db) -> tuple[int, dict[str, float]]:
    """최근 창 안 모집단의 필드별 채움률(%) 계산.

    Returns:
        (population, {필드명: 채움률(%)}) — population 이 _MIN_SAMPLE 미만이면
        빈 dict 를 돌려줘 호출부가 판정을 skip 하게 한다.

    ⚠ 성능: articles 는 149만 행. 필드마다 별도 SELECT 를 날리면 10여 회 전량
    스캔이 되므로, count(*) FILTER 를 **한 SELECT 로 묶어** 1회 스캔으로 끝낸다.
    이 묶음은 `[[feedback-combined-aggregate-index-void]]`("max+count 를 한 SELECT
    에 묶으면 인덱스가 무효화될 수 있다")가 경고하는 패턴과 겉보기엔 비슷하지만,
    그 함정은 **max() 와 count() 를 함께 묶을 때** 발생한다(선두 인덱스가 max 를
    위해 정렬 스캔되면 count 의 필터 최적화가 씹힘). 여기는 count(*) FILTER 만
    N개 묶은 것이고 max() 가 없으므로 해당하지 않는다 — WHERE 절의 updated_at
    범위·is_active·detail_crawled 조건에 대해 하나의 인덱스(ix_articles_updated_at,
    V038)로 필요한 행 범위만 스캔한 뒤, 그 범위 안에서 FILTER 로 카운트를 나누는
    것뿐이라 정렬 요구가 서로 충돌하지 않는다.
    """
    now = utcnow()
    cutoff = now - timedelta(hours=_WINDOW_HOURS)

    base_filter = and_(
        Article.is_active.is_(True),
        Article.detail_crawled.is_(True),
        Article.updated_at > cutoff,
        # ⚠ 백필 매물 제외 (세션 402 적대검증 HIGH 지적, 실측으로 확인):
        #   백필 잡(backfill_article_details)은 하루 5,500건을 처리하며 그때마다
        #   build_detail_update_dict 가 updated_at 을 갱신한다. 48시간 창의 자연 모집단은
        #   8,832건(2026-09-13 실측)인데 백필이 켜지면 11,000건이 더 들어와 **모집단의
        #   55%가 백필 매물**이 된다. 게다가 그 집단은 성격이 다르다 — 백필 대상군의
        #   maintenance_cost 채움률 43.1% vs 정상군 63.4%(실측). 그대로 두면 이 감시는
        #   "이상이 생겼나"가 아니라 "이번 48시간에 백필이 얼마나 돌았나"를 재게 된다.
        #
        #   백필 대상의 정의가 "heating_type IS NULL"(service_discover.backfill_article_details)
        #   이므로, heating_type 이 이미 채워진 매물만 보면 백필분이 자연히 빠진다.
        #   백필이 성공해 채워진 매물은 다음 회차부터 정상 모집단에 합류한다(그때는
        #   정상 크롤과 같은 성격이므로 섞여도 무방).
        #   ⚠ 이 조건 때문에 heating_type 자체는 이 감시로 못 잰다 — 그건 백필 진척
        #   지표(count(*) WHERE heating_type IS NOT NULL)로 따로 본다. _PENDING_FIX 에
        #   이미 들어 있어 지금도 알림 대상이 아니다.
        Article.heating_type.isnot(None),
    )

    field_columns = list(_THRESHOLDS.keys())

    # count(*) 는 population, 필드별 채움 건수는 SUM(CASE WHEN ... THEN 1 ELSE 0 END) —
    # dialect(PostgreSQL/SQLite) 공통으로 동작하는 표준 패턴. 전부 한 SELECT 에 담아
    # 단일 스캔으로 끝낸다(위 docstring 의 인덱스 무효화 비해당 근거 참조).
    select_cols = [func.count(Article.article_no).label("population")]
    for field in field_columns:
        col = getattr(Article, field)
        if field in ("room_count", "bathroom_count", "walking_time_to_subway"):
            cond = col.is_not(None)
        else:
            cond = and_(col.is_not(None), col != "")
        select_cols.append(
            func.sum(case((cond, 1), else_=0)).label(field)
        )

    row = db.execute(select(*select_cols).where(base_filter)).one()

    population = int(row.population or 0)
    if population < _MIN_SAMPLE:
        return population, {}

    rates: dict[str, float] = {}
    for field in field_columns:
        filled = int(getattr(row, field) or 0)
        rates[field] = round(filled / population * 100, 1)
    return population, rates


def _record_job(db, job_type: str, scheduler_job_id: str) -> CrawlJob:
    """CrawlJob 레코드 생성 — env_common._record_job 과 동일 패턴(모듈 독립 유지)."""
    job = CrawlJob(
        job_type=job_type,
        scheduler_job_id=scheduler_job_id,
        status="running",
        started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    return job


def _complete_job(db, job: CrawlJob, error_message: str | None) -> None:
    """CrawlJob 완료 기록 — 위반이 있어도 status 는 completed 유지.

    api_version_monitor.probe_api_versions() 관례 답습: "감시기가 이상을 발견"은
    감시기 자신의 실패가 아니다. error_message 에 위반 필드=비율(%) 목록을 남긴다.
    """
    job.status = "completed"
    job.error_message = error_message
    job.completed_at = utcnow()
    db.commit()


def _alert_key(field: str) -> str:
    return f"{_ALERT_PREFIX}:{field}"


def _send_violation_alert(field: str, rate: float, threshold: int, population: int) -> bool:
    """위반 1건 텔레그램 발송 — best-effort(예외 흡수)."""
    msg = (
        f"[내부모니터] 🔴 <b>상세 필드 채움률 이상</b>\n\n"
        f"▸ <b>{field}</b> 채움률 {rate}% (임계 {threshold}% 미만)\n"
        f"  최근 {_WINDOW_HOURS}시간 표본 {population}건 기준\n"
        f"→ 네이버 상세 API 응답 키 변경 여부 확인 (2026-09-13 heating_type 등 유사 사고)"
    )
    try:
        return send_telegram(msg, parse_mode="HTML")
    except Exception:
        logger.warning("[field_drift] 텔레그램 발송 실패 — field=%s", field, exc_info=True)
        return False


def _send_resolved_alert(field: str, rate: float, threshold: int) -> bool:
    """해소 알림 — best-effort(예외 흡수)."""
    msg = (
        f"[내부모니터] ✅ <b>상세 필드 채움률 정상 복귀</b>\n\n"
        f"▸ <b>{field}</b> 채움률 {rate}% (임계 {threshold}% 이상 회복)"
    )
    try:
        return send_telegram(msg, parse_mode="HTML")
    except Exception:
        logger.warning("[field_drift] 해소 알림 발송 실패 — field=%s", field, exc_info=True)
        return False


def run_field_drift_monitor(scheduler_job_id: str = "field_drift_monitor") -> dict:
    """필드 드리프트 감시 1회 실행 — 판정 → MonitorAlert 대조 → 쿨다운 → 텔레그램.

    Returns:
        {"population": int, "rates": {필드: 비율}, "violations": [필드, ...]}
        표본 부족(skip)이면 rates·violations 는 빈 값.
    """
    from db.database import SessionLocal

    db = SessionLocal()
    job = None
    try:
        job = _record_job(db, "field_drift_monitor", scheduler_job_id)

        population, rates = compute_fill_rates(db)

        if not rates:
            # 표본 부족 — 판정 자체를 skip. 잡은 완료로 기록(감시기 자신은 정상 동작).
            logger.info(
                "[field_drift] 표본 부족(%d < %d) — 판정 skip", population, _MIN_SAMPLE
            )
            _complete_job(db, job, error_message=None)
            return {"population": population, "rates": {}, "violations": []}

        violations = [
            field for field, rate in rates.items() if rate < _THRESHOLDS[field]
        ]

        now = utcnow()
        cooldown = timedelta(hours=_cooldown_hours())
        current_keys = {_alert_key(f) for f in violations}

        # 1. 위반 필드 — 신규 발송 / 쿨다운 억제 / _PENDING_FIX 는 로그만.
        for field in violations:
            rate = rates[field]
            threshold = _THRESHOLDS[field]
            key = _alert_key(field)

            if field in _PENDING_FIX:
                logger.warning(
                    "[field_drift] %s 채움률 %.1f%% (임계 %d%% 미만) — "
                    "백필/수정 대기 중이라 알림 생략(_PENDING_FIX)",
                    field, rate, threshold,
                )
                continue

            alert = db.execute(
                select(MonitorAlert).where(MonitorAlert.alert_key == key)
            ).scalar_one_or_none()
            detail = f"{field} 채움률 {rate}% (임계 {threshold}% 미만, 표본 {population}건)"

            if alert is None:
                sent = _send_violation_alert(field, rate, threshold, population)
                db.add(MonitorAlert(
                    alert_key=key, status="active", detail=detail,
                    last_notified=now if sent else None,
                ))
            elif alert.status == "resolved":
                sent = _send_violation_alert(field, rate, threshold, population)
                alert.status = "active"
                alert.detail = detail
                if sent:
                    alert.last_notified = now
            else:
                last = alert.last_notified
                if last is not None and last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                if last is None or (now - last) >= cooldown:
                    if _send_violation_alert(field, rate, threshold, population):
                        alert.last_notified = now
                alert.detail = detail

        # 2. 해소된 위반 — 이번 스캔에 없는 active 행(이 감시기의 alert_key prefix 만).
        actives = db.execute(
            select(MonitorAlert).where(
                and_(
                    MonitorAlert.status == "active",
                    MonitorAlert.alert_key.like(f"{_ALERT_PREFIX}:%"),
                )
            )
        ).scalars().all()
        for alert in actives:
            if alert.alert_key in current_keys:
                continue
            field = alert.alert_key.split(":", 1)[1]
            rate = rates.get(field)
            if rate is None:
                # 이번 스캔에 아예 안 잡힌 필드(코드에서 제거됐거나 표본 부족) —
                # 성공 확인 없이 임의로 해소 처리하지 않는다. 다음 정상 스캔에서 처리.
                continue
            threshold = _THRESHOLDS.get(field, 0)
            if _send_resolved_alert(field, rate, threshold):
                alert.status = "resolved"

        error_message = None
        if violations:
            parts = [f"{f}={rates[f]}%" for f in violations]
            error_message = "필드 드리프트 위반: " + ", ".join(parts)

        _complete_job(db, job, error_message=error_message)
        db.commit()
        return {"population": population, "rates": rates, "violations": violations}

    except Exception as e:
        logger.error("[field_drift] 실행 실패: %s", e, exc_info=True)
        if job is not None:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            job.completed_at = utcnow()
            db.commit()
            return {"population": 0, "rates": {}, "violations": []}
        raise
    finally:
        db.close()
