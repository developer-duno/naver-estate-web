"""API 별 쿼터 버킷 분리 검증 (세션 388).

배경(결함): `public_data_base.check_global_daily_limit()` 이
`increment_api_quota(SessionLocal, max_calls=...)` 를 **api_name 없이** 호출해
모든 서브클래스(air_quality·emergency·kapt…)가 `quota:data_go_kr:{날짜}` 전역 키
하나(한도 9,000)를 나눠 썼다. `_api_name` 은 로그에만 쓰였다.

data.go.kr 실제 한도는 **활용신청(API)별**이라 이는 kapt 에겐 틀린 모델이다 —
관리비 수집 500단지 x 22콜 = 11,000/일이 9,000 에서 잘리고, 매월 21일 매칭
(목록 2.2만 + 확정분 basis)도 부분 실행되며 다른 수집기 쿼터까지 잠식한다.

실행: python -m pytest tests/test_quota_bucket.py -v
"""

from unittest.mock import patch

import pytest

from crawler import public_data_base
from crawler.kapt_api import KaptAPI
from crawler.public_data_base import GLOBAL_DAILY_LIMIT, BasePublicDataAPI


class _DummyGlobalAPI(BasePublicDataAPI):
    """_quota_name 미선언 서브클래스 — 기존 동작(전역 버킷) 보존 확인용.

    실제 기존 수집기(air_quality 등)와 동일한 형태다(그 클래스들도 _api_name 만 선언).
    """

    _api_name = "dummy_global"


@pytest.fixture(autouse=True)
def _reset_buckets():
    """모듈 전역 in-memory 카운터를 테스트마다 초기화 (테스트 간 누수 방지)."""
    public_data_base._bucket_daily.clear()
    public_data_base._global_daily_count = 0
    public_data_base._global_daily_date = ""
    yield
    public_data_base._bucket_daily.clear()


def _run_call_api(cls):
    """call_api 를 쿼터 체크까지만 태우고, 실제 HTTP 는 나가지 않게 한다.

    쿼터 통과 시 세션 GET 이 불리므로 그것도 막는다(응답 없음 → None 반환).
    """
    with (
        patch.object(cls, "_get_service_key", return_value="test-key"),
        patch.object(cls, "_throttle"),
        patch.object(cls, "_get_session") as mock_sess,
    ):
        mock_sess.return_value.get.side_effect = RuntimeError("network blocked in test")
        return cls.call_api("https://example.test/op", {})


# ── ① kapt 는 자기 버킷 이름·한도로 호출한다 ──


def test_kapt_uses_own_quota_bucket():
    """KaptAPI.call_api 는 increment_api_quota 를 api_name='kapt', max_calls=60000 으로 호출."""
    with patch("crawler.quota_db.increment_api_quota", return_value=True) as mock_inc:
        _run_call_api(KaptAPI)

    assert mock_inc.call_count == 1
    kwargs = mock_inc.call_args.kwargs
    assert kwargs["api_name"] == "kapt", f"전역 버킷으로 샘: {mock_inc.call_args}"
    assert kwargs["max_calls"] == 60_000


def test_kapt_quota_attributes_declared():
    """클래스 속성이 실제로 선언돼 있다(상속 기본값 None 이 아님)."""
    assert KaptAPI._quota_name == "kapt"
    assert KaptAPI._quota_daily_limit == 60_000


# ── ② 기존 서브클래스는 전역 버킷 유지 (기존 동작 보존 회귀 가드) ──


def test_subclass_without_quota_name_keeps_global_bucket():
    """_quota_name 미선언 서브클래스는 api_name 을 넘기지 않는다(=기본값 data_go_kr).

    이 가드가 깨지면 기존 수집기들의 쿼터 버킷이 조용히 이동해, mibunyang 과 합산
    추적하던 전역 카운트가 어긋난다.
    """
    with patch("crawler.quota_db.increment_api_quota", return_value=True) as mock_inc:
        _run_call_api(_DummyGlobalAPI)

    assert mock_inc.call_count == 1
    assert "api_name" not in mock_inc.call_args.kwargs, (
        f"전역 버킷 서브클래스가 api_name 을 넘김: {mock_inc.call_args}"
    )
    assert mock_inc.call_args.kwargs["max_calls"] == GLOBAL_DAILY_LIMIT


def test_existing_collectors_have_no_quota_name():
    """실제 기존 수집기들이 전역 버킷을 유지하는지 직접 확인(더미가 아닌 실물)."""
    from crawler.air_quality_api import AirQualityAPI
    from crawler.applyhome_officetel_api import ApplyhomeOfficetelAPI

    for cls in (AirQualityAPI, ApplyhomeOfficetelAPI):
        assert cls._quota_name is None, f"{cls.__name__} 버킷이 바뀜"


# ── ③ 버킷 격리: kapt 한도 도달이 전역 카운트를 건드리지 않는다 ──


def test_kapt_limit_does_not_touch_global_counter():
    """kapt 버킷이 한도 도달(False)해도 전역 in-memory 카운트는 0 그대로."""
    with patch("crawler.quota_db.increment_api_quota", return_value=False):
        result = _run_call_api(KaptAPI)

    assert result is None  # 한도 도달로 호출 차단
    assert public_data_base.get_global_daily_count() == 0, "kapt 호출이 전역 카운트를 올림"
    assert public_data_base.get_api_daily_count("kapt") == 1


def test_global_call_does_not_touch_kapt_bucket():
    """역방향 — 전역 버킷 호출은 kapt 버킷 카운트를 올리지 않는다."""
    with patch("crawler.quota_db.increment_api_quota", return_value=True):
        _run_call_api(_DummyGlobalAPI)

    assert public_data_base.get_api_daily_count("kapt") == 0
    assert public_data_base.get_global_daily_count() == 1


# ── DB 실패 시 버킷별 in-memory 폴백 ──


def test_bucket_fallback_enforces_limit_when_db_fails():
    """DB 실패 시에도 버킷별 in-memory 카운터가 한도를 지킨다."""
    with patch("crawler.quota_db.increment_api_quota", side_effect=Exception("DB down")):
        # 한도 2 로 좁혀 3회 호출 → 3번째는 False
        assert public_data_base.check_api_daily_limit("tiny", 2) is True
        assert public_data_base.check_api_daily_limit("tiny", 2) is True
        assert public_data_base.check_api_daily_limit("tiny", 2) is False


def test_bucket_fallback_is_isolated_per_bucket():
    """폴백 카운터도 버킷끼리 섞이지 않는다."""
    with patch("crawler.quota_db.increment_api_quota", side_effect=Exception("DB down")):
        assert public_data_base.check_api_daily_limit("bucket_a", 1) is True
        assert public_data_base.check_api_daily_limit("bucket_a", 1) is False
        # 다른 버킷은 영향 없음
        assert public_data_base.check_api_daily_limit("bucket_b", 1) is True
