"""부동산원 지역 경로 → 우리 지역 코드 짝짓기 시험 (세션 473).

기대 코드는 data/region_codes.json(운영 complexes 2026-10-18 에서 생성)의 값이다 — 일반구(안양 만안구 41171),
전남광주 통합 체계(광주 동구 12210·목포 12110), 2026 개편 새 구(화성 동탄구 41597·인천 검단구 28290)를 포함한다.
"""

import pytest

from crawler.region_match import (
    normalize_sido,
    region_codes,
    rone_path_to_region_code,
    split_gwangju_jeonnam,
)


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("경기>경부1권>안양시>만안구", "41171"),   # 권역 조각을 버리고 "시 구" 로 찾는다
        ("충남>천안시>동남구", "44131"),
        ("강원>춘천시", "51110"),
        ("경북>포항시>남구", "47111"),            # "남구" 단독이 아니라 "포항시 남구"(대구·부산 남구와 섞이면 안 됨)
        ("전남광주>광주>동구", "12210"),          # 통합 체계 — 우리 코드 12xxx 그대로
        ("전남광주>전남>목포시", "12110"),
        ("경기>화성시>동탄구", "41597"),          # 2026-02 화성 새 구
        ("인천>검단구", "28290"),                 # 2026-07 인천 새 구
        ("서울>강북지역>종로구", "11110"),        # 권역 조각이 가운데 있어도 시군구는 찾는다
        ("전남광주>전남", "46000"),               # 시도 단위(전환율) — 시도 이름 기준 고정 코드
        ("세종", "36000"),
        ("전국", "00000"),
        ("서울>강북지역", None),                  # 권역만 = 짝 없음(시도 값으로 바꾸지 않는다)
        ("경기>경부1권>안양시", None),            # 우리 단지는 구 단위 코드뿐 — 시 단위 값은 버린다
        ("없는도>어딘가", None),
        ("", None),
        (None, None),
    ],
)
def test_rone_path_to_region_code(path, expected):
    assert rone_path_to_region_code(path) == expected


def test_same_gu_name_in_other_sido_does_not_cross():
    """"중구" 같은 흔한 이름은 시도 안에서만 찾는다 — 부산 중구 ≠ 대구 중구."""
    assert rone_path_to_region_code("부산>중구") == "26110"
    assert rone_path_to_region_code("대구>중구") == "27110"


def test_table_has_operating_codes():
    """표에 운영 단지 코드가 그대로 들어 있다(일반구·12·52 체계·새 구)."""
    t = region_codes()
    assert t["41171"] == {"sido": "경기", "sigungu": "안양시 만안구"}
    assert t["12210"] == {"sido": "광주", "sigungu": "동구"}
    assert t["12110"] == {"sido": "전남", "sigungu": "목포시"}
    assert t["52111"]["sido"] == "전북"


def test_normalize_sido_and_split():
    assert normalize_sido("충청남도") == "충남"
    assert normalize_sido("서울특별시") == "서울"
    assert normalize_sido("전북특별자치도") == "전북"
    assert normalize_sido("전남광주시") == "전남광주"
    assert normalize_sido("모르는도") is None
    assert split_gwangju_jeonnam("광산구") == "광주"
    assert split_gwangju_jeonnam("목포시") == "전남"


def test_build_region_codes_picks_most_common_names():
    """생성 스크립트 — 코드마다 가장 많은 이름, 전남광주는 구 이름으로 가르고, 갈린 이름은 경고."""
    from scripts.build_region_codes import build

    rows = [
        ("41171", "경기도", "경기도 안양시 만안구 박달동", 10),
        ("41171", "경기도", "경기도 안양시 만안구 안양동", 5),
        ("12210", "전남광주시", "전남광주시 동구 계림동", 3),
        ("12110", None, "전남광주시 목포시 광동2가", 4),
        ("99999", "경기도", "경기도 가시 갑동", 2),
        ("99999", "경기도", "경기도 나시 을동", 1),
    ]
    table, warnings = build(rows)
    assert table["41171"] == {"sido": "경기", "sigungu": "안양시 만안구"}
    assert table["12210"] == {"sido": "광주", "sigungu": "동구"}
    assert table["12110"] == {"sido": "전남", "sigungu": "목포시"}
    assert table["99999"]["sigungu"] == "가시"
    assert any(w.startswith("99999: 시군구 이름 2종") for w in warnings)


def test_zone_piece_is_dropped_before_full_name_lookup(monkeypatch):
    """같은 시도 안에 마지막 조각이 겹치면(가상 "가람시 남구") "시 구" 전체 이름으로만 가려진다 —
    권역 조각("동해안권")을 먼저 버리지 않으면 전체 이름이 "동해안권 포항시 남구" 가 돼 못 찾는다."""
    import crawler.region_match as rm

    fake = {
        "47111": {"sido": "경북", "sigungu": "포항시 남구"},
        "47991": {"sido": "경북", "sigungu": "가람시 남구"},
    }
    rm._indexes.cache_clear()
    monkeypatch.setattr(rm, "region_codes", lambda: fake)
    try:
        assert rm.rone_path_to_region_code("경북>동해안권>포항시>남구") == "47111"
        assert rm.rone_path_to_region_code("경북>남구") is None   # 마지막 조각만으론 둘 중 무엇인지 모름
    finally:
        rm._indexes.cache_clear()
