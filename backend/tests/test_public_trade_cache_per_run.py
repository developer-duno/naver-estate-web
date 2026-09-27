"""정부 실거래가 캐시는 한 수집 회차 안에서만 쓴다 — 회귀 테스트 (세션 422).

배경: PublicDataAPI._trade_cache 는 (시군구, 달) → 거래 목록을 프로세스 메모리에 둔다.
옛 주석은 "재시작 때마다 자연 초기화"라 했지만 백엔드는 며칠씩 떠 있어
  - 토요일 주간 수집이 지난 회차(또는 관리자 단건 소급)가 받아 둔 달을 그대로 돌려받아 새 거래를 못 받고
  - 주간 회차가 받은 거래 수십만 건이 다음 재시작까지 메모리에 남았다.
처방 = 두 수집기(collect_public_trade_data·backfill_price_batch)가 시작·끝에서
PublicDataAPI.clear_trade_cache() 로 캐시만 비운다(세션·일일 카운터·rate_limit 은 그대로).

외부 호출 0 — 창구 한 쪽 호출(get_apt_trades)을 가짜로 바꿔 캐시 로직은 진짜로 돈다.
"""
from datetime import date as _real_date
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from db.models import Complex

_EMPTY_ENVELOPE = {
    "response": {
        "header": {"resultCode": "00"},
        "body": {"totalCount": 0, "items": ""},
    }
}


class _FakeDate(_real_date):
    """date.today() 고정 (test_public_trade_remaining.py 패턴 답습)"""

    @classmethod
    def today(cls):
        return _real_date(2026, 3, 14)  # 토요일


class _FakeWindow:
    """창구 한 쪽 호출을 흉내 — 요청한 (시군구, 달)을 차례로 적고 정상 빈 달을 돌려준다."""

    def __init__(self):
        self.requested: list[tuple[str, str]] = []
        self.fail_from_nth: int | None = None  # 시군구마다 n번째 호출(0부터)부터 실패(None)

    def get_apt_trades(self, lawd_cd, deal_ymd, *args, **kwargs):
        nth = sum(1 for lawd, _ in self.requested if lawd == lawd_cd)
        self.requested.append((lawd_cd, deal_ymd))
        if self.fail_from_nth is not None and nth >= self.fail_from_nth:
            return None
        return _EMPTY_ENVELOPE


@pytest.fixture
def window():
    """PublicDataAPI 를 깨끗이 시작하고, 창구 호출·날짜·텔레그램·일일 예산을 고정한다."""
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()
    w = _FakeWindow()
    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}), \
         patch("datetime.date", _FakeDate), \
         patch.object(PublicDataAPI, "get_apt_trades", side_effect=w.get_apt_trades), \
         patch("crawler.quota_db.get_api_quota_status",
               return_value={"remaining": 5000, "count": 0, "limit": 9000}), \
         patch("services.telegram.send_telegram"):
        yield w
    PublicDataAPI.reset()


def _add_complexes(db, n: int):
    """같은 시군구(11680)의 단지 n개 — 소급 선정 조건(세대수·법정동·이력 부족)을 만족."""
    for k in range(n):
        db.add(Complex(
            complex_no=f"C{k}", complex_name=f"캐시단지{k}", cortar_no="1168010300",
            total_household_count=1000 - k,
        ))
    db.commit()


def _leave_residue():
    """관리자 단건 소급(backfill_price_history 직접 호출)은 캐시를 비우지 않는다 —
    수집 회차 밖에서 캐시가 채워진 채 남는 경로를 재현한다."""
    from crawler.public_data_api import PublicDataAPI
    from crawler.service_public import backfill_price_history
    backfill_price_history("C0", months_back=24)
    assert PublicDataAPI._trade_cache, "전제: 단건 소급이 캐시를 채워 둔다"


def _run_weekly():
    from crawler.service_public import collect_public_trade_data
    collect_public_trade_data(batch_size=50, scheduler_job_id="collect_public_trades")


def _run_batch(**kwargs):
    from crawler.service_public import backfill_price_batch
    return backfill_price_batch(batch_size=20, scheduler_job_id="backfill_price", **kwargs)


def _clear_attempted(db):
    """소급 선정은 90일 안에 시도한 단지를 빼므로, 두 번째 회차가 같은 단지를 다시 고르게 되돌린다."""
    db.query(Complex).update({Complex.public_data_attempted_at: None})
    db.commit()


# ── ① 주간 수집을 같은 프로세스에서 두 번 — 두 번째도 창구를 부른다 ──────────


def test_주간_수집_두번째_회차도_창구를_부른다(db, window):
    from crawler.public_data_api import PublicDataAPI
    _add_complexes(db, 1)

    _run_weekly()
    first = len(window.requested)
    assert first == 24, "시군구 1 × 24개월"
    assert not PublicDataAPI._trade_cache, "회차가 끝나면 캐시를 비운다(메모리 반납)"

    # 회차 사이에 관리자 단건 소급이 같은 달들을 캐시에 남긴다
    _leave_residue()
    window.requested.clear()

    _run_weekly()
    assert len(window.requested) == first, "지난 캐시를 재사용하면 새 거래를 못 받는다"
    assert not PublicDataAPI._trade_cache


# ── ② 소급 배치를 같은 프로세스에서 두 번 — 두 번째도 창구를 부른다 ──────────


def test_소급_배치_두번째_회차도_창구를_부른다(db, window):
    from crawler.public_data_api import PublicDataAPI
    _add_complexes(db, 1)

    _run_batch()
    first = len(window.requested)
    assert first == 24, "단지 1 × 24개월"
    assert not PublicDataAPI._trade_cache, "회차가 끝나면 캐시를 비운다(메모리 반납)"

    _leave_residue()
    _clear_attempted(db)
    window.requested.clear()

    result = _run_batch()
    assert result["success"] == 1
    assert len(window.requested) == first, "지난 캐시를 재사용하면 새 거래를 못 받는다"
    assert not PublicDataAPI._trade_cache


# ── ③ 한 배치 안에서는 같은 (시군구, 달)을 두 번 부르지 않는다 ───────────────


def test_한_배치_안_같은_시군구_두_단지는_그_달을_한번만_부른다(db, window):
    _add_complexes(db, 2)

    result = _run_batch()

    assert result["success"] == 2
    assert len(window.requested) == 24, "두 단지가 캐시를 나눠 써 24번(48번이면 단지마다 비운 것)"
    assert len(set(window.requested)) == 24


# ── ④ clear_trade_cache 는 캐시만 비운다 ─────────────────────────────────────


def test_clear_trade_cache는_일일_카운터와_rate_limit을_건드리지_않는다():
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()
    try:
        rl = {"remaining": 1234, "limit": 10000, "at": datetime.now(timezone.utc)}
        with PublicDataAPI._lock:
            PublicDataAPI._daily_call_count = 777
            PublicDataAPI._rate_limit = rl
            PublicDataAPI._last_failure_kind = "quota"
        PublicDataAPI._trade_cache[("11680", "202603")] = []

        PublicDataAPI.clear_trade_cache()

        assert not PublicDataAPI._trade_cache
        assert PublicDataAPI._daily_call_count == 777, "자체 한도 카운터가 0 이 되면 일일 게이트가 풀린다"
        assert PublicDataAPI.last_rate_limit() == rl
        assert PublicDataAPI.last_failure_kind() == "quota"
    finally:
        PublicDataAPI.reset()


# ── 보완(세션 422 검사관 A-5·C-5): 정상 반환이 아닌 경로에서도 비운다 ──────────


def test_주간_연속실패_중단_return_경로에서도_캐시를_비운다(db, window):
    """시군구마다 첫 달은 받아(캐시에 들어감) 둘째 달에서 실패 → 연속 실패 중단 후
    failed 마감 return. 끝 비우기가 finally 가 아니라 정상 완료 경로에만 있으면 캐시가 남는다."""
    from crawler.public_data_api import PublicDataAPI
    from crawler.service_public import PUBLIC_TRADE_ABORT_AFTER_SIGUNGU
    from db.models import CrawlJob
    for k in range(PUBLIC_TRADE_ABORT_AFTER_SIGUNGU):
        code = f"{11000 + k * 10:05d}"
        db.add(Complex(complex_no=f"R{k}", complex_name=f"중단단지{k}", cortar_no=code + "00000"))
    db.commit()
    window.fail_from_nth = 1

    probe: list[int] = []
    real_clear = PublicDataAPI.clear_trade_cache.__func__

    def _probe_clear(cls):
        probe.append(len(cls._trade_cache))  # 비우기 직전 크기 — 탐침
        real_clear(cls)

    with patch.object(PublicDataAPI, "clear_trade_cache", classmethod(_probe_clear)):
        _run_weekly()

    db.expire_all()
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "public_trade_data").one()
    assert job.status == "failed" and "중단" in (job.error_message or ""), job.error_message
    assert probe[-1] == PUBLIC_TRADE_ABORT_AFTER_SIGUNGU, f"끝 비우기가 받은 달을 비워야 한다: {probe}"
    assert not PublicDataAPI._trade_cache


def test_소급_배치_바깥_예외_경로에서도_캐시를_비운다(db, window):
    """첫 단지가 24개월을 받아 캐시를 채운 뒤, 둘째 단지 직전 예산 조회가 던져 바깥 except 로 끝난다."""
    from crawler.public_data_api import PublicDataAPI
    _add_complexes(db, 2)

    with patch("crawler.quota_db.get_api_quota_status",
               side_effect=[{"remaining": 5000, "count": 0, "limit": 9000}, RuntimeError("시험용 예외")]):
        result = _run_batch()

    assert "error" in result, result
    assert len(window.requested) == 24, "첫 단지는 받았다(캐시가 찼다)"
    assert not PublicDataAPI._trade_cache, "바깥 예외로 끝나도 캐시를 비운다"


def test_clear_cache_False면_두_배치_사이_캐시를_나눠_쓴다(db, window):
    """일회성 스크립트 경로 — 배치를 반복 호출하며 캐시를 유지한다."""
    from crawler.public_data_api import PublicDataAPI
    _add_complexes(db, 1)

    _run_batch(clear_cache=False)
    assert len(window.requested) == 24
    assert PublicDataAPI._trade_cache, "clear_cache=False 면 끝에서 비우지 않는다"

    _clear_attempted(db)
    window.requested.clear()
    result = _run_batch(clear_cache=False)

    assert result["success"] == 1
    assert window.requested == [], "같은 (시군구, 달)은 두 번째 배치에서 창구를 부르지 않는다"


def test_캐시_비움_로그는_달과_거래_수를_찍는다(caplog):
    import logging

    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()
    caplog.set_level(logging.INFO, logger="crawler.public_data_api")
    try:
        PublicDataAPI._trade_cache[("11680", "202602")] = [{"a": 1}, {"a": 2}]
        PublicDataAPI._trade_cache[("11680", "202603")] = [{"a": 3}]
        PublicDataAPI.clear_trade_cache()
        PublicDataAPI.clear_trade_cache()  # 비어 있어도 0·0 을 찍는다(새 코드가 도는 증거)

        lines = [r.getMessage() for r in caplog.records if "실거래가 캐시 비움" in r.getMessage()]
        assert lines == [
            "[정부 실거래가] 실거래가 캐시 비움: 달 2개·거래 3건",
            "[정부 실거래가] 실거래가 캐시 비움: 달 0개·거래 0건",
        ], lines
    finally:
        PublicDataAPI.reset()
