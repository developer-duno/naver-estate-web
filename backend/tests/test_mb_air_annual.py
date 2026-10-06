"""대기질 3년 평균(air_station_annual) — 등급 구간·직렬화·상세 엔드포인트 2곳 (세션604)

실시간 에어코리아 수집을 폐지하고, 미분양 소유 표의 측정소별 3년 평균을
`infra.air_annual` 로 붙인다. 등급 구간은 미분양 채점표(PM2.5 15/19, `<=`)와 같아야 한다.
실행: python -m pytest tests/test_mb_air_annual.py -v
"""

from datetime import datetime
from types import SimpleNamespace

import pytest

from db.mb_models import AirStationAnnual, Apartment, Infra
from routers.mb_air_annual import (
    air_annual_band,
    air_annual_legend,
    air_annual_to_dict,
)
from routers.mb_serializers import infra_to_dict

# ── 팩토리 함수 ──────────────────────────────────────────────


def _add_apartment(db, id_="APT-AIR", **kw):
    defaults = dict(id=id_, name="대기질시험아파트", region="서울", gu="강남", dong="역삼동")
    defaults.update(kw)
    db.add(Apartment(**defaults))
    db.commit()


def _add_infra(db, apartment_id="APT-AIR", station="강남대로", **kw):
    defaults = dict(apartment_id=apartment_id, air_station_name=station, air_station_dist=850.0)
    defaults.update(kw)
    db.add(Infra(**defaults))
    db.commit()


def _add_annual(db, station="강남대로", pm25=17.3, **kw):
    defaults = dict(
        station_name=station,
        station_code="111123",
        pm25=pm25,
        pm10=33.1,
        o3=0.031,
        years="2022,2023,2024",
        sample_hours=26000,
        address="서울 강남구",
        updated_at=datetime(2026, 9, 22, 3, 0, 0),
    )
    defaults.update(kw)
    db.add(AirStationAnnual(**defaults))
    db.commit()


def _annual_row(**kw):
    """DB 없이 직렬화만 볼 때 쓰는 가짜 행"""
    defaults = dict(
        pm25=17.3, pm10=33.1, o3=0.031, years="2022,2023,2024",
        updated_at=datetime(2026, 9, 22, 3, 0, 0),
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


# ── (a) 등급 구간 — 경계값은 아래 칸(`<=`) ─────────────────────


@pytest.mark.parametrize(
    "pm25,expected",
    [(15.0, "좋음"), (15.01, "보통"), (19.0, "보통"), (19.01, "나쁨"), (None, None)],
)
def test_band_boundaries(pm25, expected):
    """PM2.5 경계 15·19 는 각각 좋음·보통 쪽에 속하고, 값이 없으면 등급을 지어내지 않는다"""
    assert air_annual_band(pm25) == expected


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -1.0, "abc"])
def test_band_invalid_value_is_none(bad):
    """숫자가 아니거나 음수·무한대면 None (오류 케이스)"""
    assert air_annual_band(bad) is None


def test_legend_is_built_from_cuts():
    """설명 문구는 경계에서 만든다 — 미분양 buildAnnualLegend 와 같은 글자"""
    assert air_annual_legend() == "좋음 15 이하, 보통 19 이하, 나쁨 19 초과"


# ── (b) 직렬화 ───────────────────────────────────────────────


def test_to_dict_normal():
    """정상 행 → pm25·pm10·o3·years·band·legend·updated_at(iso)"""
    d = air_annual_to_dict(_annual_row())
    assert d == {
        "pm25": 17.3,
        "pm10": 33.1,
        "o3": 0.031,
        "years": "2022,2023,2024",
        "band": "보통",
        "legend": "좋음 15 이하, 보통 19 이하, 나쁨 19 초과",
        "updated_at": "2026-09-22T03:00:00",
    }


def test_to_dict_missing_values():
    """pm25·갱신 시각이 비면 band·updated_at 도 None (오류 케이스)"""
    d = air_annual_to_dict(_annual_row(pm25=None, updated_at=None))
    assert d["band"] is None
    assert d["updated_at"] is None


# ── (c) 상세 엔드포인트 2곳 ──────────────────────────────────

DETAIL_PATHS = ["/api/mb/apartments/APT-AIR", "/api/mb/presale/APT-AIR"]


@pytest.mark.parametrize("path", DETAIL_PATHS)
def test_detail_has_air_annual_when_station_in_table(client, db, path):
    """측정소가 표에 있으면 infra.air_annual 에 3년 평균 등급이 온다"""
    _add_apartment(db)
    _add_infra(db, station="강남대로")
    _add_annual(db, station="강남대로", pm25=14.2)
    res = client.get(path)
    assert res.status_code == 200
    air = res.json()["infra"]["air_annual"]
    assert air["band"] == "좋음"
    assert air["pm25"] == 14.2
    assert air["years"] == "2022,2023,2024"


@pytest.mark.parametrize("path", DETAIL_PATHS)
def test_detail_air_annual_null_when_station_not_in_table(client, db, path):
    """infra 의 측정소가 표에 없으면 air_annual 은 null (오류 케이스)"""
    _add_apartment(db)
    _add_infra(db, station="없는측정소")
    _add_annual(db, station="강남대로")
    res = client.get(path)
    assert res.status_code == 200
    assert res.json()["infra"]["air_annual"] is None


@pytest.mark.parametrize("path", DETAIL_PATHS)
def test_detail_air_annual_null_when_no_station(client, db, path):
    """infra 에 측정소 이름이 없으면 air_annual 은 null (오류 케이스)"""
    _add_apartment(db)
    _add_infra(db, station=None, air_station_dist=None)
    _add_annual(db, station="강남대로")
    res = client.get(path)
    assert res.status_code == 200
    assert res.json()["infra"]["air_annual"] is None


# ── (d) 실시간 칸은 응답에서 빠졌다 ────────────────────────────


def test_infra_to_dict_drops_realtime_air_keys():
    """infra_to_dict 에 실시간 air_grade 등 6키가 없고, 측정소 이름·거리는 남는다"""
    d = infra_to_dict(Infra(apartment_id="X", air_station_name="강남대로", air_station_dist=850.0, air_grade="보통"))
    for k in ("air_pm10", "air_pm25", "air_o3", "air_grade", "air_updated_at", "air_attempted_at"):
        assert k not in d
    assert d["air_station_name"] == "강남대로"
    assert d["air_station_dist"] == 850.0
