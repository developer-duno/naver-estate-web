"""K-apt 창구 호출 간격 1.5초 회귀 가드 (세션 425, 2026-10-01).

K-apt 창구는 0.3초 간격으로 부르면 33번째 콜부터 약 10분간 K-apt 전체가 오류 코드 04 를
돌려준다(서버 밖 재현 — kapt_api._KAPT_MIN_INTERVAL_SEC 주석). 그래서 K-apt 만 1.5초 간격,
다른 공공데이터 창구는 0.3초 그대로다. 이 파일이 지키는 것:
  (a) KaptAPI 의 간격 값이 숫자 그대로 1.5 다.
  (b) KaptAPI._throttle 을 연달아 부르면 두 번째가 1.5초를 기다린다.
  (c) 다른 창구(기존 서브클래스·시험용 서브클래스)는 0.3초다.
  (d) KaptAPI 를 부른 직후 다른 창구는 1.5초를 기다리지 않는다(간격 기록이 창구마다 따로).

시계는 밖에서 고정한다 — `public_data_base.time` 을 가짜로 바꿔 실제로 자지 않는다.
"""
import pytest

from crawler import public_data_base
from crawler.air_quality_api import AirQualityAPI
from crawler.applyhome_officetel_api import ApplyhomeOfficetelAPI
from crawler.crime_stats_api import CrimeStatsAPI
from crawler.emergency_api import EmergencyAPI
from crawler.kapt_api import KaptAPI
from crawler.public_data_base import BasePublicDataAPI


class _OtherAPI(BasePublicDataAPI):
    """시험용 다른 창구 — 간격을 덮어쓰지 않은 서브클래스."""

    _api_name = "pace_test_other"


class _FakeTime:
    """가짜 시계 — sleep 은 기다리지 않고 요청 시간을 기록한 뒤 시계만 앞으로 민다."""

    def __init__(self, start: float = 1000.0):
        self.now = start
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


_TOUCHED = (BasePublicDataAPI, KaptAPI, _OtherAPI)


@pytest.fixture
def fake_time(monkeypatch):
    """가짜 시계를 끼우고, 시험 뒤 각 클래스의 간격 기록을 원래 상태로 되돌린다.

    `_throttle` 의 `cls._last_request_time = …` 는 서브클래스에 **자기 속성**을 새로 붙인다.
    시험 전에 자기 속성이 없던 클래스는 시험 뒤 그 속성을 지워 원상태(기본 클래스 값 상속)로.
    """
    saved = {
        cls: (("_last_request_time" in cls.__dict__), cls.__dict__.get("_last_request_time"))
        for cls in _TOUCHED
    }
    for cls in (KaptAPI, _OtherAPI):
        cls._last_request_time = 0.0
    fake = _FakeTime()
    monkeypatch.setattr(public_data_base, "time", fake)
    yield fake
    for cls, (had_own, value) in saved.items():
        if had_own:
            cls._last_request_time = value
        elif "_last_request_time" in cls.__dict__:
            delattr(cls, "_last_request_time")


def test_kapt_min_interval_is_one_and_half_seconds():
    """(a) K-apt 간격은 글자 그대로 1.5초 — 0.3초면 33번째 콜부터 약 10분간 전부 04."""
    assert KaptAPI._min_interval == 1.5


def test_other_existing_apis_keep_point_three_seconds():
    """(c) K-apt 말고 기존 창구는 0.3초 그대로(동작 무변경)."""
    assert BasePublicDataAPI._min_interval == 0.3
    for cls in (AirQualityAPI, ApplyhomeOfficetelAPI, CrimeStatsAPI, EmergencyAPI, _OtherAPI):
        assert cls._min_interval == 0.3, cls.__name__


def test_kapt_throttle_waits_one_and_half_seconds_between_calls(fake_time):
    """(b) 연달아 두 번 부르면 첫 번째는 바로, 두 번째는 1.5초를 기다린다."""
    KaptAPI._throttle()
    KaptAPI._throttle()
    assert fake_time.sleeps == [pytest.approx(1.5)]


def test_other_api_throttle_waits_point_three_seconds(fake_time):
    """(c) 간격을 덮어쓰지 않은 창구는 두 번째 호출이 0.3초만 기다린다."""
    _OtherAPI._throttle()
    _OtherAPI._throttle()
    assert fake_time.sleeps == [pytest.approx(0.3)]


def test_kapt_call_does_not_delay_other_api(fake_time):
    """(d) K-apt 를 부른 직후 다른 창구는 1.5초를 기다리지 않는다 — 간격 기록이 창구마다 따로다."""
    base_before = BasePublicDataAPI.__dict__["_last_request_time"]
    KaptAPI._throttle()
    kapt_last = KaptAPI._last_request_time
    _OtherAPI._throttle()
    assert fake_time.sleeps == []  # 다른 창구의 첫 호출은 K-apt 직후여도 바로 나간다
    _OtherAPI._throttle()
    assert fake_time.sleeps == [pytest.approx(0.3)]  # 그다음도 자기 간격(0.3초)만
    # 다른 창구 호출이 K-apt 의 간격 기록을 건드리지 않았다
    assert KaptAPI._last_request_time == kapt_last
    # 간격 기록은 서브클래스 자기 속성으로 붙고, 기본 클래스 값은 그대로다
    assert "_last_request_time" in KaptAPI.__dict__
    assert "_last_request_time" in _OtherAPI.__dict__
    assert BasePublicDataAPI.__dict__["_last_request_time"] == base_before
