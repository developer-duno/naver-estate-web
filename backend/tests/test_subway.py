"""가까운 지하철 API + CSV 파서 테스트

실행: python -m pytest tests/test_subway.py -v

거리 기대값은 강남역(37.4979, 127.0276) 기준 좌표를 직접 만들어 검증한다 —
위도 1도 ≈ 111km 이므로 0.001도 ≈ 111m 로 계산해 반경 경계를 넘나드는 좌표를 배치.
"""

import pytest

from db.models import Complex, SubwayStation
from routers.complexes import _subway_cache
from scripts.import_subway_stations import parse_row


@pytest.fixture(autouse=True)
def _clear_subway_cache():
    """모듈 전역 TTLCache 를 테스트마다 비운다.

    conftest 의 autouse setup_db 는 services.cache 레지스트리(get_cache 로 만든 것)만
    비우는데, 이 캐시는 official-prices·price-history 와 같이 모듈 전역
    TTLCache(...) 라 레지스트리에 없다 → 테이블을 drop 해도 이전 테스트의 응답이
    같은 complex_no 로 그대로 반환된다.
    (운영에선 역사 데이터가 연 1회 갱신이라 무효화 대상이 아니므로 의도된 구조.)
    """
    _subway_cache._store.clear()
    yield
    _subway_cache._store.clear()


# 단지 기준 좌표 (강남역 근방)
BASE_LAT = 37.4979
BASE_LNG = 127.0276


def _add_complex(db, no="C001", lat=BASE_LAT, lng=BASE_LNG):
    cpx = Complex(
        complex_no=no,
        complex_name="래미안",
        sido="서울",
        sigungu="강남구",
        latitude=lat,
        longitude=lng,
    )
    db.add(cpx)
    db.commit()
    return cpx


def _add_station(db, name, line, lat, lng, number=None):
    station = SubwayStation(
        station_number=number,
        station_name=name,
        line_number=None,
        line_name=line,
        operator="테스트운영사",
        latitude=lat,
        longitude=lng,
    )
    db.add(station)
    db.commit()
    return station


def test_nearest_sorted_and_capped_at_three(client, db):
    """거리 오름차순 정렬 + 최대 3개만 반환 (4개를 넣어도 가까운 3개)"""
    _add_complex(db)
    # 위도 차이만 두어 거리를 단조 증가시킨다 (약 111m, 222m, 333m, 444m)
    _add_station(db, "가까운", "1호선", BASE_LAT + 0.001, BASE_LNG)
    _add_station(db, "두번째", "2호선", BASE_LAT + 0.002, BASE_LNG)
    _add_station(db, "세번째", "3호선", BASE_LAT + 0.003, BASE_LNG)
    _add_station(db, "네번째", "4호선", BASE_LAT + 0.004, BASE_LNG)

    res = client.get("/api/complexes/C001/subway")
    assert res.status_code == 200
    stations = res.json()["stations"]

    assert [s["station_name"] for s in stations] == ["가까운", "두번째", "세번째"]
    # 거리는 오름차순이고 미터 단위 정수
    distances = [s["distance_m"] for s in stations]
    assert distances == sorted(distances)
    assert all(isinstance(d, int) for d in distances)
    # 0.001도 ≈ 111m — 대략 그 부근인지 (haversine 정확도 여유 ±15m)
    assert 95 <= distances[0] <= 130


def test_excludes_stations_beyond_3km(client, db):
    """반경 3km 밖 역은 제외 (경계 안쪽만 남는다)"""
    _add_complex(db)
    # 0.02도 ≈ 2.2km (반경 안), 0.05도 ≈ 5.5km (반경 밖)
    _add_station(db, "반경안", "1호선", BASE_LAT + 0.02, BASE_LNG)
    _add_station(db, "반경밖", "9호선", BASE_LAT + 0.05, BASE_LNG)

    res = client.get("/api/complexes/C001/subway")
    assert res.status_code == 200
    stations = res.json()["stations"]

    assert [s["station_name"] for s in stations] == ["반경안"]
    assert stations[0]["distance_m"] < 3000


def test_transfer_station_grouped_by_name(client, db):
    """환승역: 같은 역명 2행 → 1항목, lines 2개, 거리는 더 가까운 쪽"""
    _add_complex(db)
    # 같은 역명이 노선별 별도 행 (원본 구조). 좌표가 미세하게 다르다.
    _add_station(db, "강남", "2호선", BASE_LAT + 0.003, BASE_LNG)
    _add_station(db, "강남", "신분당선", BASE_LAT + 0.001, BASE_LNG)

    res = client.get("/api/complexes/C001/subway")
    assert res.status_code == 200
    stations = res.json()["stations"]

    assert len(stations) == 1, "같은 역명은 하나로 묶여야 한다"
    assert stations[0]["station_name"] == "강남"
    assert stations[0]["lines"] == ["2호선", "신분당선"], "노선명은 중복 제거 후 정렬"
    # 더 가까운 신분당선 행(0.001도 ≈ 111m) 기준이어야 한다
    assert 95 <= stations[0]["distance_m"] <= 130


def test_groups_station_name_with_and_without_suffix(client, db):
    """"선릉"(2호선) + "선릉역"(분당선) → 1항목 (라이브 결함 회귀)

    원본 CSV 가 같은 물리 역을 노선에 따라 접미사 유무 다르게 실어서, 역삼IPARK
    (17805) 응답이 "선릉" 527m 와 "선릉역" 567m 로 두 슬롯을 차지했었다.
    """
    _add_complex(db)
    _add_station(db, "선릉역", "분당선", BASE_LAT + 0.002, BASE_LNG)
    _add_station(db, "선릉", "2호선", BASE_LAT + 0.001, BASE_LNG)

    res = client.get("/api/complexes/C001/subway")
    assert res.status_code == 200
    stations = res.json()["stations"]

    assert len(stations) == 1, "접미사만 다른 같은 역은 하나로 묶여야 한다"
    assert stations[0]["station_name"] == "선릉", "응답은 접미사 없는 정규형"
    assert stations[0]["lines"] == ["2호선", "분당선"]
    # 더 가까운 "선릉"(2호선, 0.001도 ≈ 111m) 기준
    assert 95 <= stations[0]["distance_m"] <= 130


def test_suffix_grouping_frees_slot_for_next_station(client, db):
    """접미사 통합으로 빈 슬롯에 다음 역이 올라온다 (최대 3개 유지)"""
    _add_complex(db)
    _add_station(db, "선릉", "2호선", BASE_LAT + 0.001, BASE_LNG)
    _add_station(db, "선릉역", "분당선", BASE_LAT + 0.002, BASE_LNG)
    _add_station(db, "한티역", "분당선", BASE_LAT + 0.003, BASE_LNG)
    _add_station(db, "역삼", "2호선", BASE_LAT + 0.004, BASE_LNG)

    res = client.get("/api/complexes/C001/subway")
    assert res.status_code == 200
    stations = res.json()["stations"]

    # 묶기 전이라면 선릉/선릉역/한티 3칸이 찼겠지만, 통합 후 역삼까지 올라온다
    assert [s["station_name"] for s in stations] == ["선릉", "한티", "역삼"]


def test_single_character_name_keeps_suffix(client, db):
    """정규화 결과가 한 글자 이하면 원본 유지 — "역" 단독명 방어"""
    _add_complex(db, no="C004")
    _add_station(db, "역", "1호선", BASE_LAT + 0.001, BASE_LNG)

    res = client.get("/api/complexes/C004/subway")
    assert res.status_code == 200
    stations = res.json()["stations"]

    assert [s["station_name"] for s in stations] == ["역"]


def test_transfer_grouping_ignores_lines_outside_radius(client, db):
    """환승역이라도 반경 밖 노선 행은 lines 에 섞이지 않는다"""
    _add_complex(db)
    _add_station(db, "강남", "2호선", BASE_LAT + 0.001, BASE_LNG)
    _add_station(db, "강남", "먼노선", BASE_LAT + 0.05, BASE_LNG)  # 약 5.5km

    res = client.get("/api/complexes/C001/subway")
    assert res.status_code == 200
    stations = res.json()["stations"]

    assert len(stations) == 1
    assert stations[0]["lines"] == ["2호선"]


def test_complex_without_coordinates_returns_empty(client, db):
    """단지 좌표가 NULL 이면 200 + 빈 배열 (에러 아님)"""
    _add_complex(db, no="C002", lat=None, lng=None)
    _add_station(db, "강남", "2호선", BASE_LAT, BASE_LNG)

    res = client.get("/api/complexes/C002/subway")
    assert res.status_code == 200
    assert res.json() == {"stations": []}


def test_no_station_in_radius_returns_empty(client, db):
    """반경 안에 역이 하나도 없으면 200 + 빈 배열"""
    _add_complex(db, no="C003")
    _add_station(db, "먼곳", "1호선", BASE_LAT + 0.5, BASE_LNG)  # 약 55km

    res = client.get("/api/complexes/C003/subway")
    assert res.status_code == 200
    assert res.json() == {"stations": []}


def test_unknown_complex_404(client):
    """존재하지 않는 단지 → 404"""
    res = client.get("/api/complexes/NOEXIST/subway")
    assert res.status_code == 404


# ── CSV 파서 (순수 함수) ──


def test_parse_row_normalizes_whitespace_and_date():
    """공백 축약 + YYYYMMDD 날짜 파싱 (원본의 실제 이상값 패턴)"""
    parsed = parse_row(
        {
            "station_number": " 0222 ",
            "station_name": " 강남 ",
            "line_number": "S1102",
            # 원본에 실제로 공백이 둘 박힌 값이 있다
            "line_name": "수도권  도시철도 9호선",
            "operator": "서울교통공사",
            "latitude": "37.497175",
            "longitude": "127.027926",
            "data_date": "20240812",
        }
    )
    assert parsed["station_number"] == "0222"
    assert parsed["station_name"] == "강남"
    assert parsed["line_name"] == "수도권 도시철도 9호선", "연속 공백은 1칸으로"
    assert parsed["latitude"] == 37.497175
    assert parsed["data_date"].isoformat() == "2024-08-12"


def test_parse_row_invalid_date_becomes_none():
    """파싱 불가 날짜(1900-01-00·빈칸)는 None — 적재를 막지 않는다"""
    base = {
        "station_name": "삼전",
        "line_name": "9호선",
        "latitude": "37.504531",
        "longitude": "127.087211",
    }
    assert parse_row({**base, "data_date": "1900-01-00"})["data_date"] is None
    assert parse_row({**base, "data_date": ""})["data_date"] is None


def test_parse_row_skips_rows_missing_required_fields():
    """역명·노선명·좌표가 없으면 None (적재 스킵)"""
    valid = {
        "station_name": "강남",
        "line_name": "2호선",
        "latitude": "37.497175",
        "longitude": "127.027926",
        "data_date": "2026-06-18",
    }
    assert parse_row(valid) is not None
    assert parse_row({**valid, "station_name": "  "}) is None
    assert parse_row({**valid, "line_name": ""}) is None
    assert parse_row({**valid, "latitude": ""}) is None
