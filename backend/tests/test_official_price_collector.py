"""공동주택 공시가격 수집기(PR-A2) 회귀 테스트.

검증 축:
  1. 단지명 정규화 — 꼬리 동목록·차수·"아파트"·괄호 제거
  2. 세대수 ±5% 게이트 경계
  3. 다중 후보 폐기 (오매칭 방지 — 세금값이라 "틀린 값 < 값 없음")
  4. 평형별 median 집계 (Decimal 경로 — float 금지)
  5. stdrMt 방어 필터
  6. silent failure 가드 (대상>0 · 매칭0 → failed)
  7. 체크포인트 재개 (done_ld_codes 스킵)
  8. 페이지네이션 종료 조건 (totalCount 기준 — 초과 페이지 반복 반환 함정)

API 호출은 전부 mock — 실호출 0.
"""

from decimal import Decimal
from unittest.mock import patch

import pytest

from crawler.service_official_price import (
    _group_by_aphus,
    _household_gate_ok,
    aggregate_area_medians,
    collect_official_prices,
    match_complex_group,
    normalize_complex_name,
)
from db.models import Complex, ComplexOfficialPrice, CrawlJob

_YEAR = "2026"


# ── 팩토리 (하드코딩 금지 — testing.md 답습) ──

def make_row(*, aphus_code="A1", aphus_nm="은마", dong="1", ho="101",
             area="84.43", price=2_700_000_000, stdr_mt="01"):
    """V-WORLD getApartHousingPriceAttr 행 1건 (실측 필드명 그대로)."""
    return {
        "aphusCode": aphus_code,
        "aphusNm": aphus_nm,
        "dongNm": dong,
        "hoNm": ho,
        "prvuseAr": str(area),
        "pblntfPc": str(price),
        "stdrMt": stdr_mt,
        "stdrYear": _YEAR,
    }


def make_rows_for_complex(*, aphus_code="A1", aphus_nm="은마", ho_count=10,
                          area="84.43", base_price=2_700_000_000):
    """같은 단지의 호 여러 건 — 호마다 가격을 1만원씩 올려 median 이 의미를 갖게 한다."""
    return [
        make_row(aphus_code=aphus_code, aphus_nm=aphus_nm, dong="1", ho=str(100 + i),
                 area=area, price=base_price + i * 10_000)
        for i in range(ho_count)
    ]


@pytest.fixture
def seeded(db):
    """대상 단지 1개(APT, 세대수 10) — 매칭 성공 경로의 기본 셋업."""
    db.add(Complex(complex_no="C1", complex_name="은마아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    return "C1"


# ── 1. 이름 정규화 ──

@pytest.mark.parametrize("raw,expected", [
    # 꼬리 동목록 제거 (라이브 실측 패턴)
    ("대치우성아파트1동 2동 3동 5동 6동 7동", "대치우성"),
    ("대치우성아파트1동,2동", "대치우성"),
    # "아파트" 제거
    ("은마아파트", "은마"),
    # 괄호 제거
    ("래미안(1단지)", "래미안"),
    # 차수 표기 통일
    ("래미안 2 차", "래미안2차"),
    ("래미안2차", "래미안2차"),
    # 공백·특수문자 제거
    ("삼성 래미안, 1", "삼성래미안1"),
    # 빈 입력
    ("", ""),
    (None, ""),
])
def test_normalize_complex_name(raw, expected):
    assert normalize_complex_name(raw) == expected


def test_normalize_matches_our_name_to_public_name():
    """우리 DB 이름과 공시 단지명이 같은 축으로 수렴한다 (매칭의 전제)."""
    assert normalize_complex_name("대치우성") == normalize_complex_name(
        "대치우성아파트1동 2동 3동 5동 6동 7동"
    )


# ── 2. 세대수 ±5% 게이트 경계 ──

@pytest.mark.parametrize("ho_count,household,expected", [
    (100, 100, True),    # 정확 일치
    (105, 100, True),    # +5% 경계 (통과)
    (95, 100, True),     # -5% 경계 (통과)
    (106, 100, False),   # +6% (탈락)
    (94, 100, False),    # -6% (탈락)
    (100, None, False),  # 세대수 NULL — 대조 불가라 통과시키지 않는다
    (100, 0, False),     # 세대수 0 — 0 나눗셈 방지 + 대조 불가
])
def test_household_gate_boundary(ho_count, household, expected):
    assert _household_gate_ok(ho_count, household) is expected


# ── 3. 다중 후보 폐기 (오매칭 방지) ──

def test_match_single_candidate_is_adopted():
    """게이트 통과 후보가 1개면 채택."""
    grouped = _group_by_aphus(make_rows_for_complex(aphus_nm="은마", ho_count=10))
    by_name = {normalize_complex_name(g["name"]): [(c, g)] for c, g in grouped.items()}

    hit = match_complex_group("은마아파트", 10, by_name)
    assert hit is not None
    assert hit[0] == "A1"


def test_match_multiple_candidates_is_discarded():
    """게이트를 통과한 동명이 단지가 2개면 임의 선택하지 않고 폐기한다.

    부평동 오매칭 52건(동명이 단지 '로뎀레뷰' 8개 등)을 0으로 만드는 필수 분기.
    """
    rows = (
        make_rows_for_complex(aphus_code="A1", aphus_nm="로뎀레뷰", ho_count=10)
        + make_rows_for_complex(aphus_code="A2", aphus_nm="로뎀레뷰", ho_count=10)
    )
    grouped = _group_by_aphus(rows)
    by_name: dict = {}
    for code, group in grouped.items():
        by_name.setdefault(normalize_complex_name(group["name"]), []).append((code, group))

    assert len(by_name["로뎀레뷰"]) == 2, "두 단지가 같은 정규화 이름이어야 이 테스트가 의미 있음"
    assert match_complex_group("로뎀레뷰", 10, by_name) is None


def test_match_household_gate_failure_is_discarded():
    """이름은 같아도 세대수가 어긋나면 매칭하지 않는다."""
    grouped = _group_by_aphus(make_rows_for_complex(aphus_nm="은마", ho_count=10))
    by_name = {normalize_complex_name(g["name"]): [(c, g)] for c, g in grouped.items()}

    assert match_complex_group("은마아파트", 500, by_name) is None


def test_match_unknown_name_returns_none():
    """이름이 아예 없는 단지는 미매칭."""
    grouped = _group_by_aphus(make_rows_for_complex(aphus_nm="은마", ho_count=10))
    by_name = {normalize_complex_name(g["name"]): [(c, g)] for c, g in grouped.items()}

    assert match_complex_group("존재하지않는단지", 10, by_name) is None


# ── 4. 평형별 median 집계 (Decimal 경로) ──

def test_aggregate_area_medians_uses_decimal_and_median():
    """면적은 Decimal, 가격은 중위값, 표본 수는 호 개수."""
    rows = [
        make_row(area="84.43", price=100),
        make_row(area="84.43", price=200, ho="102"),
        make_row(area="84.43", price=300, ho="103"),
        make_row(area="59.98", price=50, ho="104"),
    ]
    result = aggregate_area_medians(rows)

    assert result == [(Decimal("59.98"), 50, 1), (Decimal("84.43"), 200, 3)]
    # 면적 타입이 Decimal 이어야 NUMERIC(8,2) 반올림과 어긋나지 않는다
    assert all(isinstance(area, Decimal) for area, _, _ in result)


def test_aggregate_area_medians_quantizes_to_two_places():
    """소수 3자리 이상 입력도 2자리로 수렴 — 같은 평형이 별개 행으로 쪼개지지 않게."""
    rows = [make_row(area="84.4300", price=100), make_row(area="84.43", price=300, ho="102")]
    result = aggregate_area_medians(rows)

    assert len(result) == 1, "같은 면적인데 별개 버킷으로 쪼개졌다"
    assert result[0][0] == Decimal("84.43")
    assert result[0][2] == 2


def test_aggregate_area_medians_skips_invalid_rows():
    """면적·가격이 비었거나 0 이하면 집계에서 제외."""
    rows = [
        make_row(area="84.43", price=100),
        make_row(area="", price=200, ho="102"),
        make_row(area="84.43", price=0, ho="103"),
    ]
    result = aggregate_area_medians(rows)

    assert result == [(Decimal("84.43"), 100, 1)]


# ── 5. stdrMt 방어 필터 ──

def test_group_by_aphus_filters_non_january_stdr_mt():
    """stdrMt 가 '01' 이 아닌 행은 그룹에서 제외 (반기 공시 중복 방어)."""
    rows = [
        make_row(ho="101", stdr_mt="01"),
        make_row(ho="102", stdr_mt="07"),
    ]
    grouped = _group_by_aphus(rows)

    assert len(grouped["A1"]["rows"]) == 1
    assert grouped["A1"]["ho_keys"] == {("1", "101")}


def test_group_by_aphus_skips_rows_without_code():
    """aphusCode 가 없는 행은 그룹 키를 만들 수 없어 제외."""
    grouped = _group_by_aphus([make_row(aphus_code="")])
    assert grouped == {}


# ── 6~7. 수집 흐름 (mock API) ──

def _patch_fetch(return_value):
    """vworld_price_api.fetch_official_prices 를 mock — lazy import 라 원본 모듈 패치."""
    return patch(
        "crawler.vworld_price_api.fetch_official_prices",
        return_value=return_value,
    )


def test_collect_disabled_records_cancelled(db, monkeypatch):
    """토글이 꺼져 있으면 cancelled 로만 기록하고 API 를 부르지 않는다."""
    monkeypatch.delenv("OFFICIAL_PRICE_ENABLED", raising=False)

    with patch("crawler.vworld_price_api.fetch_official_prices") as mock_fetch:
        collect_official_prices(stdr_year=_YEAR, scheduler_job_id="collect_official_prices")

    mock_fetch.assert_not_called()
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "cancelled"


def test_collect_saves_area_medians(db, seeded, monkeypatch):
    """정상 경로 — 매칭된 단지의 평형별 중위가가 저장된다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    rows = make_rows_for_complex(aphus_nm="은마", ho_count=10, area="84.43")

    with _patch_fetch(rows):
        collect_official_prices(stdr_year=_YEAR)

    saved = db.query(ComplexOfficialPrice).all()
    assert len(saved) == 1
    assert saved[0].complex_no == seeded
    assert saved[0].stdr_year == _YEAR
    assert Decimal(str(saved[0].prvuse_ar)) == Decimal("84.43")
    assert saved[0].ho_count == 10

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert job.processed_items == 1


def test_collect_is_idempotent(db, seeded, monkeypatch):
    """같은 연도로 2회 수집해도 행이 늘지 않는다 (복합키 upsert)."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    rows = make_rows_for_complex(ho_count=10)

    with _patch_fetch(rows):
        collect_official_prices(stdr_year=_YEAR)
        collect_official_prices(stdr_year=_YEAR)

    assert db.query(ComplexOfficialPrice).count() == 1


def test_collect_silent_failure_guard(db, seeded, monkeypatch):
    """대상 단지가 있는데 한 건도 못 매칭하면 completed(0) 가 아니라 failed."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    # 이름이 전혀 다른 공시 단지만 반환 → 전량 미매칭
    rows = make_rows_for_complex(aphus_nm="전혀다른단지", ho_count=10)

    with _patch_fetch(rows):
        collect_official_prices(stdr_year=_YEAR)

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "failed"
    assert "매칭 실패" in (job.error_message or "")
    assert db.query(ComplexOfficialPrice).count() == 0


def test_collect_api_failure_does_not_trip_silent_guard_falsely(db, seeded, monkeypatch):
    """API 조회 실패(None)도 매칭 0 이므로 failed 로 잡힌다 — 조용한 완료 위장 금지."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    with _patch_fetch(None):
        collect_official_prices(stdr_year=_YEAR)

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "failed"


def test_collect_resumes_from_checkpoint(db, seeded, monkeypatch):
    """직전 중단 job 의 done_ld_codes 에 있는 법정동은 다시 조회하지 않는다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    from crawler.service_common import _checkpoint
    from utils import utcnow

    prev = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                    status="failed", started_at=utcnow())
    db.add(prev)
    db.commit()
    _checkpoint.save(db, prev.id, {"done_ld_codes": ["1168010600"], "total": 1})

    with patch("crawler.vworld_price_api.fetch_official_prices") as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 0, "이미 완료된 법정동을 다시 조회했다 = 재개 미동작"


def test_collect_skips_non_target_types(db, monkeypatch):
    """OPST 등 대상 외 유형은 수집 대상에서 제외 (조회 자체가 안 일어남)."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="O1", complex_name="오피스텔", cortar_no="1168010600",
                   real_estate_type_code="OPST", total_household_count=10))
    db.commit()

    with patch("crawler.vworld_price_api.fetch_official_prices") as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    mock_fetch.assert_not_called()


# ── 8. 페이지네이션 종료 조건 ──

def test_fetch_stops_by_total_count_not_page_length(monkeypatch):
    """페이지 끝 판정은 totalCount 기준이어야 한다.

    ⚠ V-WORLD 는 범위를 넘은 pageNo 에 400/빈응답이 아니라 **마지막 페이지를 그대로
    반복 반환**한다(2026-08-09 실측). 총행수가 정확히 PAGE_SIZE 배수인 동에서
    `len(page) < PAGE_SIZE` 로 끊으면 무한 루프 + 데이터 중복이 된다.
    """
    from crawler import vworld_price_api

    monkeypatch.setattr(vworld_price_api, "PAGE_SIZE", 2)
    calls: list[int] = []

    def fake_page(pnu, year, page_no):
        calls.append(page_no)
        # totalCount=4, PAGE_SIZE=2 → 2페이지가 끝. 매 페이지가 꽉 찬 2건을 반환해
        # "덜 찬 페이지" 신호가 영영 오지 않는 상황을 재현.
        return [make_row(ho=f"{page_no}-1"), make_row(ho=f"{page_no}-2")], 4

    monkeypatch.setattr(vworld_price_api, "_fetch_page", fake_page)
    rows = vworld_price_api.fetch_official_prices("1168010600", _YEAR)

    assert calls == [1, 2], f"totalCount 기준 2페이지에서 멈춰야 하는데 {calls} 호출"
    assert len(rows) == 4


def test_fetch_returns_empty_list_for_zero_rows(monkeypatch):
    """0건은 실패(None)가 아니라 빈 리스트 — '빈 동'과 '조회 실패'는 구분돼야 한다."""
    from crawler import vworld_price_api

    monkeypatch.setattr(vworld_price_api, "_fetch_page", lambda p, y, n: ([], 0))
    assert vworld_price_api.fetch_official_prices("1168010600", _YEAR) == []


def test_fetch_returns_none_when_mid_page_fails(monkeypatch):
    """중간 페이지 실패는 부분 결과가 아니라 None — 불완전 수집으로 매칭하면 안 된다."""
    from crawler import vworld_price_api

    monkeypatch.setattr(vworld_price_api, "PAGE_SIZE", 2)

    def fake_page(pnu, year, page_no):
        if page_no == 1:
            return [make_row(), make_row(ho="102")], 4
        return None

    monkeypatch.setattr(vworld_price_api, "_fetch_page", fake_page)
    assert vworld_price_api.fetch_official_prices("1168010600", _YEAR) is None


def test_extract_wrapper_handles_zero_result_envelope():
    """0건 응답의 래퍼 키는 apartHousingPrices 가 아니라 response (실측)."""
    from crawler.vworld_price_api import _extract_wrapper

    assert _extract_wrapper({"response": {"totalCount": "0"}}) == {"totalCount": "0"}
    assert _extract_wrapper({"apartHousingPrices": {"field": []}}) == {"field": []}
    assert _extract_wrapper({}) == {}
