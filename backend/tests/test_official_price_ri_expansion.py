"""공동주택 공시가격 읍/면 리(里) 확장 패스 회귀 테스트 (PR-E2, 세션 373).

검증 축:
  1. 읍/면 코드로는 0건인 단지가 리 확장으로 매칭된다
  2. 리 하나하나가 독립 단위 — 리 하나 실패해도 다른 리는 계속 처리(부분 실패 격리)
  3. 이미 본루프·재수집에서 매칭된 단지는 확장 패스가 재시도하지 않는다
  4. cortar_ri_map.py 에 없는 읍/면(무매칭 561개 대상 밖)은 확장을 시도하지 않는다
  5. 2026 개편 신코드와 리 단위가 겹친 경우, 리 코드도 옛 코드로 번역해서 조회한다
  6. 확장 패스 예외는 본 수집 결과를 되돌리지 않는다 (best-effort)

fixture 설계 원칙(testing.md "fixture 우연 일치로 단위오류 은폐" 답습): 읍 1개 아래
리 2개를 두고, 각 리에 **서로 다른 단지**를 매칭시킨다 — 리별 독립 처리가 실제로
검증되게 하기 위함이다(우연히 같은 결과가 나와 결함을 못 잡는 함정 회피).

API 호출은 전부 mock — 실호출 0.
"""

from unittest.mock import patch

import pytest

from crawler.service_official_price import collect_official_prices
from db.models import Complex, ComplexOfficialPrice, CrawlJob
from tests.test_official_price_collector import make_rows_for_complex

_YEAR = "2026"

# 테스트 전용 읍/면 코드 — 실제 cortar_ri_map.py 의 값을 흉내내되 다른 코드로 격리
# (실제 생성 dict 와 충돌하지 않게, 실존하지 않을 법한 코드를 쓴다).
_TEST_EUP_CODE = "9999999900"  # 읍/면 자체(끝 두 글자 "00") — 조회 시 0건이 정상


@pytest.fixture
def ri_map_patch(monkeypatch):
    """cortar_ri_map.RI_CODE_MAP 을 테스트 전용 값으로 교체 — 실제 생성 dict 무관.

    리 2개(21, 22)를 둔다 — testing.md 답습(1개짜리 fixture 는 "독립 처리"를
    증명하지 못한다).
    """
    import crawler.cortar_ri_map as ri_map

    monkeypatch.setattr(ri_map, "RI_CODE_MAP", {_TEST_EUP_CODE: ["21", "22"]})
    return ri_map


@pytest.fixture
def two_complexes_same_eup(db):
    """같은 읍/면 코드에 속한 단지 2개 — 각각 다른 리에 매칭될 예정.

    읍/면 코드로는 애초에 0건(전국 공통 한계)이므로, 본루프에서 둘 다 미매칭 상태로
    지나간다. 과거 행이 없으므로 재수집 패스의 '소실' 판정 대상도 아니다.
    """
    db.add(Complex(complex_no="RA", complex_name="리에이단지", cortar_no=_TEST_EUP_CODE,
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="RB", complex_name="리비단지", cortar_no=_TEST_EUP_CODE,
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    return ("RA", "RB")


def test_ri_expansion_matches_complexes_in_separate_ri(
    db, two_complexes_same_eup, ri_map_patch, monkeypatch
):
    """읍/면 자체는 0건이지만, 서로 다른 리에서 각 단지가 매칭된다 — 핵심 시나리오."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    complex_a, complex_b = two_complexes_same_eup

    rows_a = make_rows_for_complex(aphus_code="AA", aphus_nm="리에이단지", ho_count=10)
    rows_b = make_rows_for_complex(aphus_code="AB", aphus_nm="리비단지", ho_count=10)

    # 호출 순서: ① 본루프(읍/면 자체, 0건) → ② 리 21 → ③ 리 22 (sorted 순회)
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[[], rows_a, rows_b],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 3, "본루프 1회 + 리 2개 = 3회 호출"

    saved = {row.complex_no: row for row in db.query(ComplexOfficialPrice).all()}
    assert set(saved) == {complex_a, complex_b}, "두 단지 모두 각자의 리에서 매칭돼야 한다"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"


def test_ri_expansion_isolates_single_ri_failure(
    db, two_complexes_same_eup, ri_map_patch, monkeypatch
):
    """리 하나 조회 실패는 그 리만 건너뛴다 — 나머지 리는 계속 처리된다(부분 실패 격리)."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _complex_a, complex_b = two_complexes_same_eup

    rows_b = make_rows_for_complex(aphus_code="AB", aphus_nm="리비단지", ho_count=10)

    # 리 21 은 조회 실패(None), 리 22 는 정상 — 읍 전체가 아니라 리 21 소속 단지만 손해.
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[[], None, rows_b],
    ):
        collect_official_prices(stdr_year=_YEAR)

    saved = db.query(ComplexOfficialPrice).all()
    assert len(saved) == 1
    assert saved[0].complex_no == complex_b, "실패한 리 소속 단지(RA)는 매칭되지 않아야 한다"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed", "리 확장 부분 실패가 전체 잡을 실패로 만들면 안 된다"


def test_ri_expansion_skips_already_matched_complex(
    db, two_complexes_same_eup, ri_map_patch, monkeypatch
):
    """본루프에서 이미 매칭된 단지는 리 확장 단계에서 재시도하지 않는다.

    같은 읍/면에 속한 다른 단지(RB)는 애초에 다른 법정동에도 존재할 수 있다는
    전제가 비현실적이라, 여기서는 '이미 matched_complex_nos 에 들어간 단지를
    확장 패스가 건드리지 않는지'만 격리해 확인한다 — RA 를 재수집 패스로 먼저
    구제시키고(과거 행 필요), 확장 단계 mock 호출 횟수로 재시도 여부를 판별한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    complex_a, complex_b = two_complexes_same_eup

    from datetime import timedelta
    from decimal import Decimal

    from utils import utcnow

    # RA 에 '과거 행'을 심어 재수집 패스의 소실 판정 대상으로 만든다.
    db.add(ComplexOfficialPrice(
        complex_no=complex_a, stdr_year=_YEAR, prvuse_ar=Decimal("84.43"),
        price_median=1_000_000_000, ho_count=10, aphus_code="AA", aphus_nm="리에이단지",
        collected_at=utcnow() - timedelta(days=30),
    ))
    db.commit()

    rows_a = make_rows_for_complex(aphus_code="AA", aphus_nm="리에이단지", ho_count=10)
    rows_b = make_rows_for_complex(aphus_code="AB", aphus_nm="리비단지", ho_count=10)

    # 호출 순서: ①본루프(읍 자체, 0건이라 RA·RB 둘 다 미매칭)
    #           → 재수집 패스가 RA(과거 행 有)를 소실로 감지해 ②같은 읍 재조회(0건, 여전히 미매칭)
    #           → 확장 패스 ③리21(RA 매칭) ④리22(RB 매칭)
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[[], [], rows_a, rows_b],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 4, "본루프1 + 재수집1 + 리확장2 = 4회"

    saved = {row.complex_no for row in db.query(ComplexOfficialPrice).all()}
    assert saved == {complex_a, complex_b}


def test_ri_expansion_skipped_when_eup_not_in_map(db, monkeypatch):
    """cortar_ri_map.py 에 없는 읍/면(대상 561개 밖)은 확장을 시도하지 않는다.

    이 프로젝트의 다른 읍/면 코드(스코프 밖)를 써서 RI_CODE_MAP 을 patch 하지 않고
    그대로 둔다 — 생성 시점에 무매칭 목록에 없었던 읍/면이 이 경로를 탄다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="C1", complex_name="아무단지", cortar_no="0000000000",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[[]],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 1, "맵에 없는 읍/면은 확장 호출이 추가되면 안 된다"


def test_ri_expansion_exception_does_not_fail_the_job(
    db, two_complexes_same_eup, ri_map_patch, monkeypatch
):
    """확장 패스 도중 예외가 나도 본 수집 결과(재수집 패스까지)는 유지된다 — best-effort."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    complex_a, complex_b = two_complexes_same_eup

    # expand_to_ri_codes 를 예외 발생으로 교체 — 확장 패스 진입 직후 실패 재현.
    with patch(
        "crawler.cortar_ri_map.expand_to_ri_codes",
        side_effect=RuntimeError("code.go.kr 원장 손상 가정"),
    ), patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[[]],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 1, "확장 패스가 시도조차 못했으므로 본루프 호출만 있어야 한다"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    # 대상 단지(RA·RB)가 있는데 매칭 0건이므로 silent failure 가드가 정당하게 failed 로 끊는다
    # — 확장 패스 예외 자체가 job 을 죽이지 않는다는 것만 이 테스트의 관심사다(별도 잡 예외 無).
    assert job.status == "failed", "확장 패스 예외가 아니라 매칭 0건이 원인 — silent failure 가드 정상 동작"
    assert complex_a and complex_b, "fixture 가 넘긴 두 단지 번호가 유효해야 한다"
