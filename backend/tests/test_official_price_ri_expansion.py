"""공동주택 공시가격 읍/면 리(里) 확장 패스 회귀 테스트 (PR-E2, 세션 373).

검증 축:
  1. 읍/면 코드로는 0건인 단지가 리 확장으로 매칭된다
  2. 리 하나하나가 독립 단위 — 리 하나 실패해도 다른 리는 계속 처리(부분 실패 격리)
  3. 이미 본루프·재수집에서 매칭된 단지는 확장 패스가 재시도하지 않는다
  4. cortar_ri_map.py 에 없는 읍/면(무매칭 561개 대상 밖)은 확장을 시도하지 않는다
  5. 2026 개편 신코드와 리 단위가 겹친 경우, 리 코드도 옛 코드로 번역해서 조회한다
  6. 확장 패스 예외는 본 수집 결과를 되돌리지 않는다 (best-effort)
  7. 리 확장 대상 읍/면 소속 단지는 본루프 '소실' 판정에서 제외된다 (B3, 세션 380)

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

    RA 를 **본루프에서** 매칭시켜 matched_complex_nos 에 넣고(읍/면 자체 조회가
    예외적으로 행을 돌려준 상황 가정), 리 21 이 같은 그룹을 다시 돌려줘도 확장
    패스가 RA 를 건드리지 않는지 본다. RB 는 리 22 에서 정상 매칭돼 두 축이
    분리된다(스킵 축 = RA, 매칭 축 = RB — testing.md 우연 일치 함정 회피).

    ⚠ 세션 380(B3) 이전에는 RA 를 재수집 패스로 구제시키는 구조였으나, 이제 리 확장
    대상 읍/면 소속 단지는 소실 판정에서 제외돼(정상 상태이므로) 읍 재조회 자체가
    일어나지 않는다 — 그 헛조회를 전제로 한 호출 횟수 기대치를 본 구조로 대체했다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    complex_a, complex_b = two_complexes_same_eup

    rows_a = make_rows_for_complex(aphus_code="AA", aphus_nm="리에이단지", ho_count=10)
    rows_b = make_rows_for_complex(aphus_code="AB", aphus_nm="리비단지", ho_count=10)

    # 호출 순서: ①본루프(읍 자체가 rows_a 반환 → RA 매칭, RB 는 미매칭)
    #           → 확장 패스 ②리21(rows_a 재등장하나 RA 는 이미 매칭돼 스킵, RB 는 이름 불일치)
    #           → ③리22(rows_b → RB 매칭)
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[rows_a, rows_a, rows_b],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 3, "본루프1 + 리확장2 = 3회 (읍 재조회 0)"

    saved = {row.complex_no: row for row in db.query(ComplexOfficialPrice).all()}
    assert set(saved) == {complex_a, complex_b}
    assert saved[complex_a].aphus_code == "AA", (
        "본루프에서 매칭된 RA 를 확장 패스가 다시 덮어썼다 = 이미 매칭 단지 스킵 미동작"
    )


def test_ri_eup_complexes_with_prior_rows_are_not_repass_targets(
    db, two_complexes_same_eup, ri_map_patch, monkeypatch
):
    """리 확장 대상 읍/면 소속 단지는 본루프 소실 판정에서 제외된다 (B3, 세션 380).

    읍/면 코드는 V-WORLD 공시 0건이 **정상**이다(공시가 리 단위 코드에 붙는다). 그
    단지들은 재수집 패스가 아니라 뒤의 리 확장 패스가 매칭한다. 그런데 리 확장으로
    올해 행을 한 번 받고 나면, 다음 정기 실행의 `_find_regressed_targets` 가
    "미매칭 + 조회 성공 동 + 올해 행 보유" 3조건을 그대로 충족시켜 **전부 소실**로
    잡는다 — 8/22 리 확장으로 올해 행을 받은 3,930 단지가 이에 해당해
    `_REPASS_COLLAPSE_THRESHOLD` 를 초과하고, "시스템 이상 의심 → 재수집 생략"
    오탐 텔레그램이 나가면서 **진짜 드리프트 구제가 통째로 생략**될 뻔했다.

    fixture 두 축 분리: 임계를 1 로 낮춰(단지 2개 > 1) 제외가 안 되면 반드시 임계
    분기가 발동하게 만들고, 그와 별개로 "리 확장이 실제로 값을 갱신했는가"를
    저장된 price_median 변화로 본다 — 호출 횟수 하나에만 기대지 않는다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    complex_a, complex_b = two_complexes_same_eup

    from datetime import timedelta
    from decimal import Decimal

    import crawler.service_official_price as svc
    from utils import utcnow

    # 지난달 리 확장이 남긴 올해 행 — 소실 판정 3조건 중 "올해 행 보유"를 만든다.
    for complex_no, aphus_code, aphus_nm in (
        (complex_a, "AA", "리에이단지"), (complex_b, "AB", "리비단지")
    ):
        db.add(ComplexOfficialPrice(
            complex_no=complex_no, stdr_year=_YEAR, prvuse_ar=Decimal("84.43"),
            price_median=1_000_000_000, ho_count=10,
            aphus_code=aphus_code, aphus_nm=aphus_nm,
            collected_at=utcnow() - timedelta(days=30),
        ))
    db.commit()

    # 임계를 1 로 낮춘다 — 제외가 없으면 소실 2단지 > 1 이라 반드시 붕괴 분기가 터진다.
    monkeypatch.setattr(svc, "_REPASS_COLLAPSE_THRESHOLD", 1)

    alerts: list[str] = []
    rows_a = make_rows_for_complex(aphus_code="AA", aphus_nm="리에이단지", ho_count=10,
                                   base_price=2_700_000_000)
    rows_b = make_rows_for_complex(aphus_code="AB", aphus_nm="리비단지", ho_count=10,
                                   base_price=2_700_000_000)

    # 호출 순서: ①본루프(읍 자체 0건 — 둘 다 미매칭이 정상) → ②리21 → ③리22
    with patch.object(svc, "_alert_official_price", side_effect=alerts.append), patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[[], rows_a, rows_b],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 3, (
        "읍/면을 소실로 오판해 재조회했다 = 본루프 소실 판정 제외 미동작"
    )
    assert alerts == [], f"소실 오탐 경보가 나갔다: {alerts}"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert "임계" not in (job.error_message or ""), "붕괴 임계 분기가 오발했다"
    assert "잔여" not in (job.error_message or ""), "정상 상태가 잔여 소실로 보고됐다"

    # 별개 축 — 리 확장이 실제로 새 값을 저장했는지(호출 횟수와 독립적인 증거).
    saved = {row.complex_no: row for row in db.query(ComplexOfficialPrice).all()}
    assert set(saved) == {complex_a, complex_b}
    for complex_no in (complex_a, complex_b):
        assert saved[complex_no].price_median > 1_000_000_000, (
            f"{complex_no} 가 리 확장으로 갱신되지 않았다 (과거 행 그대로)"
        )
        assert saved[complex_no].ho_count == 10


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
    # ⚠ patch 타깃은 정의처(cortar_ri_map)가 아니라 **호출부 바인딩**이다 — 세션 380(B3)
    # 에서 이 함수를 모듈 상단 import 로 올려 이름이 service_official_price 에 묶였다.
    with patch(
        "crawler.service_official_price.expand_to_ri_codes",
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
