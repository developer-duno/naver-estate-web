"""V-WORLD 표준코드 이관 감시(heartbeat) 회귀 테스트 (세션 375·391).

배경: cortar_legacy 의 두 번역맵 — 2026 행정구역 개편맵(VWORLD_REFORM_CORTAR_MAP) ·
광주·전남 12-프리픽스맵(LEGACY_CORTAR_MAP) — 대상 지역은 조회 전에 코드를 V-WORLD 가
실제로 쓰는 쪽으로 번역한다. V-WORLD 가 그 데이터를 맵의 **키**(표준·신 코드) 쪽으로
이관하면 그 번역이 오히려 **빈 코드 조회**가 되어 조용히 0건이 된다. 수집 시작 시
보초 코드(맵의 키)를 1페이지만 찔러 행수>0 이면 텔레그램 경보를 띄운다.

검증 축:
  0. 보초가 두 번역맵의 **키**인지 (방향 가드, 세션 391)
  1. probe_official_price_total — 1페이지만 조회해 총 행수 반환 / 실패는 None
  2. 보초 1곳이라도 행수>0 → 경보 1회 + 메시지에 보초 라벨·행수 포함
  3. 전 보초 0건·조회실패 → 경보 0회 (아직 이관 전 = 정상)
  4. 프로브 내부 예외 → 밖으로 전파 0 + 경보 0회 (감시가 수집을 죽이면 안 된다)
  5. collect_official_prices 가 계산된 year 로 감시를 호출한다

⚠ 텔레그램 실발송 방지 — conftest 가 TELEGRAM_ENABLED=false 전역 가드를 깔지만, 여기서는
_alert_official_price 자체를 목킹해 호출 여부만 단언한다(세션 325 실알림 폭탄 사고 답습).
API 호출도 전부 mock — 실호출 0.
"""

from unittest.mock import patch

import pytest

from crawler.cortar_legacy import LEGACY_CORTAR_MAP, VWORLD_REFORM_CORTAR_MAP
from crawler.service_official_price import (
    _MIGRATION_SENTINELS,
    _probe_reform_migration,
    collect_official_prices,
)
from crawler.vworld_price_api import probe_official_price_total

_YEAR = "2026"


# ── 0. 보초 방향 가드 (세션 391) ──

def test_sentinels_are_translation_map_keys_not_values():
    """보초는 번역맵의 **키** 쪽이어야 한다 — 값(표준측)을 넣으면 상시 오탐.

    감시 논리 = "우리가 조회 전에 다른 코드로 바꿔치는 쪽(맵의 키)에 데이터가 생겼으면
    이관 시작". 방향을 뒤집어 맵의 값(V-WORLD 가 지금 실제로 쓰는 표준·옛 코드)을 보초로
    넣으면 지금도 수만 행이 있어 **매 실행 경보**가 나간다(예: 화정동 표준측 2914011900
    = 38,530행). 사람 눈으로는 두 코드가 비슷해 보여 실수하기 쉬우니 기계로 막는다.

    두 맵을 합집합으로 보는 이유 = 보초가 2026 개편맵(VWORLD_REFORM_CORTAR_MAP)과
    광주·전남 12-프리픽스맵(LEGACY_CORTAR_MAP) 양쪽에서 나오기 때문.
    """
    valid_keys = set(VWORLD_REFORM_CORTAR_MAP) | set(LEGACY_CORTAR_MAP)
    invalid = {
        code: label
        for code, label in _MIGRATION_SENTINELS.items()
        if code not in valid_keys
    }
    assert not invalid, (
        "번역맵의 키가 아닌 보초가 있다 — 표준측 코드를 넣었다면 상시 오탐이 된다: "
        f"{invalid}"
    )


# ── 1. probe_official_price_total (얇은 프로브) ──

def test_probe_total_returns_total_count():
    """1페이지 응답의 totalCount 를 그대로 돌려준다 — 행 목록은 안 쓴다."""
    with patch(
        "crawler.vworld_price_api._fetch_page", return_value=([{"aphusCode": "A1"}], 1234)
    ) as mock_page:
        assert probe_official_price_total("2827511100", _YEAR) == 1234

    # pageNo=1 만 조회 — 전 페이지를 받으면 이관 뒤 보초 하나가 수만 행이 된다.
    mock_page.assert_called_once_with("2827511100", _YEAR, 1)


def test_probe_total_returns_none_on_failure():
    """조회 실패(None)는 조용히 None — 감시는 best-effort."""
    with patch("crawler.vworld_price_api._fetch_page", return_value=None):
        assert probe_official_price_total("2827511100", _YEAR) is None


def test_probe_total_returns_zero_for_empty_dong():
    """0건은 실패가 아니라 정상(아직 이관 전) — 0 을 그대로 돌려준다."""
    with patch("crawler.vworld_price_api._fetch_page", return_value=([], 0)):
        assert probe_official_price_total("2827511100", _YEAR) == 0


def test_probe_total_falls_back_to_row_count_when_total_unparsable():
    """가짜 무음 방지 — totalCount 가 파싱 불가(→0)여도 행이 있으면 행 수를 돌려준다.

    _fetch_page 는 totalCount 파싱 실패 시 total_count=0 으로 삼키므로(TypeError/ValueError),
    그 0 을 그대로 반환하면 "행은 실재하는데 이관 감시가 조용히 넘어가는" 가짜 무음이 된다.
    """
    rows = [{"aphusCode": "A1"}, {"aphusCode": "A2"}, {"aphusCode": "A3"}]
    with patch("crawler.vworld_price_api._fetch_page", return_value=(rows, 0)):
        assert probe_official_price_total("2827511100", _YEAR) == 3


# ── 2~4. 이관 감시 (_probe_reform_migration) ──

def _patch_probe(side_effect=None, return_value=None):
    """감시가 lazy import 하는 원본 모듈의 프로브를 패치."""
    if side_effect is not None:
        return patch("crawler.vworld_price_api.probe_official_price_total",
                     side_effect=side_effect)
    return patch("crawler.vworld_price_api.probe_official_price_total",
                 return_value=return_value)


def test_migration_probe_alerts_when_sentinel_has_rows():
    """보초 1곳에 데이터가 생기면 텔레그램 경보 1회 + 메시지에 그 보초 라벨·행수."""
    first_code = next(iter(_MIGRATION_SENTINELS))
    first_label = _MIGRATION_SENTINELS[first_code]

    def probe(code, year):
        assert year == _YEAR
        return 61994 if code == first_code else 0

    with _patch_probe(side_effect=probe), patch(
        "crawler.service_official_price._alert_official_price"
    ) as mock_alert:
        _probe_reform_migration(_YEAR)

    mock_alert.assert_called_once()
    message = mock_alert.call_args[0][0]
    assert first_label in message
    assert first_code in message
    assert "61,994" in message  # 행수를 사람이 읽을 수 있게


def test_migration_probe_silent_when_no_rows():
    """전 보초 0건 = 아직 이관 전 = 정상 → 경보 0회."""
    with _patch_probe(return_value=0), patch(
        "crawler.service_official_price._alert_official_price"
    ) as mock_alert:
        _probe_reform_migration(_YEAR)

    mock_alert.assert_not_called()


def test_migration_probe_silent_when_probe_fails():
    """조회 실패(None)도 조용히 통과 — 실패를 이관으로 오인하지 않는다."""
    with _patch_probe(return_value=None), patch(
        "crawler.service_official_price._alert_official_price"
    ) as mock_alert:
        _probe_reform_migration(_YEAR)

    mock_alert.assert_not_called()


def test_migration_probe_swallows_exception():
    """프로브가 예외를 던져도 밖으로 전파되지 않고 경보도 없다 — 수집을 죽이면 안 된다."""
    with _patch_probe(side_effect=RuntimeError("boom")), patch(
        "crawler.service_official_price._alert_official_price"
    ) as mock_alert:
        _probe_reform_migration(_YEAR)  # 예외가 나면 여기서 테스트가 깨진다

    mock_alert.assert_not_called()


def test_migration_probe_alerts_once_for_multiple_sentinels():
    """보초 여러 곳이 동시에 이관돼도 경보는 1회로 묶는다(알림 폭탄 방지)."""
    with _patch_probe(return_value=100), patch(
        "crawler.service_official_price._alert_official_price"
    ) as mock_alert:
        _probe_reform_migration(_YEAR)

    mock_alert.assert_called_once()
    message = mock_alert.call_args[0][0]
    for label in _MIGRATION_SENTINELS.values():
        assert label in message


# ── 5. 호출부 배선 ──

@pytest.mark.parametrize("given_year,expected_year", [
    ("2026", "2026"),
    ("2025", "2025"),
])
def test_collect_calls_migration_probe_with_year(db, monkeypatch, given_year, expected_year):
    """collect_official_prices 가 계산된 기준연도로 감시를 호출한다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    called: list[str] = []

    monkeypatch.setattr(
        "crawler.service_official_price._probe_reform_migration",
        lambda year: called.append(year),
    )

    with patch("crawler.vworld_price_api.fetch_official_prices", return_value=[]):
        collect_official_prices(stdr_year=given_year)

    assert called == [expected_year]


def test_collect_skips_migration_probe_when_disabled(db, monkeypatch):
    """토글이 꺼져 있으면 감시도 안 돈다 — 불필요한 외부 호출 0."""
    monkeypatch.delenv("OFFICIAL_PRICE_ENABLED", raising=False)
    called: list[str] = []

    monkeypatch.setattr(
        "crawler.service_official_price._probe_reform_migration",
        lambda year: called.append(year),
    )

    collect_official_prices(stdr_year=_YEAR)

    assert called == []
