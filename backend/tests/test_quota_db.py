"""공유 쿼터 DB 카운터 테스트
실행: python -m pytest tests/test_quota_db.py -v
"""

from unittest.mock import MagicMock

from crawler.quota_db import (
    _quota_key,
    get_api_quota_status,
    increment_api_quota,
)

# ── 키 생성 ──


def test_quota_key_형식():
    """키 형식: quota:{api_name}:{YYYY-MM-DD}"""
    key = _quota_key("data_go_kr")
    assert key.startswith("quota:data_go_kr:")
    # 날짜 부분 검증 (YYYY-MM-DD)
    date_part = key.split(":")[-1]
    assert len(date_part) == 10
    assert date_part[4] == "-" and date_part[7] == "-"


def test_quota_key_커스텀_이름():
    key = _quota_key("naver_api")
    assert "naver_api" in key


# ── increment_api_quota ──


def test_increment_한도_내():
    """카운트가 한도 미만이면 True 반환"""
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one.return_value = 5  # 현재 5회 (한도 9000 미만)
    mock_session().__enter__().execute.return_value = mock_result

    assert increment_api_quota(mock_session, max_calls=9000) is True


def test_increment_한도_초과():
    """카운트가 한도 초과 시 False 반환"""
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one.return_value = 9001  # 한도 초과
    mock_session().__enter__().execute.return_value = mock_result

    assert increment_api_quota(mock_session, max_calls=9000) is False


def test_increment_DB_실패_시_True_폴백():
    """DB 접근 실패 시 True 반환 (호출 허용, in-memory 폴백이 2차 보호)"""
    mock_session = MagicMock()
    mock_session.side_effect = Exception("DB connection failed")

    assert increment_api_quota(mock_session) is True


# ── get_api_quota_status ──


def test_status_정상_조회():
    """정상 조회 시 count/limit/remaining/utilization_pct 반환"""
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.fetchone.return_value = (3000,)
    mock_session().__enter__().execute.return_value = mock_result

    status = get_api_quota_status(mock_session, max_calls=9000)
    assert status["count"] == 3000
    assert status["limit"] == 9000
    assert status["remaining"] == 6000
    assert status["utilization_pct"] == 33.3


def test_status_레코드_없음():
    """오늘 데이터 없을 때 count=0"""
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.fetchone.return_value = None
    mock_session().__enter__().execute.return_value = mock_result

    status = get_api_quota_status(mock_session)
    assert status["count"] == 0
    assert status["remaining"] == 9000


def test_status_DB_실패():
    """DB 실패 시 count=-1"""
    mock_session = MagicMock()
    mock_session.side_effect = Exception("DB down")

    status = get_api_quota_status(mock_session)
    assert status["count"] == -1
    assert status["remaining"] == -1


# ── purge_expired_counters (만료 행 정리) ──
#
# rate_limit_counters 는 `quota:{api}:{날짜}` 로 날짜마다 새 키가 생기는데 expires_at 을
# 보고 지우는 주체가 없어 만료분이 계속 쌓이고 있었다(2026-04-15 이후 ~135행).
# 아래는 "만료된 것만 지우고, 살아있는 것·NULL 은 절대 안 지운다" 는 계약의 가드다.


def test_purge_expired_counters_deletes_only_expired(db):
    """만료/미만료/NULL 3종 중 **만료된 것만** 삭제한다.

    fixture 세 축을 서로 다른 값으로 둔다(testing.md 세션372 답습) — count 를
    1/2/3 으로 달리해, 코드가 엉뚱한 행을 지워도 어떤 행이 남았는지로 잡아낸다.
    """
    from datetime import datetime, timedelta, timezone

    from crawler.quota_db import purge_expired_counters
    from db.models import RateLimitCounter

    now = datetime.now(timezone.utc)
    db.add_all([
        # 만료됨 — 유일한 삭제 대상
        RateLimitCounter(key="quota:old:2026-04-15", count=1,
                         expires_at=now - timedelta(days=100)),
        # 이미 만료됐지만 경계에 가까운 행 — 이것도 대상이다
        RateLimitCounter(key="quota:old:2026-08-28", count=2,
                         expires_at=now - timedelta(minutes=1)),
        # 아직 유효 — 오늘 쓰고 있는 카운터라 지우면 쿼터가 초기화된다(치명적)
        RateLimitCounter(key="quota:today:2026-08-29", count=3,
                         expires_at=now + timedelta(hours=5)),
    ])
    db.commit()

    deleted = purge_expired_counters(db)

    assert deleted == 2, "삭제 건수가 만료 행 수와 다르다"
    remaining = {r.key: r.count for r in db.query(RateLimitCounter).all()}
    assert remaining == {"quota:today:2026-08-29": 3}


def test_purge_expired_counters_null_guard_is_unreachable_by_schema():
    """`expires_at IS NOT NULL` 가드는 **현재 스키마에선 도달 불가**하다는 사실 박제.

    컬럼이 NOT NULL 이라 ORM·raw SQL 어느 쪽으로도 NULL 행을 만들 수 없다(구현 중
    IntegrityError 로 실측). 그래서 그 가드는 "지금 동작하는 방어" 가 아니라 스키마가
    완화되거나 수동 INSERT 가 생길 때를 대비한 것이다 — 커버리지가 안 잡힌다고
    죽은 코드로 오해해 지우지 않도록 여기에 이유를 남긴다.

    이 단언이 깨지면(= NULL 이 허용되면) 위 삭제 테스트에 NULL 행 케이스를 추가할 것.
    """
    from db.models import RateLimitCounter

    assert RateLimitCounter.__table__.c.expires_at.nullable is False


def test_purge_expired_counters_noop_when_nothing_expired(db):
    """만료 행이 없으면 0을 돌려주고 아무것도 지우지 않는다 (매일 도는 잡의 정상 상태)."""
    from datetime import datetime, timedelta, timezone

    from crawler.quota_db import purge_expired_counters
    from db.models import RateLimitCounter

    now = datetime.now(timezone.utc)
    db.add(RateLimitCounter(key="quota:live:1", count=7,
                            expires_at=now + timedelta(hours=1)))
    db.commit()

    assert purge_expired_counters(db) == 0
    assert db.query(RateLimitCounter).count() == 1


def test_vacuum_job_purges_expired_counters(db, monkeypatch):
    """일일 VACUUM 잡이 만료 카운터를 함께 치운다 (배선 가드).

    ⚠ 테스트 환경은 SQLite 라 VACUUM 본체는 early return 으로 skip 된다. 정리
    호출을 그 return **뒤**에 두면 SQLite 경로에선 영영 안 돌고 이 테스트가
    그 실수를 잡는다(운영 PostgreSQL 에선 통과해버려 눈치채기 어렵다).
    """
    from datetime import datetime, timedelta, timezone

    from crawler.vacuum_maintenance import run_vacuum_maintenance
    from db.models import RateLimitCounter

    now = datetime.now(timezone.utc)
    db.add_all([
        RateLimitCounter(key="quota:expired:a", count=1,
                         expires_at=now - timedelta(days=2)),
        RateLimitCounter(key="quota:alive:b", count=2,
                         expires_at=now + timedelta(days=1)),
    ])
    db.commit()

    result = run_vacuum_maintenance()

    assert result["purged_counters"] == 1
    assert [r.key for r in db.query(RateLimitCounter).all()] == ["quota:alive:b"]


def test_vacuum_job_survives_purge_failure(db, monkeypatch):
    """정리가 터져도 VACUUM 잡은 정상 완료된다 (곁다리가 본체를 죽이지 않는다)."""
    import crawler.vacuum_maintenance as vm
    from db.models import CrawlJob

    def _boom(_db):
        raise RuntimeError("purge exploded")

    monkeypatch.setattr("crawler.quota_db.purge_expired_counters", _boom)

    result = vm.run_vacuum_maintenance()

    assert result["purged_counters"] == 0
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "vacuum_maintenance").one()
    assert job.status == "completed", "곁다리 실패가 잡을 실패로 만들었다"
