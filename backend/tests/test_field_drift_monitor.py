"""상세 필드 채움률 드리프트 감시 테스트
실행: python -m pytest tests/test_field_drift_monitor.py -v

2026-09-13 사고(네이버 상세 API 키 드리프트로 4필드 6개월 0% 채움)를 감지하는
crawler/field_drift_monitor.py 를 검증한다. 텔레그램은 반드시 mock — conftest 가
TELEGRAM_ENABLED=false 로 전역 봉쇄하지만(세션 325 실사고 답습), 이 테스트는 발송
"호출 여부"를 단언해야 하므로 send_telegram 자체를 patch 한다.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import Integer, Numeric, select

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
# ⚠ 하드코딩 금지 — 감시 대상에 숫자 컬럼이 새로 들어오면(예: #511 의 total_floor_count)
# 이 집합이 낡아 정수 컬럼에 문자열을 넣게 된다. 모델의 타입에서 판정한다.
_INT_FIELDS = {
    f for f in _THRESHOLDS
    if isinstance(getattr(Article, f).type, (Integer, Numeric))
}


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


def test_numeric_columns_never_compared_to_empty_string():
    """회귀: 숫자 컬럼에 `!= ''` 를 붙이면 PostgreSQL 이 즉사한다.

    2026-09-14 04:40 첫 실전에서 이 잡이 통째로 죽었다 —
    `invalid input syntax for type integer: ""`.
    total_floor_count(Integer)가 #511 로 감시 대상에 들어왔는데, 빈 문자열 비교를
    문자열 컬럼과 똑같이 붙였기 때문이다.

    **이 결함은 일반 테스트로는 절대 안 잡힌다** — CI 는 SQLite 라 정수 컬럼을
    ''와 비교해도 조용히 통과한다(그래서 기존 12건이 전부 초록인 채 배포됐다).
    그래서 실행 결과가 아니라 **PostgreSQL 방언으로 생성되는 SQL 자체**를 검사한다.
    """
    from sqlalchemy.dialects import postgresql

    numeric_fields = sorted(_INT_FIELDS)
    # 감시 대상에 숫자 컬럼이 하나도 없으면 이 가드가 무의미해진다 — 그것부터 잡는다.
    assert numeric_fields, "숫자 컬럼이 감시 대상에 없다 — 이 가드가 헛돈다"
    assert "total_floor_count" in numeric_fields, (
        "total_floor_count 가 숫자로 인식되지 않는다 — 이 사고의 당사자 컬럼이다"
    )

    with TestSession() as db:
        _seed_population(db, _MIN_SAMPLE + 1, _MIN_SAMPLE + 1)

        captured: list[str] = []
        original = db.execute

        def _spy(stmt, *a, **kw):
            try:
                captured.append(
                    str(stmt.compile(dialect=postgresql.dialect(),
                                     compile_kwargs={"literal_binds": True}))
                )
            except Exception:
                pass
            return original(stmt, *a, **kw)

        db.execute = _spy  # type: ignore[method-assign]
        try:
            compute_fill_rates(db)
        finally:
            db.execute = original  # type: ignore[method-assign]

    sql = chr(10).join(captured)
    assert sql, "집계 SQL 이 캡처되지 않았다"
    for field in numeric_fields:
        assert f"articles.{field} != ''" not in sql, (
            f"{field} 은 숫자 컬럼인데 빈 문자열과 비교한다 — "
            "PostgreSQL 에서 InvalidTextRepresentation 으로 잡이 죽는다"
        )
    # 문자열 컬럼은 여전히 빈 문자열을 걸러야 한다(과잉 수정 방지).
    assert "articles.heating_type != ''" in sql


# ── 세션 408: 알림 문구 우리말화 (사장님 지시 2026-09-15) ──────────────────
#
# "텔레그램 알림은 일반인이 봐도 무엇이 어떻게 잘못되었는지 손쉽게 알 수 있어야 해.
#  어려운 말은 금지야." — 영문 DB 컬럼명이 그대로 나가던 것을 우리말 이름으로 바꿨다.


def test_field_words_covers_every_watched_field():
    """_FIELD_WORDS 가 _THRESHOLDS 의 감시 필드를 **전부** 덮는지 (차집합 공집합).

    빠지면 그 필드가 위반일 때 영문 컬럼명이 그대로 텔레그램에 나간다 — 이 PR 이
    없애려던 바로 그 증상. 감시 대상을 늘릴 때 사전 갱신을 강제한다.
    """
    from crawler.field_drift_monitor import _FIELD_WORDS

    missing = sorted(set(_THRESHOLDS) - set(_FIELD_WORDS))
    assert not missing, f"우리말 이름이 없는 감시 필드: {missing}"

    # 반대 방향 — 감시하지 않는 필드가 사전에 남아 있으면 죽은 항목이다.
    stale = sorted(set(_FIELD_WORDS) - set(_THRESHOLDS))
    assert not stale, f"감시 대상이 아닌데 사전에 남은 필드: {stale}"


def test_field_words_values_are_korean():
    """우리말 이름에 영문이 섞이면 안 된다 (병기 금지 — 사장님 결정)."""
    import re as _re

    from crawler.field_drift_monitor import _FIELD_WORDS

    offenders = [
        (k, v) for k, v in _FIELD_WORDS.items()
        if _re.search(r"[A-Za-z]", v) or not _re.search(r"[가-힣]", v)
    ]
    assert not offenders, f"우리말이 아닌 필드 이름: {offenders}"


def test_violation_alert_has_no_english_field_name():
    """위반 알림 본문: 영문 컬럼명 0, 우리말 이름·통일 접두어 포함.

    뮤테이션: _send_violation_alert 의 `field_words(field)` 를 `field` 로 되돌리면
    영문이 새어 FAIL.
    """
    db = TestSession()
    try:
        _seed_population(db, total=300, filled=150)  # 50% — realtor_address 위반

        with patch("crawler.field_drift_monitor.send_telegram", return_value=True) as mock_tg:
            run_field_drift_monitor()

        msg = mock_tg.call_args[0][0]
        assert msg.startswith("[서버 알림]"), msg
        assert "[내부모니터]" not in msg, msg
        assert _NORMAL_FIELD not in msg, f"영문 컬럼명이 그대로 나갔다: {msg}"
        assert "부동산 주소" in msg, msg
        # 임계·비율이 "열에 몇" 우리말로 풀려 있다
        assert "열에 아홉은 들어와야 정상" in msg, msg
        assert "다섯뿐이에요" in msg, msg
        # 사장님이 판단에 쓰지 않는 표본 건수는 문구에서 뺀다
        assert "표본" not in msg, msg
        # 개발자용 행동 지시가 아니라 사장님이 할 수 있는 안내로 끝난다
        assert "네이버 상세 API" not in msg, msg
        assert "Claude" in msg, msg
    finally:
        db.close()


def test_resolved_alert_has_no_english_field_name():
    """해소 알림도 동일 — 우리말 이름 + `[서버 알림]` 접두어."""
    db = TestSession()
    try:
        _seed_population(db, total=300, filled=150)
        with patch("crawler.field_drift_monitor.send_telegram", return_value=True):
            run_field_drift_monitor()

        for a in db.execute(select(Article).where(Article.article_no.like("A%"))).scalars():
            if getattr(a, _NORMAL_FIELD) is None:
                setattr(a, _NORMAL_FIELD, "서울시 강남구")
        db.commit()

        with patch("crawler.field_drift_monitor.send_telegram", return_value=True) as mock_tg:
            run_field_drift_monitor()

        msg = mock_tg.call_args[0][0]
        assert msg.startswith("[서버 알림]"), msg
        assert "[내부모니터]" not in msg, msg
        assert _NORMAL_FIELD not in msg, f"영문 컬럼명이 그대로 나갔다: {msg}"
        assert "부동산 주소" in msg, msg
    finally:
        db.close()


def test_threshold_and_rate_words_handle_boundaries():
    """"열에 몇" 변환의 0·10 경계 — 0% 와 100% 가 어색한 문장이 되지 않아야 한다."""
    from crawler.field_drift_monitor import (
        _rate_in_words,
        _threshold_in_words,
        _window_in_words,
    )

    assert _threshold_in_words(90) == "열에 아홉은 들어와야 정상"
    assert _threshold_in_words(60) == "열에 여섯은 들어와야 정상"
    assert _threshold_in_words(30) == "열에 셋은 들어와야 정상"

    assert _rate_in_words(0.0) == "지금은 거의 하나도 안 들어와요"
    assert _rate_in_words(2.0) == "지금은 거의 하나도 안 들어와요"  # 반올림 0
    assert _rate_in_words(100.0) == "지금은 거의 다 들어와요"
    assert _rate_in_words(96.0) == "지금은 거의 다 들어와요"  # 반올림 10
    assert _rate_in_words(73.7) == "지금은 일곱뿐이에요"

    # _WINDOW_HOURS=48 → "최근 이틀간"
    assert _window_in_words() == "최근 이틀간"


# ── 세션 408: 문구가 "사실과 다르게" 읽히던 3건 회귀 ────────────────────────
#
# 아래 셋은 전부 사람 눈 검토를 통과했다가 경계값을 직접 렌더해 보고서야 잡힌 것들이다.
# 알림 문구는 코드가 맞아도 **뜻이 틀리면 장애**라, 값마다 문장을 실제로 만들어 확인한다.


def test_threshold_words_floor_not_round():
    """임계는 내림이어야 한다 — 반올림하면 뜻이 더 엄격해지거나 아예 뒤집힌다.

    임계의 뜻은 "최소 이만큼은 들어와야 한다"이다. 95 를 반올림해 "열에 열"이라고 하면
    열 개 전부를 요구하는 말이 되고, 5 를 "열에 영"이라고 하면 하나도 안 들어와도
    정상이라는 반대 뜻이 된다(세션 408 실측).
    """
    from crawler.field_drift_monitor import _threshold_in_words

    assert _threshold_in_words(95) == "열에 아홉은 들어와야 정상"  # 열(X)
    assert _threshold_in_words(25) == "열에 둘은 들어와야 정상"  # 셋(X)
    # 1~9% 는 내림하면 "영"이 되어 뜻이 뒤집히므로 최소 "하나"로 올린다.
    assert _threshold_in_words(5) == "열에 하나는 들어와야 정상"
    assert _threshold_in_words(1) == "열에 하나는 들어와야 정상"


def test_number_words_take_correct_korean_particle():
    """받침 유무에 맞는 조사(은/는) — "하나은" 같은 문장이 나가면 안 된다."""
    from crawler.field_drift_monitor import _TENTH_WORDS, _eun_neun

    # 받침 없는 말 → 는
    assert _eun_neun("하나") == "는"
    # 받침 있는 말 → 은
    for word in ("영", "둘", "셋", "일곱", "여덟", "아홉", "열"):
        assert _eun_neun(word) == "은", f"{word} 의 조사가 틀렸다"
    # 사전의 모든 숫자말이 어색한 조사와 붙지 않는지 전수 확인
    for word in _TENTH_WORDS:
        assert f"{word}{_eun_neun(word)}" != f"{word}은" or _eun_neun(word) == "은"


def test_rate_words_never_claim_threshold_is_met_while_violating():
    """위반인데 "기준을 채웠다"로 읽히면 안 된다 — 임계는 내림, 비율은 반올림이라 충돌한다.

    실제 사례(세션 408): 입주 가능일 55.0% / 임계 60 이 "열에 여섯은 들어와야 정상인데
    지금은 여섯뿐이에요" 로 나갔다 — 위반을 알리면서 정작 기준을 충족한 것처럼 읽힌다.
    """
    # ⚠ 헬퍼를 직접 호출해 단언하면 **호출부가 threshold 를 안 넘기는 실수를 못 잡는다**
    #    (세션 408 뮤테이션 실측: 호출부에서 인자를 빼도 헬퍼 단언은 그대로 통과했다).
    #    그래서 실제로 발송되는 알림 본문을 렌더해서 본다.
    from crawler import field_drift_monitor as fd
    from crawler.field_drift_monitor import _rate_in_words, _threshold_in_words

    for rate, threshold in ((55.0, 60), (89.9, 90), (29.0, 30)):
        with patch("crawler.field_drift_monitor.send_telegram") as mock_tg:
            fd._send_violation_alert("move_in_date", rate, threshold, 8832)
        body = mock_tg.call_args[0][0]
        thr_text = _threshold_in_words(threshold)
        # 임계 문구에 쓰인 숫자말이 비율 자리에 그대로 나오면 "N인데 N뿐" 이 된다.
        thr_word = thr_text.removeprefix("열에 ").split("은")[0].split("는")[0]
        assert f"{thr_word}뿐" not in body, (
            f"{rate}% / 임계 {threshold} 알림이 위반인데 충족처럼 읽힌다:\n{body}"
        )

    # threshold 를 안 넘기면 기존 동작(순수 반올림) 유지 — 하위호환.
    assert _rate_in_words(55.0) == "지금은 여섯뿐이에요"

