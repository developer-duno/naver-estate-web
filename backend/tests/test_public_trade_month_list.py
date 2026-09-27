"""정부 실거래가 수집 대상 "월 목록" 회귀 테스트 (세션 421).

배경: 옛 코드는 "오늘부터 30일씩 거슬러 올라가며 그 날짜가 속한 달을 취함" 방식이라,
28일인 2월을 30일 간격 계산이 건너뛰어 2월이 통째로 빠지고 그만큼 오래된 달이
중복으로 끼어들었다(중복 제거 뒤 24개월이 23개월로 줄어듦). `_recent_months()`는
달력의 달 단위로 직접 계산해 이 문제를 없앤다.
"""
from datetime import date

import pytest

from crawler.service_public import _recent_months


def _assert_consecutive_24(months: list[str]):
    assert len(months) == 24, months
    assert len(set(months)) == 24, f"중복 있음: {months}"
    # 인접한 달의 차이가 정확히 1개월인지 (연도 넘김 포함)
    for a, b in zip(months, months[1:]):
        ya, ma = int(a[:4]), int(a[4:])
        yb, mb = int(b[:4]), int(b[4:])
        assert (yb * 12 + mb) - (ya * 12 + ma) == 1, f"{a} -> {b} 가 연속되지 않음"


@pytest.mark.parametrize("month", range(1, 13))
def test_2026년_각_달에서_24개월_연속_중복없음(month):
    today = date(2026, month, 15)
    months = _recent_months(today, 24)
    _assert_consecutive_24(months)


def test_2027_03_14_에서도_24개월_연속():
    months = _recent_months(date(2027, 3, 14), 24)
    _assert_consecutive_24(months)


def test_2028_03_윤년_2월_29일_포함_월에서도_24개월_연속():
    # 2028은 윤년(2월 29일) — 그 다음 달(3월)에서 계산해도 정상 동작해야 함
    months = _recent_months(date(2028, 3, 1), 24)
    _assert_consecutive_24(months)


def test_2026_03_14_에_202602가_빠지지_않는다():
    """옛 결함의 직접 재현 케이스 — 오늘이 2026-03-14 면 30일 계산이 202602 를 건너뛰었다."""
    months = _recent_months(date(2026, 3, 14), 24)
    assert "202602" in months, months
    _assert_consecutive_24(months)


def test_소급_month_back이_24가_아닌_값에서도_연속():
    """소급(backfill) 쪽은 months_back 이 호출자마다 다르다(기본 60, 시험은 3 등) —
    24 가 아닌 값에서도 연속·중복없음이 성립해야 한다."""
    months = _recent_months(date(2026, 3, 14), 3)
    assert len(months) == 3
    assert len(set(months)) == 3
    assert months == sorted(months)
    for a, b in zip(months, months[1:]):
        ya, ma = int(a[:4]), int(a[4:])
        yb, mb = int(b[:4]), int(b[4:])
        assert (yb * 12 + mb) - (ya * 12 + ma) == 1, f"{a} -> {b} 가 연속되지 않음"
    assert months == ["202601", "202602", "202603"]


def test_n0이면_빈_리스트():
    assert _recent_months(date(2026, 3, 14), 0) == []


def test_정렬은_오름차순():
    months = _recent_months(date(2026, 3, 14), 5)
    assert months == sorted(months)


# ── 호출부 통합 확인 — backfill_price_history 가 실제로 _recent_months 를 거쳐
#    국토부 API 에 연속된 달을 요청하는지 (M4 변이검증에서 드러난 사각을 메움:
#    _recent_months 단위 시험만으로는 호출부가 그 함수를 실제로 쓰는지 확인 못 함) ──


def test_backfill_price_history가_실제로_연속된_달을_요청한다(db):
    from datetime import date as _real_date
    from unittest.mock import patch

    from db.models import Complex

    db.add(Complex(
        complex_no="M001", complex_name="달목록시험단지", cortar_no="1168010300",
    ))
    db.commit()

    class _FakeDate(_real_date):
        @classmethod
        def today(cls):
            return _real_date(2026, 3, 14)

    requested_ymd: list[str] = []

    def _fake_get_all(sigungu_cd, deal_ymd):
        requested_ymd.append(deal_ymd)
        return []  # 빈 달로 응답 — 매칭 로직과 무관하게 요청된 달만 관찰

    with patch("datetime.date", _FakeDate), \
         patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake_get_all):
        from crawler.service_public import backfill_price_history
        backfill_price_history("M001", months_back=24)

    assert len(requested_ymd) == 24, requested_ymd
    assert len(set(requested_ymd)) == 24, f"중복 요청: {requested_ymd}"
    assert "202602" in requested_ymd, requested_ymd
    ordered = sorted(requested_ymd)
    for a, b in zip(ordered, ordered[1:]):
        ya, ma = int(a[:4]), int(a[4:])
        yb, mb = int(b[:4]), int(b[4:])
        assert (yb * 12 + mb) - (ya * 12 + ma) == 1, f"{a} -> {b} 가 연속되지 않음"
