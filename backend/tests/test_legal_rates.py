"""법정 비율 상수 시험 (세션 473) — 기준금리 손 상수와 전월세 전환율 상한."""

from config import legal_rates


def test_current_values():
    assert legal_rates.BOK_BASE_RATE == 3.00
    assert legal_rates.BOK_BASE_RATE_DATE == "2026-08-27"
    assert legal_rates.legal_rent_conversion_cap() == 5.0


def test_cap_is_lower_of_two(monkeypatch):
    """시행령 §9 — 기준금리 + 2%p 와 연 10% 중 낮은 쪽."""
    monkeypatch.setattr(legal_rates, "BOK_BASE_RATE", 9.5)
    assert legal_rates.legal_rent_conversion_cap() == 10.0
    monkeypatch.setattr(legal_rates, "BOK_BASE_RATE", 2.75)
    assert legal_rates.legal_rent_conversion_cap() == 4.75
