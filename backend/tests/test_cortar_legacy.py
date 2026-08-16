"""cortar 번역 레이어 회귀 테스트 (세션 357 광주·전남 / 세션 372 2026 개편).

배경 1 — 광주·전남: 네이버가 **시도코드 12(전남광주통합특별시)** 체계의 cortar_no 를
주는데, V-WORLD 공시가격·국토교통부 실거래가 API 는 옛 체계(29/46)만 받아 12 코드로는
**조용히 0건**이 온다(라이브 실측: 1224011900→0건 / 2914011900→38,530건).

배경 2 — 2026 행정구역 개편(인천 3구·화성 4구 신설): 네이버는 신 코드를 주는데
**V-WORLD 공시가격만** 아직 옛 코드에 데이터가 붙어 있다(라이브 실측:
2827510800→0행 / 2826011000→33,282행). 반면 **국토부 실거래가는 정반대**로 신 코드가
정상이고 옛 코드가 0건이다(28275→267건 / 28260→0건). 그래서 개편맵은 공시가격 전용
(`to_vworld_cortar`)이며, 실거래가가 쓰는 `to_standard_cortar` 에는 **들어가면 안 된다** —
들어가면 지금 잘 되는 실거래가 수집이 죽는다. 아래 테스트가 그 경계를 지킨다.

검증 축:
  1. 맵 무결성 — 키/값 형식·건수 하한·자기참조 없음·값 충돌(레거시 맵만)
  2. to_standard_cortar / to_vworld_cortar 단위 — 변환/비대상 통과/None 통과
  3. **경계 가드** — 개편 코드가 to_standard_cortar 로는 번역되지 않을 것
  4. 수집기 배선 — 공시가격·실거래가가 각자 맞는 코드로 외부 API 를 부르는지
     (mock 캡처. 저장·체크포인트 키는 원본 유지여야 한다)

외부 API 호출은 전부 mock — 실호출 0.
"""

from unittest.mock import patch

import pytest

from crawler.cortar_legacy import (
    LEGACY_CORTAR_MAP,
    VWORLD_REFORM_CORTAR_MAP,
    to_standard_cortar,
    to_vworld_cortar,
)
from db.models import Complex, CrawlJob

# 실제 생성 결과는 254건. 하한을 그보다 살짝 낮게 둬서 "대량 유실"만 잡고
# 원장 갱신에 따른 ±소폭 변동은 허용한다.
_MIN_ENTRIES = 230

# 개편맵 실제 생성 결과는 85건(88개 동 중 3건은 모호·신설로 제외). 같은 취지의 하한.
# 생성 스크립트의 MIN_REFORM_ENTRIES 게이트와 같은 값 — 한쪽만 통과하는 일이 없게.
_MIN_REFORM_ENTRIES = 75

# 라이브로 검증한 대표 샘플 (2026-08-09 V-WORLD ldCodeNm 대조 완료)
_KNOWN = {
    "1224011900": "2914011900",  # 광주 서구 화정동
    "1230010800": "2917010800",  # 광주 북구 동림동
    "1211015800": "4611015800",  # 전남 목포시 상동
    "1286025000": "4690025000",  # 전남 진도군 진도읍
}

# 개편맵 라이브 검증 샘플 (2026-08-16 V-WORLD ldCodeNm 대조 완료 — 전부 동명 100% 일치)
_KNOWN_REFORM = {
    "2827510800": "2826011000",  # 인천 서해구 석남동 ← 옛 서구 (33,282행)
    "2827511100": "2826012200",  # 인천 서해구 청라동 ← 옛 서구 (61,994행)
    "2829010300": "2826011300",  # 인천 검단구 마전동 ← 옛 서구 (33,644행)
    "2815510300": "2811014700",  # 인천 영종구 운서동 ← 옛 중구 (20,930행)
    "2812510700": "2814010700",  # 인천 제물포구 송림동 ← 옛 동구 (17,638행)
    "4159710200": "4159012700",  # 화성 동탄구 반송동 ← 옛 화성시 (39,546행)
    # 폐지 필터가 구제한 사례 — 옛 계양구 오류동(2824511800)은 **현존**이라 남의 동이다.
    # 필터 없이는 "모호"로 버려졌고, 잘못 고르면 계양구 공시가격을 긁을 뻔했다.
    "2829010800": "2826011900",  # 인천 검단구 오류동 ← 옛 서구 (3,280행)
}

# 개편맵에서 **의도적으로 제외**한 동 — 모호(폐지 원장에 동명이 2개)하거나 개편 후
# 신설이라 옛 코드가 없다. 맵에 들어오면 오매칭이므로 부재를 못박아 둔다.
_REFORM_EXCLUDED = [
    "2812510600",  # 제물포구 금곡동 — 옛 동구/서구 **둘 다 폐지**라 못 고른다
    "2829010700",  # 검단구 금곡동 — 위와 동일
    "4159711500",  # 동탄구 여울동 — 개편 후 신설 동(옛 코드 없음)
]


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


# ── 4. 2026 행정구역 개편 맵 (V-WORLD 전용) ──

def test_reform_map_has_enough_entries():
    """대량 유실 감지 — 생성 스크립트가 빈 원장을 받아 맵을 비우는 사고 방지."""
    assert len(VWORLD_REFORM_CORTAR_MAP) >= _MIN_REFORM_ENTRIES


def test_reform_keys_and_values_are_10digit():
    """키·값 모두 10자리 숫자이며 서로 달라야 한다(자기참조 = 생성 버그)."""
    for key, value in VWORLD_REFORM_CORTAR_MAP.items():
        assert len(key) == 10 and key.isdigit(), f"키 형식 위반: {key}"
        assert len(value) == 10 and value.isdigit(), f"값 형식 위반: {key}->{value}"
        assert key != value, f"자기 자신으로 매핑: {key}"


def test_reform_keys_are_known_new_sigungu():
    """키의 앞 5자리는 2026 개편으로 신설된 8개 시군구뿐 — 엉뚱한 지역 혼입 방지."""
    allowed = {"28125", "28155", "28275", "28290", "41591", "41593", "41595", "41597"}
    for key in VWORLD_REFORM_CORTAR_MAP:
        assert key[:5] in allowed, f"예상 밖 시군구: {key}"


def test_reform_values_keep_sido():
    """개편은 시도 안에서 일어났으므로 시도코드(앞 2자리)는 보존돼야 한다."""
    for key, value in VWORLD_REFORM_CORTAR_MAP.items():
        assert key[:2] == value[:2], f"시도가 바뀌었다: {key}->{value}"


@pytest.mark.parametrize("new_code,old_code", sorted(_KNOWN_REFORM.items()))
def test_known_reform_pairs_live_verified(new_code, old_code):
    """라이브(V-WORLD ldCodeNm)로 동명까지 대조한 대표 샘플."""
    assert VWORLD_REFORM_CORTAR_MAP[new_code] == old_code


@pytest.mark.parametrize("excluded", _REFORM_EXCLUDED)
def test_ambiguous_reform_dong_excluded(excluded):
    """모호·신설 동은 맵에 없어야 한다 — 들어오면 오매칭(틀린 값 < 값 없음)."""
    assert excluded not in VWORLD_REFORM_CORTAR_MAP


def test_reform_value_duplication_is_allowed_and_expected():
    """값 중복(N→1)은 **정상**이다 — 옛 동 하나가 두 신 구로 쪼개진 실사례.

    옛 화성시 능동(4159011800)이 병점구 능동·동탄구 능동 양쪽의 모체다. 둘 다 같은
    옛 코드를 조회해야 공시가격을 받는다. 레거시 맵과 달리 여기선 충돌 금지 가드를
    걸면 안 되므로, 그 사실 자체를 테스트로 못박아 둔다.
    """
    assert VWORLD_REFORM_CORTAR_MAP.get("4159510300") == "4159011800"
    assert VWORLD_REFORM_CORTAR_MAP.get("4159710100") == "4159011800"


# ── 5. 경계 가드 — 개편맵이 실거래가 경로로 새면 안 된다 ──

@pytest.mark.parametrize("new_code", sorted(_KNOWN_REFORM))
def test_reform_codes_not_in_legacy_map(new_code):
    """개편 코드가 LEGACY_CORTAR_MAP 에 들어가면 실거래가까지 번역돼 죽는다.

    국토부는 개편을 이미 반영해 **신 코드가 정상·옛 코드가 0건**이다(라이브 실측
    28275→267건 / 28260→0건). 두 맵이 합쳐지는 순간 지금 잘 되는 수집이 조용히
    멈추므로, 분리 상태를 기계적으로 못박는다.
    """
    assert new_code not in LEGACY_CORTAR_MAP
    assert to_standard_cortar(new_code) == new_code


def test_two_maps_have_no_overlapping_keys():
    """두 맵의 키 집합은 서로 겹치지 않는다(대상 지역이 다르므로)."""
    overlap = set(LEGACY_CORTAR_MAP) & set(VWORLD_REFORM_CORTAR_MAP)
    assert not overlap, f"두 맵에 같은 키가 있다: {sorted(overlap)[:5]}"


def test_no_chained_double_translation():
    """레거시 맵의 **출력**이 개편맵의 **입력**이 되면 안 된다(이중 번역 차단).

    `to_vworld_cortar` 는 두 맵을 순서대로 적용하므로, 레거시가 내놓은 29/46 코드가
    개편맵 키에 있으면 12 코드가 한 번 더 번역돼 엉뚱한 동을 조회하게 된다. 지금은
    대상 지역이 안 겹쳐 공집합이지만, 미래 재생성이 이 조건을 조용히 깨뜨릴 수 있어
    기계적으로 못박는다.
    """
    chained = set(LEGACY_CORTAR_MAP.values()) & set(VWORLD_REFORM_CORTAR_MAP)
    assert not chained, f"레거시 출력이 개편맵 키와 겹친다(이중 번역): {sorted(chained)[:5]}"


# ── 6. to_vworld_cortar 단위 ──

def test_vworld_translates_reform_code():
    """개편 신코드 → 옛 코드 (공시가격 경로 전용)."""
    assert to_vworld_cortar("2827510800") == "2826011000"


def test_vworld_also_translates_legacy_gwangju():
    """공시가격 경로는 광주·전남 12-프리픽스도 그대로 번역한다(두 단계 합성)."""
    assert to_vworld_cortar("1224011900") == "2914011900"


def test_vworld_passes_through_unmapped():
    """전국 나머지 지역·맵에 없는 개편 동은 원본 그대로(기존 동작 유지)."""
    assert to_vworld_cortar("1168010600") == "1168010600"
    assert to_vworld_cortar("4159711500") == "4159711500"  # 여울동(신설, 옛 코드 없음)


@pytest.mark.parametrize("empty", [None, ""])
def test_vworld_passes_through_empty(empty):
    assert to_vworld_cortar(empty) == empty


# ── 7. 공시가격 수집기가 개편 코드를 번역해 부르는지 ──

def test_official_price_collector_translates_reform_code(db, monkeypatch):
    """공시가격 수집기가 개편 신코드를 **옛 코드로** 바꿔 V-WORLD 를 부르는지.

    신 코드를 그대로 넘기면 0행이 와서 인천·화성 신설구 전역이 조용히 누락된다
    (라이브 실측: 2827510800→0행 / 2826011000→33,282행).
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="R1", complex_name="석남아파트", cortar_no="2827510800",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    from crawler.service_official_price import collect_official_prices

    with patch("crawler.vworld_price_api.fetch_official_prices", return_value=[]) as mock_fetch:
        collect_official_prices(stdr_year="2026")

    called = [c.args[0] for c in mock_fetch.call_args_list]
    assert called == ["2826011000"], f"번역 안 된 코드로 호출됨: {called}"


def test_official_price_checkpoint_keeps_original_reform_code(db, monkeypatch):
    """개편 코드도 체크포인트(done_ld_codes)는 **원본 신 코드**여야 재개가 호환된다.

    광주판(test_official_price_checkpoint_keeps_original_code)과 같은 취지지만, 개편맵은
    값 중복(N→1)이 정상이라 사정이 다르다 — 옛 화성시 능동 하나를 병점구·동탄구 두
    신 코드가 공유해서 같은 동을 두 번 fetch 한다. 이걸 없애려고 미래에 "번역된 코드
    기준으로 dedupe" 같은 최적화를 넣으면 체크포인트 키가 번역 코드로 바뀌기 쉬운데,
    그러면 원본 키로 저장된 기존 체크포인트와 어긋나 이미 끝낸 동을 통째로 다시 돈다.
    광주 테스트는 값 중복이 없어 이 실수를 못 잡으므로 개편판을 따로 둔다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="R3", complex_name="석남아파트", cortar_no="2827510800",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    from crawler.service_common import _checkpoint
    from crawler.service_official_price import collect_official_prices
    from utils import utcnow

    prev = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                    status="failed", started_at=utcnow())
    db.add(prev)
    db.commit()
    # 원본(신) 코드로 저장된 체크포인트를 이어받으면 그 동은 다시 조회하지 않아야 한다.
    _checkpoint.save(db, prev.id, {"done_ld_codes": ["2827510800"], "total": 1})

    with patch("crawler.vworld_price_api.fetch_official_prices") as mock_fetch:
        collect_official_prices(stdr_year="2026")

    assert mock_fetch.call_count == 0, "원본(신) 코드 체크포인트로 재개가 안 됐다"


def test_public_trade_keeps_reform_code_untranslated(db):
    """실거래가는 개편 신코드를 **그대로** 써야 한다 — 번역하면 0건이 온다.

    국토부는 개편을 이미 반영했다(라이브 실측 28275→267건 / 옛 28260→0건).
    공시가격과 정반대 방향이라, 두 경로가 같은 맵을 쓰면 한쪽이 반드시 깨진다.
    """
    from datetime import date as _real_date

    db.add(Complex(complex_no="R2", complex_name="석남아파트", cortar_no="2827510800"))
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

    assert set(seen) == {"28275"}, f"개편 코드가 번역돼 버렸다: {set(seen)}"
