"""B1(전세) 시세 오염 정리 헬퍼 단위 테스트.

crawler/service_price.py 의 find_contaminated_b1_ids / contaminated_complex_nos /
recollect_b1_price_for_complex 를 검증한다.
배경: ~/.claude/plans/claude-cosmic-minsky.md
"""

from datetime import datetime
from unittest.mock import patch

from crawler.service_price import (
    contaminated_complex_nos,
    find_contaminated_b1_ids,
    recollect_b1_price_for_complex,
)
from db.models import ComplexPriceHistory

# 정상/오염 경계 시각 — 헬퍼 기본 cutoff(2026-04-12) 기준
_OLD = datetime(2026, 3, 24)   # cutoff 이전 = 오염 시기
_NEW = datetime(2026, 4, 20)   # cutoff 이후 = 정상 시기


# ── 팩토리 ──


def _row(complex_no, trade_type, price_avg, recorded_at, area_no="1", base_month="20260301"):
    """complex_price_history 행 1개. price_avg가 핵심 — 오염 판별 기준."""
    return ComplexPriceHistory(
        complex_no=complex_no,
        trade_type=trade_type,
        area_no=area_no,
        base_month=base_month,
        price_upper=price_avg + 1000,
        price_lower=price_avg - 1000,
        price_avg=price_avg,
        recorded_at=recorded_at,
    )


# ── 오염 식별 헬퍼 ──


def test_detects_contaminated_b1(db):
    """기준1: B1 price_avg가 A1과 동일 → 오염으로 검출"""
    db.add(_row("1001", "A1", 150000, _OLD))
    b1 = _row("1001", "B1", 150000, _OLD)   # A1과 동일 = 오염
    db.add(b1)
    db.commit()

    ids = find_contaminated_b1_ids(db)
    assert b1.id in ids


def test_preserves_clean_b1(db):
    """정상 B1(price_avg가 A1과 다름, 최근 기록)은 제외 — 가장 중요"""
    db.add(_row("1002", "A1", 150000, _NEW))
    clean = _row("1002", "B1", 90000, _NEW)   # A1보다 낮은 정상 전세가
    db.add(clean)
    db.commit()

    ids = find_contaminated_b1_ids(db)
    assert clean.id not in ids


def test_detects_b1_without_a1_when_old(db):
    """기준2: A1 짝 없음 + cutoff 이전 기록 → 오염으로 검출"""
    orphan = _row("1003", "B1", 88000, _OLD)   # 동일 키 A1 없음
    db.add(orphan)
    db.commit()

    ids = find_contaminated_b1_ids(db)
    assert orphan.id in ids


def test_preserves_b1_without_a1_when_recent(db):
    """A1 짝 없어도 cutoff 이후 기록이면 정상 — 제외"""
    recent = _row("1004", "B1", 88000, _NEW)   # A1 없지만 최근 = 정상
    db.add(recent)
    db.commit()

    ids = find_contaminated_b1_ids(db)
    assert recent.id not in ids


def test_null_price_avg_excluded(db):
    """기준1: price_avg가 NULL이면 비교 불가 → 제외"""
    db.add(_row("1005", "A1", 150000, _NEW))
    null_b1 = ComplexPriceHistory(
        complex_no="1005", trade_type="B1", area_no="1",
        base_month="20260301", price_avg=None, recorded_at=_NEW,
    )
    db.add(null_b1)
    db.commit()

    ids = find_contaminated_b1_ids(db)
    assert null_b1.id not in ids


def test_contaminated_complex_nos_distinct(db):
    """같은 단지에 오염 B1 여러 행 → 단지 번호는 1개로 distinct"""
    db.add(_row("1006", "A1", 150000, _OLD, base_month="20260301"))
    db.add(_row("1006", "A1", 140000, _OLD, base_month="20260201"))
    db.add(_row("1006", "B1", 150000, _OLD, base_month="20260301"))
    db.add(_row("1006", "B1", 140000, _OLD, base_month="20260201"))
    db.commit()

    nos = contaminated_complex_nos(db)
    assert nos.count("1006") == 1


# ── B1 경량 재수집 함수 ──


def _make_b1_response():
    """네이버 B1 시세 응답 (marketPrices 형식)"""
    return {
        "areaNo": 1,
        "marketPrices": [
            {
                "baseYearMonthDay": "20260301",
                "upperPriceLimit": 95000,
                "lowPriceLimit": 85000,
                "averagePriceLimit": 90000,
            },
        ],
    }


@patch("crawler.service_price._throttle")
@patch("crawler.service_price.NaverEstateAPI")
def test_recollect_b1_upserts(mock_api, mock_throttle, db):
    """B1 응답을 받아 complex_price_history에 trade_type='B1'로 저장"""
    mock_api.get_complex_prices.return_value = _make_b1_response()

    result = recollect_b1_price_for_complex(db, "2001")

    assert result["collected"] > 0
    rows = db.query(ComplexPriceHistory).filter(
        ComplexPriceHistory.complex_no == "2001"
    ).all()
    assert len(rows) > 0
    assert all(r.trade_type == "B1" for r in rows)
    assert all(r.price_avg == 90000 for r in rows)


@patch("crawler.service_price._throttle")
@patch("crawler.service_price.NaverEstateAPI")
def test_recollect_b1_skips_a1(mock_api, mock_throttle, db):
    """A1 시세·실거래가는 일절 호출하지 않음 — B1 trade_type으로만 호출"""
    mock_api.get_complex_prices.return_value = _make_b1_response()

    recollect_b1_price_for_complex(db, "2002")

    # get_complex_prices는 항상 trade_type='B1'로만 호출
    for call in mock_api.get_complex_prices.call_args_list:
        assert call.kwargs.get("trade_type") == "B1"
    # 실거래가 API는 한 번도 호출 안 함
    mock_api.get_complex_real_prices.assert_not_called()
