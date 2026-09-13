"""상세 필드 채움률 드리프트 감시 테스트
실행: python -m pytest tests/test_field_drift_monitor.py -v

2026-09-13 사고(네이버 상세 API 키 드리프트로 4필드 6개월 0% 채움)를 감지하는
crawler/field_drift_monitor.py 를 검증한다. 텔레그램은 반드시 mock — conftest 가
TELEGRAM_ENABLED=false 로 전역 봉쇄하지만(세션 325 실사고 답습), 이 테스트는 발송
"호출 여부"를 단언해야 하므로 send_telegram 자체를 patch 한다.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import select

from crawler.field_drift_monitor import (
    _MIN_SAMPLE,
    _PENDING_FIX,
    _THRESHOLDS,
    _WINDOW_HOURS,
    compute_fill_rates,
    run_field_drift_monitor,
)
from db.models import Article, CrawlJob, MonitorAlert
from tests.conftest import TestSession


def _utcnow():
    return datetime.now(timezone.utc)


# 감시 대상 각 필드의 "채워진 값" — Integer 컬럼(room_count 등)엔 정수, 나머지는 문자열.
_INT_FIELDS = {"room_count", "bathroom_count", "walking_time_to_subway"}


def _fill_value(field: str):
    return 2 if field in _INT_FIELDS else "채움값"


def _make_article(article_no: str, *, complex_no="1", recent=True, fill_all=True, **fields) -> Article:
    """감시 모집단에 잡힐 매물 1건 생성 — is_active·detail_crawled·updated_at 창 안.

    fill_all=True(기본) 면 _THRESHOLDS 의 모든 필드를 채운 뒤 fields 로 덮어쓴다 —
    한 필드만 테스트 대상으로 삼을 때 나머지(특히 _PENDING_FIX 4종)가 항상 0%로
    잡혀 의도치 않은 위반·알림이 섞이는 것을 막는다.
    """
    from crawler.field_drift_monitor import _THRESHOLDS

    updated = _utcnow() - timedelta(hours=1) if recent else _utcnow() - timedelta(hours=_WINDOW_HOURS + 10)
    base = {f: _fill_value(f) for f in _THRESHOLDS} if fill_all else {}
    base.update(fields)
    return Article(
        article_no=article_no,
        complex_no=complex_no,
        is_active=True,
        detail_crawled=True,
        first_seen_at=_utcnow(),
        last_seen_at=_utcnow(),
        created_at=_utcnow(),
        updated_at=updated,
        **base,
    )


# 채움 대상 문자열 필드 하나 — 임계 90(정상군)인 realtor_address 로 통일 사용
_NORMAL_FIELD = "realtor_address"


def _seed_population(db, total: int, filled: int, *, field: str = _NORMAL_FIELD):
    """population 건 중 filled 건만 field 를 채우고, 그 외 필드는 전부 채워 삽입.

    field 하나만 관찰 대상으로 삼는 테스트를 위한 헬퍼 — _PENDING_FIX 4종을 포함한
    다른 필드는 항상 정상(채워짐)으로 둬서 field 하나의 결과만 순수하게 관찰한다.
    """
    for i in range(total):
        override = {field: _fill_value(field)} if i < filled else {field: None}
        db.add(_make_article(f"A{i}", **override))
    db.commit()


def test_compute_fill_rates_basic_ratio():
    """정상: population·filled 로 채움률(%)이 정확히 계산된다."""
    db = TestSession()
    try:
        _seed_population(db, total=250, filled=225)  # 90.0%
        population, rates = compute_fill_rates(db)
        assert population == 250
        assert rates[_NORMAL_FIELD] == 90.0
    finally:
        db.close()


def test_compute_fill_rates_below_min_sample_returns_empty():
    """엣지: 표본이 _MIN_SAMPLE 미만이면 rates 가 빈 dict (0으로 나누기 없음)."""
    db = TestSession()
    try:
        assert _MIN_SAMPLE > 10
        _seed_population(db, total=10, filled=10)
        population, rates = compute_fill_rates(db)
        assert population == 10
        assert rates == {}
    finally:
        db.close()


def test_compute_fill_rates_excludes_old_articles():
    """정상: _WINDOW_HOURS 밖(오래된) 매물은 모집단에서 제외된다."""
    db = TestSession()
    try:
        _seed_population(db, total=_MIN_SAMPLE + 50, filled=_MIN_SAMPLE + 50)
        # 오래된 매물 다수를 추가해도 population 이 늘지 않아야 한다.
        for i in range(500):
            db.add(_make_article(f"OLD{i}", recent=False))
        db.commit()
        population, rates = compute_fill_rates(db)
        assert population == _MIN_SAMPLE + 50
    finally:
        db.close()


def test_compute_fill_rates_excludes_backfill_targets():
    """백필 대상(heating_type IS NULL)은 모집단에서 제외된다 — 세션 402 적대검증 HIGH.

    백필 잡은 하루 5,500건을 처리하며 그때마다 updated_at 을 갱신한다. 48시간 창의
    자연 모집단이 8,832건(2026-09-13 prod 실측)이므로, 제외하지 않으면 **모집단의
    55%가 백필 매물**이 된다. 그 집단은 성격이 달라(관리비 채움률 43.1% vs 정상
    63.4%) 채움률 지표가 "이상 발생"이 아니라 "백필이 얼마나 돌았나"를 재게 된다.

    백필 대상의 정의가 heating_type IS NULL 이므로 그 조건으로 걸러낸다.

    뮤테이션: base_filter 에서 `Article.heating_type.isnot(None)` 을 빼면 population 이
    늘어나 이 테스트가 FAIL 한다.
    """
    db = TestSession()
    try:
        _seed_population(db, total=_MIN_SAMPLE + 50, filled=_MIN_SAMPLE + 50)
        # 백필 대상(heating_type 이 비어 있고 창 안에서 갱신된 매물)을 대량 투입
        for i in range(500):
            db.add(_make_article(f"BF{i}", heating_type=None))
        db.commit()
        population, _ = compute_fill_rates(db)
        assert population == _MIN_SAMPLE + 50, (
            f"백필 대상 500건이 모집단에 섞였다(population={population}) — "
            "감시가 '이상'이 아니라 '백필 진행량'을 재게 된다"
        )
    finally:
        db.close()


def test_run_field_drift_monitor_violation_sends_alert_and_records_job():
    """정상: 채움률이 임계 아래로 떨어지면 위반 판정 + CrawlJob.error_message 기록 + 텔레그램 호출."""
    db = TestSession()
    try:
        # realtor_address 임계 90 — 50%만 채워 위반 유도.
        _seed_population(db, total=300, filled=150)  # 50.0%

        with patch("crawler.field_drift_monitor.send_telegram", return_value=True) as mock_tg:
            result = run_field_drift_monitor()

        assert _NORMAL_FIELD in result["violations"]
        assert mock_tg.called

        job = db.execute(
            select(CrawlJob).where(CrawlJob.job_type == "field_drift_monitor")
        ).scalars().first()
        assert job is not None
        assert job.status == "completed"
        assert _NORMAL_FIELD in (job.error_message or "")
        assert "50.0%" in (job.error_message or "")
    finally:
        db.close()


def test_run_field_drift_monitor_above_threshold_no_alert():
    """정상: 채움률이 임계 위면 알림 없음, 잡은 completed."""
    db = TestSession()
    try:
        _seed_population(db, total=300, filled=300)  # 100%

        with patch("crawler.field_drift_monitor.send_telegram", return_value=True) as mock_tg:
            result = run_field_drift_monitor()

        assert result["violations"] == []
        assert not mock_tg.called

        job = db.execute(
            select(CrawlJob).where(CrawlJob.job_type == "field_drift_monitor")
        ).scalars().first()
        assert job.status == "completed"
        assert job.error_message is None
    finally:
        db.close()


def test_run_field_drift_monitor_insufficient_sample_skips_without_alert():
    """엣지: 표본 부족(_MIN_SAMPLE 미만) 이면 판정 skip — 알림 0, ZeroDivisionError 없음."""
    db = TestSession()
    try:
        _seed_population(db, total=5, filled=0)

        with patch("crawler.field_drift_monitor.send_telegram", return_value=True) as mock_tg:
            result = run_field_drift_monitor()

        assert result["rates"] == {}
        assert result["violations"] == []
        assert not mock_tg.called

        job = db.execute(
            select(CrawlJob).where(CrawlJob.job_type == "field_drift_monitor")
        ).scalars().first()
        assert job.status == "completed"
    finally:
        db.close()


def test_run_field_drift_monitor_cooldown_suppresses_second_alert():
    """정상: 같은 필드로 연속 2회 위반 시 쿨다운 안에서는 두 번째 발송이 생략된다."""
    db = TestSession()
    try:
        _seed_population(db, total=300, filled=150)  # 50% — 위반 유도

        with patch("crawler.field_drift_monitor.send_telegram", return_value=True) as mock_tg:
            run_field_drift_monitor()
            assert mock_tg.call_count == 1

            # 두 번째 실행 — 같은 alert(active) 이 존재하고 쿨다운(기본 6h) 안이라 생략.
            run_field_drift_monitor()
            assert mock_tg.call_count == 1  # 추가 발송 없음
    finally:
        db.close()


def test_run_field_drift_monitor_resolves_when_rate_recovers():
    """정상: 위반 후 채움률이 회복되면 resolved 처리 + 해소 알림 발송."""
    db = TestSession()
    try:
        _seed_population(db, total=300, filled=150)  # 50% — 위반

        with patch("crawler.field_drift_monitor.send_telegram", return_value=True):
            run_field_drift_monitor()

        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == f"field_drift:{_NORMAL_FIELD}")
        ).scalar_one()
        assert alert.status == "active"

        # 미채움 매물들을 채워 100% 로 복귀시킨다.
        for a in db.execute(select(Article).where(Article.article_no.like("A%"))).scalars():
            if getattr(a, _NORMAL_FIELD) is None:
                setattr(a, _NORMAL_FIELD, "서울시 강남구")
        db.commit()

        with patch("crawler.field_drift_monitor.send_telegram", return_value=True) as mock_tg:
            result = run_field_drift_monitor()

        assert _NORMAL_FIELD not in result["violations"]
        assert mock_tg.called  # 해소 알림 발송

        db.refresh(alert)
        assert alert.status == "resolved"
    finally:
        db.close()


def test_pending_fix_fields_violation_logged_not_alerted():
    """정상: _PENDING_FIX 집합의 필드는 위반이어도 텔레그램 알림에서 제외(로그만).

    heating_type 등 4개 필드는 지금 실제로 0% 인 장애 진행 중 필드다 — 배포 즉시
    알림 폭탄을 막기 위해 이 집합만은 위반이어도 MonitorAlert 생성·발송을 생략한다.
    """
    db = TestSession()
    try:
        # ⚠ heating_type 은 쓸 수 없다 — 모집단 조건이 `heating_type IS NOT NULL`(백필 매물
        #   제외, 세션 402 적대검증)이라 그 필드를 0%로 만들면 매물이 모집단에서 통째로
        #   빠져 위반 자체가 생기지 않는다. 나머지 3종은 정상적으로 잴 수 있다.
        pending_field = next(f for f in sorted(_PENDING_FIX) if f != "heating_type")
        assert pending_field in _THRESHOLDS

        # pending_field(heating_type 등)만 0%, 나머지 필드는 전부 채워 정상으로 둔다.
        _seed_population(db, total=300, filled=0, field=pending_field)

        with patch("crawler.field_drift_monitor.send_telegram", return_value=True) as mock_tg:
            result = run_field_drift_monitor()

        assert pending_field in result["violations"]
        assert not mock_tg.called  # pending 필드만 위반이라 알림 없음

        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == f"field_drift:{pending_field}")
        ).scalar_one_or_none()
        assert alert is None  # MonitorAlert 도 생성되지 않는다(로그만)
    finally:
        db.close()


def test_field_drift_monitor_job_registered_when_enabled():
    """정상: FIELD_DRIFT_MONITOR_ENABLED=true 면 스케줄러에 field_drift_monitor 잡이 등록된다."""
    from unittest.mock import patch as mock_patch

    from crawler import scheduler as sched_mod

    with mock_patch.object(sched_mod, "FIELD_DRIFT_MONITOR_ENABLED", True):
        scheduler = sched_mod.create_scheduler()
    jobs = {job.id: job for job in scheduler.get_jobs()}
    assert "field_drift_monitor" in jobs
    fields = {f.name: str(f) for f in jobs["field_drift_monitor"].trigger.fields if not f.is_default}
    assert fields.get("hour") == "4" and fields.get("minute") == "40"


def test_field_drift_monitor_job_absent_when_disabled():
    """정상: FIELD_DRIFT_MONITOR_ENABLED=false(기본) 면 잡이 등록되지 않는다."""
    from unittest.mock import patch as mock_patch

    from crawler import scheduler as sched_mod

    with mock_patch.object(sched_mod, "FIELD_DRIFT_MONITOR_ENABLED", False):
        scheduler = sched_mod.create_scheduler()
    jobs = {job.id: job for job in scheduler.get_jobs()}
    assert "field_drift_monitor" not in jobs
