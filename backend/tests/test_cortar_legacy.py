"""광주·전남 레거시 cortar 번역 레이어 회귀 테스트 (세션 357).

배경: 네이버가 광주광역시·전라남도 단지에 **시도코드 12(전남광주통합특별시)** 체계의
cortar_no 를 주는데, V-WORLD 공시가격·국토교통부 실거래가 API 는 옛 체계(29/46)만 받아
12 코드로는 **조용히 0건**이 온다(라이브 실측: 1224011900→0건 / 2914011900→38,530건).

검증 축:
  1. 맵 무결성 — 키/값 형식·건수 하한·자기참조 없음·값 충돌 없음
  2. to_standard_cortar 단위 — 변환/비대상 통과/None 통과
  3. 수집기 배선 — 공시가격·실거래가 둘 다 **번역된 코드로** 외부 API 를 부르는지
     (mock 캡처. 저장·체크포인트 키는 원본 유지여야 한다)

외부 API 호출은 전부 mock — 실호출 0.
"""

from unittest.mock import patch

import pytest

from crawler.cortar_legacy import LEGACY_CORTAR_MAP, to_standard_cortar
from db.models import Complex, CrawlJob

# 실제 생성 결과는 254건. 하한을 그보다 살짝 낮게 둬서 "대량 유실"만 잡고
# 원장 갱신에 따른 ±소폭 변동은 허용한다.
_MIN_ENTRIES = 230

# 라이브로 검증한 대표 샘플 (2026-08-09 V-WORLD ldCodeNm 대조 완료)
_KNOWN = {
    "1224011900": "2914011900",  # 광주 서구 화정동
    "1230010800": "2917010800",  # 광주 북구 동림동
    "1211015800": "4611015800",  # 전남 목포시 상동
    "1286025000": "4690025000",  # 전남 진도군 진도읍
}


# ── 1. 맵 무결성 ──

def test_map_has_enough_entries():
    """대량 유실 감지 — 생성 스크립트가 빈 원장을 받아 맵을 비우는 사고 방지."""
    assert len(LEGACY_CORTAR_MAP) >= _MIN_ENTRIES


def test_all_keys_are_legacy_10digit_codes():
    """모든 키는 '12' 로 시작하는 10자리 숫자."""
    for key in LEGACY_CORTAR_MAP:
        assert len(key) == 10, f"키 길이가 10이 아니다: {key}"
        assert key.isdigit(), f"키에 숫자 아닌 문자: {key}"
        assert key.startswith("12"), f"키가 레거시 프리픽스(12)가 아니다: {key}"


def test_all_values_are_standard_10digit_codes():
    """모든 값은 10자리 숫자이며 '12' 로 시작하지 않는다(번역 안 된 값 혼입 방지)."""
    for key, value in LEGACY_CORTAR_MAP.items():
        assert len(value) == 10, f"값 길이가 10이 아니다: {key}->{value}"
        assert value.isdigit(), f"값에 숫자 아닌 문자: {key}->{value}"
        assert not value.startswith("12"), f"값이 여전히 레거시 코드다: {key}->{value}"


def test_values_are_gwangju_or_jeonnam_sido():
    """값의 시도코드는 광주(29) 또는 전남(46) 뿐 — 엉뚱한 지역으로 새지 않았는지."""
    for key, value in LEGACY_CORTAR_MAP.items():
        assert value[:2] in ("29", "46"), f"예상 밖 시도코드: {key}->{value}"


def test_no_self_mapping():
    """키와 값이 같으면 번역이 무의미 — 생성 버그 신호."""
    same = [k for k, v in LEGACY_CORTAR_MAP.items() if k == v]
    assert not same, f"자기 자신으로 매핑된 항목: {same}"


def test_no_value_collisions():
    """서로 다른 레거시 코드가 같은 표준코드로 수렴하면 오매칭 위험 — 0이어야 한다."""
    seen: dict[str, str] = {}
    collisions = []
    for key, value in LEGACY_CORTAR_MAP.items():
        if value in seen:
            collisions.append((seen[value], key, value))
        seen[value] = key
    assert not collisions, f"표준코드 충돌: {collisions}"


@pytest.mark.parametrize("legacy,standard", sorted(_KNOWN.items()))
def test_known_live_verified_pairs(legacy, standard):
    """라이브(V-WORLD ldCodeNm)로 동명까지 대조한 대표 샘플."""
    assert LEGACY_CORTAR_MAP[legacy] == standard


# ── 2. to_standard_cortar 단위 ──

def test_translates_mapped_code():
    assert to_standard_cortar("1224011900") == "2914011900"


def test_passes_through_unmapped_code():
    """전국 나머지 지역(비-12)은 손대지 않고 그대로 통과."""
    assert to_standard_cortar("1168010600") == "1168010600"
    assert to_standard_cortar("4113510300") == "4113510300"


def test_passes_through_unknown_legacy_code():
    """맵에 없는 12 코드도 원본 그대로 — 새로 깨뜨리지 않는다(기존 동작 유지)."""
    assert to_standard_cortar("1299999999") == "1299999999"


@pytest.mark.parametrize("empty", [None, ""])
def test_passes_through_empty(empty):
    """None·빈 문자열은 그대로 — 호출부가 None 체크를 이미 하고 있다."""
    assert to_standard_cortar(empty) == empty


# ── 3. 수집기 배선 ──

def test_official_price_collector_calls_vworld_with_translated_code(db, monkeypatch):
    """공시가격 수집기가 V-WORLD 를 **번역된 코드**로 부르는지 (mock 캡처).

    12 코드를 그대로 넘기면 0건이 와서 광주·전남 전역이 조용히 누락된다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="G1", complex_name="화정아파트", cortar_no="1224011900",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    from crawler.service_official_price import collect_official_prices

    with patch("crawler.vworld_price_api.fetch_official_prices", return_value=[]) as mock_fetch:
        collect_official_prices(stdr_year="2026")

    called = [c.args[0] for c in mock_fetch.call_args_list]
    assert called == ["2914011900"], f"번역 안 된 코드로 호출됨: {called}"


def test_official_price_checkpoint_keeps_original_code(db, monkeypatch):
    """체크포인트(done_ld_codes)는 **원본 12 코드**여야 재개가 호환된다.

    번역된 코드로 저장하면, 재개 시 원본 기준 목록과 대조가 어긋나 이미 끝낸 동을
    통째로 다시 돈다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="G1", complex_name="화정아파트", cortar_no="1224011900",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    from crawler.service_common import _checkpoint
    from crawler.service_official_price import collect_official_prices
    from utils import utcnow

    prev = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                    status="failed", started_at=utcnow())
    db.add(prev)
    db.commit()
    # 원본 코드로 저장된 체크포인트를 이어받으면 그 동은 다시 조회하지 않아야 한다.
    _checkpoint.save(db, prev.id, {"done_ld_codes": ["1224011900"], "total": 1})

    with patch("crawler.vworld_price_api.fetch_official_prices") as mock_fetch:
        collect_official_prices(stdr_year="2026")

    assert mock_fetch.call_count == 0, "원본 코드 체크포인트로 재개가 안 됐다"


def test_public_trade_collector_uses_translated_lawd_cd(db):
    """국토교통부 실거래가 배치가 **번역된 lawd_cd(앞 5자리)** 로 호출하는지.

    12 체계와 29 체계는 시군구 코드가 다르므로(북구 300 vs 170) 5자리만 잘라
    쓰면 안 되고, 10자리 번역 후 앞 5자리를 취해야 한다.
    """
    from datetime import date as _real_date

    db.add(Complex(complex_no="G1", complex_name="화정아파트", cortar_no="1224011900"))
    db.commit()

    class _FakeDate(_real_date):
        @classmethod
        def today(cls):
            return _real_date(2026, 3, 14)  # 토요일이지만 10일이 아니라 skip 안 걸림

    seen: list[str] = []

    def _fake_trades(lawd_cd, deal_ymd):
        seen.append(lawd_cd)
        return []

    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}), \
         patch("datetime.date", _FakeDate), \
         patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake_trades):
        from crawler.service_public import collect_public_trade_data
        collect_public_trade_data(batch_size=10, scheduler_job_id="collect_public_trades")

    assert seen, "실거래가 API 가 한 번도 호출되지 않았다"
    assert set(seen) == {"29140"}, f"번역 안 된 lawd_cd 로 호출됨: {set(seen)}"


def test_public_trade_non_legacy_region_unchanged(db):
    """비-12 지역은 기존 동작 그대로 (앞 5자리 그대로 사용)."""
    from datetime import date as _real_date

    db.add(Complex(complex_no="S1", complex_name="은마아파트", cortar_no="1168010600"))
    db.commit()

    class _FakeDate(_real_date):
        @classmethod
        def today(cls):
            return _real_date(2026, 3, 14)

    seen: list[str] = []

    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}), \
         patch("datetime.date", _FakeDate), \
         patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades",
               side_effect=lambda cd, ymd: seen.append(cd) or []):
        from crawler.service_public import collect_public_trade_data
        collect_public_trade_data(batch_size=10, scheduler_job_id="collect_public_trades")

    assert set(seen) == {"11680"}, f"비-레거시 지역이 변경됨: {set(seen)}"


def test_backfill_price_history_uses_translated_lawd_cd(db):
    """단건 소급 수집 경로도 번역된 lawd_cd 를 쓴다."""
    db.add(Complex(complex_no="G2", complex_name="동림아파트", cortar_no="1230010800"))
    db.commit()

    seen: list[str] = []

    with patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades",
               side_effect=lambda cd, ymd: seen.append(cd) or []):
        from crawler.service_public import backfill_price_history
        backfill_price_history("G2", months_back=1)

    assert seen, "실거래가 API 가 한 번도 호출되지 않았다"
    assert set(seen) == {"29170"}, f"번역 안 된 lawd_cd 로 호출됨: {set(seen)}"
