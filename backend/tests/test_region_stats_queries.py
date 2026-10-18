"""동네 공식 통계 조회 시험 (세션 473) — 최신 달 한 행 · 지역 코드 · 시도 코드(이름 기준) · 세종 대체."""

from types import SimpleNamespace

from db.models import RegionStats
from db.region_stats_queries import (
    format_period,
    get_latest_region_stat,
    get_latest_sigungu_stat,
    region_code_of_complex,
    region_display_name,
    sido_code,
)

J = "reb_apt_jeonse_ratio_median"


def _add(db, code, period, value, stat=J):
    db.add(RegionStats(region_code=code, period=period, stat_code=stat, value=value, source="시험"))
    db.commit()


def test_latest_period_wins(db):
    _add(db, "44131", "202512", 78.0)
    _add(db, "44131", "202601", 79.41)
    _add(db, "44131", "202602", None)                 # 값 없는 달은 건너뛴다
    _add(db, "44131", "202603", 50.0, stat="other")   # 다른 통계는 안 섞인다
    assert get_latest_region_stat(db, "44131", J) == (79.41, "202601")
    assert get_latest_region_stat(db, "41171", J) is None
    assert get_latest_region_stat(db, None, J) is None


def test_sejong_uses_sido_row(db):
    _add(db, "36000", "202601", 70.0)
    assert get_latest_sigungu_stat(db, "36110", J) == (70.0, "202601")
    assert get_latest_sigungu_stat(db, "44131", J) is None   # 다른 곳은 시도 값으로 대신하지 않는다


def test_codes_and_names():
    assert region_code_of_complex(SimpleNamespace(cortar_no="4413110100")) == "44131"
    assert region_code_of_complex(SimpleNamespace(cortar_no=None)) is None
    assert region_code_of_complex(SimpleNamespace(cortar_no="12")) is None
    assert sido_code("12210") == "29000"   # 전남광주 체계 광주 동구 → 광주(이름 기준)
    assert sido_code("12110") == "46000"   # 목포 → 전남
    assert sido_code("41171") == "41000"
    assert sido_code("47999") == "47000"   # 표에 없는 새 코드 = 앞 2자리
    assert sido_code("12999") is None      # 12 는 전남·광주를 못 가른다
    assert region_display_name("44131") == "천안시 동남구"
    assert region_display_name("36110") == "세종시"
    assert format_period("202601") == "2026.01"
    assert format_period("2026") is None


def test_missing_table_returns_none_and_warns_once(db, caplog, monkeypatch):
    """F2: 표가 없으면(V072 미적용) None + 경고는 프로세스당 한 번 · 같은 세션으로 다음 조회도 된다."""
    import logging

    from sqlalchemy import text

    import db.region_stats_queries as q

    monkeypatch.setattr(q, "_warned", False)
    db.execute(text("DROP TABLE region_stats"))
    db.commit()
    with caplog.at_level(logging.WARNING, logger="db.region_stats_queries"):
        assert get_latest_region_stat(db, "44131", J) is None
        assert get_latest_region_stat(db, "44131", J) is None
    assert sum("동네 공식 통계 표를 읽지 못해" in r.getMessage() for r in caplog.records) == 1
    assert db.execute(text("SELECT 1")).scalar() == 1   # 바깥 트랜잭션은 살아 있다
