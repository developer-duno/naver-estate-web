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
    _REPASS_MAX_ATTEMPTS,
    _extend_unique,
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


def test_collect_silent_failure_guard_counts_complexes_not_ld_codes(db, monkeypatch):
    """실패 문구의 숫자는 법정동 수가 아니라 단지 수 — 단위 오류 회귀 가드 (세션 372 적대검증).

    seeded fixture(단지 1=법정동 1)는 두 숫자가 우연히 같아 단위 오류를 못 잡는다.
    여기서는 같은 법정동에 단지 2개를 묶어, len(remaining)(법정동 수=1)이 그대로 새면
    "대상 단지 1개"로 잘못 찍히고, 단지 수를 정확히 세면 "대상 단지 2개"가 되는 걸로 구분한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="C1", complex_name="은마아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="C2", complex_name="래미안아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=20))
    db.commit()
    # 이름이 전혀 다른 공시 단지만 반환 → 전량 미매칭
    rows = make_rows_for_complex(aphus_nm="전혀다른단지", ho_count=10)

    with _patch_fetch(rows):
        collect_official_prices(stdr_year=_YEAR)

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "failed"
    assert "대상 단지 2개 전부 매칭 실패" in (job.error_message or "")


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


def test_collect_ignores_stale_checkpoint(db, seeded, monkeypatch):
    """신선도 상한(RESUME_MAX_AGE_HOURS) 회귀 가드 — 세션 370 발견 잠복 결함.

    실패 job 의 체크포인트는 영구 잔존하고 이 잡은 월 1회라 신규 실패가 쌓여 밀려나지도
    않는다. 9/15 실행이 중간 실패하고 재트리거가 없으면 10/15 정기 실행이 지난달
    "완료 목록"을 이어받아 그 절반을 스킵하고, 연도가 바뀌면 작년 마커로 올해 수집을
    스킵한다(체크포인트에 연도 정보 없음). 72h 초과 체크포인트는 무시해야 한다.

    (72h 이내 = 기존대로 이어받음은 test_collect_resumes_from_checkpoint 가 이미 커버)
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    from datetime import timedelta

    from crawler.service_common import _checkpoint
    from utils import utcnow

    # 한 달 전 실패 job — 다음 달 정기 실행이 이걸 이어받던 것이 결함
    stale = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                     status="failed", started_at=utcnow() - timedelta(days=30))
    db.add(stale)
    db.commit()
    _checkpoint.save(db, stale.id, {"done_ld_codes": ["1168010600"], "total": 1})

    rows = make_rows_for_complex(aphus_nm="은마", ho_count=10)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices", side_effect=[rows]
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 1, "지난달 체크포인트를 이어받아 법정동을 조용히 스킵했다"

    # 실제로 수집까지 정상 완료됐는지 확인 (스킵됐다면 매칭 0 → silent failure 가드로 failed)
    job = db.query(CrawlJob).filter(
        CrawlJob.job_type == "official_price", CrawlJob.id != stale.id
    ).one()
    assert job.status == "completed"
    assert db.query(ComplexOfficialPrice).count() == 1


def test_collect_skips_non_target_types(db, monkeypatch):
    """OPST 등 대상 외 유형은 수집 대상에서 제외 (조회 자체가 안 일어남)."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="O1", complex_name="오피스텔", cortar_no="1168010600",
                   real_estate_type_code="OPST", total_household_count=10))
    db.commit()

    with patch("crawler.vworld_price_api.fetch_official_prices") as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    mock_fetch.assert_not_called()


# ── 7-1. 법정동 단위 재시도 (PR-2, vworld_price_api.py 429 재시도 위의 4번째 계층) ──

def test_collect_retries_once_then_succeeds(db, seeded, monkeypatch):
    """1차 조회가 None(실패)이어도 2차(재시도)가 성공하면 정상 매칭된다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    good_rows = make_rows_for_complex(aphus_nm="은마", ho_count=10, area="84.43")

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[None, good_rows],
    ) as mock_fetch, patch("crawler.service_official_price.time.sleep") as mock_sleep:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2, "1차 실패 후 정확히 1회 재시도해야 한다"
    mock_sleep.assert_called_once_with(2)

    saved = db.query(ComplexOfficialPrice).all()
    assert len(saved) == 1
    assert saved[0].complex_no == seeded

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"


def test_collect_records_failed_ld_codes_after_retry_exhausted(db, monkeypatch, caplog):
    """재시도까지 소진(1차+재시도 모두 None)한 법정동은 failed_ld_codes_list 에 쌓인다.

    두 법정동 모두 실패시켜 리스트에 정확히 그 두 코드가 들어갔는지 caplog 로 확인한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="C1", complex_name="은마아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="C2", complex_name="다른아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[None, None, None, None],
    ) as mock_fetch, patch("crawler.service_official_price.time.sleep"), caplog.at_level(
        "WARNING", logger="crawler.service_official_price"
    ):
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 4, "법정동 2개 × (1차+재시도) = 4회 호출"

    # silent failure 가드가 매칭 0건에서 job 을 failed 로 끊고 return 하므로, 완료 로그
    # (failed_ld_codes_list 포함)가 아니라 개별 경고 로그 2건으로 검증한다.
    warning_msgs = [r.message for r in caplog.records if r.levelname == "WARNING"]
    assert any("1168010600" in m for m in warning_msgs)
    assert any("1168010700" in m for m in warning_msgs)


# ── 7-2. 매칭 소실 재수집 패스 (세션 370 페이지 드리프트 실사고 회귀) ──
#
# V-WORLD 는 같은 법정동을 연속 조회해도 총행수는 같은데 행 구성이 달라진다(중복+누락).
# 그래서 대형 단지의 유니크 호수가 실행마다 흔들려 세대수 ±5% 게이트를 비결정적으로
# 통과·탈락한다(은마 1차 3,947 탈락 / 2차 4,320 통과). 행수 정합성 가드는 총량이
# 맞아떨어져 못 잡으므로, 소실된 단지만 두 번째 표본으로 재조회해 구제한다.


def _seed_prior_row(db, complex_no, *, days_ago=30, minutes_ago=0, stdr_year=_YEAR,
                    aphus_code="A1"):
    """과거 실행에서 저장된 공시 행 — '소실' 판정의 전제(이번엔 못 붙었는데 예전엔 붙었다).

    `minutes_ago` 는 재개 사슬 테스트용 — 저장 시각을 사슬 시작 전후 몇 분 단위로
    정밀하게 놓아야 "사슬 시작 이전/이후" 두 축이 갈린다(세션 380).
    """
    from datetime import timedelta

    from utils import utcnow

    db.add(ComplexOfficialPrice(
        complex_no=complex_no, stdr_year=stdr_year, prvuse_ar=Decimal("84.43"),
        price_median=1_000_000_000, ho_count=10, aphus_code=aphus_code, aphus_nm="은마",
        collected_at=utcnow() - timedelta(days=days_ago, minutes=minutes_ago),
    ))
    db.commit()


def test_repass_rescues_regressed_complex(db, seeded, monkeypatch):
    """구제 성공 — 1차는 드리프트(호수 부족→게이트 탈락), 재수집은 완전 데이터면 저장된다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)

    # 세대수 10 인데 호 8건만 → 비율 0.8 로 ±5% 게이트 탈락 (드리프트 재현)
    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8, base_price=2_000_000_000)
    complete = make_rows_for_complex(aphus_nm="은마", ho_count=10, base_price=2_700_000_000)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, complete],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2, "소실 감지 후 그 법정동을 정확히 1회 재조회해야 한다"

    saved = db.query(ComplexOfficialPrice).all()
    assert len(saved) == 1
    assert saved[0].ho_count == 10, "재수집분(완전 데이터)으로 갱신돼야 한다"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert job.processed_items == 1
    assert "잔여" not in (job.error_message or ""), "구제됐으므로 잔여 문구가 없어야 한다"


def test_repass_failure_records_remaining_in_error_message(db, seeded, monkeypatch):
    """재수집도 실패 — 행은 안 바뀌고, completed 를 유지하되 잔여 사실을 error_message 에 남긴다.

    다른 법정동의 단지 하나는 정상 매칭시킨다 — 전량 미매칭이면 silent failure 가드가
    (정당하게) failed 로 끊으므로, '일부만 소실'이라는 이 테스트의 상황이 성립하지 않는다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    # 법정동 오름차순(1168010600=은마, 1168010700=정상) → 본 루프 2회, 재수집은 은마
    # _REPASS_MAX_ATTEMPTS(3)회 전부 소진(합집합을 떠도 계속 호 8건이라 끝내 게이트 탈락).
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, healthy, drifted, drifted, drifted],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2 + _REPASS_MAX_ATTEMPTS, (
        "본 루프 2개 법정동 + 소실 1개 법정동을 시도 상한만큼 재수집"
    )

    lost_row = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.complex_no == seeded
    ).one()
    assert lost_row.ho_count == 10, "두 번 다 게이트 탈락이라 과거 행이 그대로여야 한다"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed", "일부 소실은 전량 실패가 아니라 completed 유지"
    assert "잔여 1단지" in (job.error_message or "")
    assert seeded in (job.error_message or ""), "어느 단지가 잔여인지 식별 가능해야 한다"


def test_repass_fetch_failure_does_not_pollute_failed_counters(db, seeded, monkeypatch):
    """재수집 조회 실패는 failed_ld_codes/total_items 를 오염시키지 않는다.

    재수집 대상 동은 **정의상 본 루프에서 조회 성공한 동**이다(processed_ld_codes 필터).
    그런데도 재수집 실패를 failed_ld_codes 에 합산하면 "조회 실패 동 목록"에 성공했던
    동이 섞이고 total_items(=collected+failed)가 부풀려진다. 실패 사실은 별도 카운터와
    잔여 문구로만 남아야 한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    # 본 루프: 은마(드리프트 성공)·정상(성공) → 재수집: 은마 조회가 시도 상한까지 전부 실패(None)
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, healthy] + [None] * _REPASS_MAX_ATTEMPTS,
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2 + _REPASS_MAX_ATTEMPTS

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert job.processed_items == 1, "본 루프에서 매칭한 정상 단지 1개"
    # 본 루프 조회 실패가 0 이므로 total_items = processed(1) + failed(0) = 1.
    # 재수집 실패가 여기 섞이면 2 가 된다 = 카운터 오염.
    assert job.total_items == 1, "재수집 조회 실패가 failed_ld_codes 에 합산돼 total 이 부풀었다"
    # 조회 실패로 구제 못 했으니 그 단지는 잔여 목록에 남아야 한다
    assert "잔여 1단지" in (job.error_message or "")
    assert seeded in (job.error_message or "")


def test_repass_remaining_loss_sends_telegram_alert(db, seeded, monkeypatch):
    """잔여 미매칭은 텔레그램으로 승격 — completed 잡의 error_message 는 아무도 안 본다.

    monitor 텔레그램은 failed 만 감시하고 admin UI 는 행을 펼쳐야 보인다. 월 1회 잡이라
    이대로면 다음 달까지 소실을 아무도 모르는 게 9/15 유일 맹점이었다.
    (conftest 가 TELEGRAM_ENABLED=false 를 전역 강제하므로 실발송은 0 — 호출만 단언)
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    # 재수집은 시도 상한까지 돌지만 합집합이 계속 호 8건이라 끝내 구제 실패한다.
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, healthy] + [drifted] * _REPASS_MAX_ATTEMPTS,
    ), patch("services.telegram.send_telegram") as mock_send:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_send.call_count == 1, "잔여 미매칭인데 텔레그램 알림이 안 나갔다"
    sent = mock_send.call_args[0][0]
    # 단언 의도("못 받은 단지가 무엇인지 본문에 남는가")는 그대로, 표기만 새 문구에 맞춘다.
    # 세션 408 에 이 알림을 쉬운 우리말로 바꿨다("잔여" → "다시 시도했는데도 값이 없는 단지").
    assert seeded in sent, f"알림 본문에 못 받은 단지 번호가 없다: {sent}"
    assert "값이 없는 단지" in sent, f"무엇이 문제인지 안 나온다: {sent}"


def test_repass_runs_before_silent_failure_guard(db, seeded, monkeypatch):
    """전량 소실 실행에서도 재수집이 먼저 돈다 — 가드가 앞에 있으면 구제 기회가 사라진다.

    가드를 재수집 앞에 두면 '드리프트로 이번에 전부 탈락'한 실행이 곧바로 failed 로 끊겨
    재조회 자체를 못 한다. 구제 성공 시 최종 매칭이 0 이 아니므로 가드도 당연히 안 걸린다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    complete = make_rows_for_complex(aphus_nm="은마", ho_count=10)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, complete],
    ):
        collect_official_prices(stdr_year=_YEAR)

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed", "재수집으로 구제됐는데 silent failure 로 끊겼다"
    assert job.processed_items == 1


def test_repass_skips_complexes_without_prior_rows(db, monkeypatch):
    """신규 단지는 재수집 대상이 아니다 — 과거 행이 없으면 '소실'이 아니라 그냥 미매칭."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    # 과거 행 없는 단지 2개: 하나는 매칭 성공(silent failure 가드 회피), 하나는 미매칭
    db.add(Complex(complex_no="C1", complex_name="은마아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="C2", complex_name="신규아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    rows = make_rows_for_complex(aphus_nm="은마", ho_count=10)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[rows],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 1, "과거 행 없는 미매칭 단지 때문에 재수집이 돌면 안 된다"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert not (job.error_message or ""), "소실이 아니므로 잔여 문구도 없어야 한다"


def test_repass_ignores_checkpoint_skipped_dongs(db, seeded, monkeypatch):
    """재개(resume) 실행 — 죽은 잡이 **저장한** 단지는 소실이 아니다.

    이어받은 동은 사슬이 이미 조회한 동이므로, 그 동의 단지가 사슬 시작 이후에 저장된
    적이 있으면 "그때 매칭됐다"는 뜻이다. 이걸 소실로 잡으면 재개 실행마다 수천~만
    단지가 거짓 경보로 잡혀 진짜 드리프트 소실이 묻히고, 스킵된 동을 통째로 재조회해
    체크포인트의 이득까지 되돌린다.

    (세션 380 이전에는 이어받은 동 전체를 관할 밖으로 배제해 같은 결과를 냈으나,
    그 배제가 만든 사각을 메우면서 판정 기준이 "사슬 시작 이후 저장 여부"로 바뀌었다 —
    이 테스트는 그 새 기준에서도 오탐이 안 나는지를 본다.)
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    from datetime import timedelta

    from crawler.service_common import _checkpoint
    from utils import utcnow

    prev = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                    status="failed", started_at=utcnow() - timedelta(hours=1))
    db.add(prev)
    db.commit()
    _checkpoint.save(db, prev.id, {"done_ld_codes": ["1168010600"], "total": 1})

    # 죽은 잡이 **저장한** 행 — 사슬 시작(1시간 전) 이후이므로 소실이 아니다.
    _seed_prior_row(db, seeded, days_ago=0, minutes_ago=30)

    with patch("crawler.vworld_price_api.fetch_official_prices") as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 0, (
        "죽은 잡이 이미 저장한 단지를 소실로 오판해 재조회했다 = 재개마다 거짓 경보"
    )

    # 이 실행은 유일한 법정동이 체크포인트로 스킵돼 remaining=0 → 조회 0회 → 매칭 0 인데,
    # 그건 "시도 0회"라 정상이므로 silent failure 가드가 건너뛰고 completed 가 된다
    # (가드의 remaining 조건 — test_silent_failure_guard_skips_when_nothing_to_scan 참조).
    job = db.query(CrawlJob).filter(
        CrawlJob.job_type == "official_price", CrawlJob.id != prev.id
    ).one()
    assert job.status == "completed", "시도 0회 재개가 '전량 매칭 실패'로 오판됐다"
    assert "잔여" not in (job.error_message or ""), "이미 저장된 단지가 소실로 잡혀 거짓 경보가 났다"


def test_repass_rescues_complex_lost_by_dead_previous_run(db, seeded, monkeypatch):
    """재개 실행이 **이어받은 동**의 소실 단지를 구제한다 (B1, 세션 379 은마 실증).

    1차 잡이 동 660개를 처리한 뒤 재수집 패스 **전에** 죽으면, 2차는 체크포인트로 그
    660동을 스킵한다. 1차에서 드리프트로 탈락한 단지는 1차도(죽어서) 2차도(관할 밖
    이라) 줍지 않아 영구 미갱신으로 남는다 — 은마(236단지)가 실제로 그렇게 됐다.

    fixture 두 축 분리: 이어받은 동을 재조회했는지(호출 횟수)와 그 결과가 실제로
    저장됐는지(price_median 변화)를 따로 본다 — 재조회만 하고 저장이 안 되는 경우가
    호출 횟수만으로는 통과해 버리기 때문이다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    from crawler.service_common import _checkpoint
    from utils import utcnow

    prev = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                    status="failed", started_at=utcnow())
    db.add(prev)
    db.commit()
    _checkpoint.save(db, prev.id, {"done_ld_codes": ["1168010600"], "total": 1})

    # 사슬 시작(지금)보다 훨씬 이전 = 사슬 안에서 아무도 못 붙였다 = 소실
    _seed_prior_row(db, seeded, days_ago=30)

    complete = make_rows_for_complex(aphus_nm="은마", ho_count=10, base_price=2_700_000_000)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices", side_effect=[complete]
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 1, (
        "이어받은 동의 소실 단지를 재조회하지 않았다 = 재개 사각(세션 379 은마) 미해소"
    )

    saved = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.complex_no == seeded
    ).one()
    assert saved.price_median > 1_000_000_000, "재조회는 했으나 새 값이 저장되지 않았다"

    job = db.query(CrawlJob).filter(
        CrawlJob.job_type == "official_price", CrawlJob.id != prev.id
    ).one()
    assert job.status == "completed"
    assert "잔여" not in (job.error_message or ""), "구제됐으므로 잔여 문구가 없어야 한다"


def test_repass_inherited_cutoff_uses_dong_owner_not_latest_job(db, seeded, monkeypatch):
    """동의 컷오프는 그 동을 **처음 완료한** 잡의 started_at 이다 (연속 2회 사망 대비).

    Z(3시간 전 시작) → A(1시간 전 시작) → 이번, 두 번 연속 사망한 상황. 문제의 동은
    Z 가 처음 완료했으므로(A 는 체크포인트로 상속만 했다) 컷오프는 Z.start 다. Z 가
    2시간 전에 저장한 단지는 그 컷오프 이후라 정상 매칭인데, 기준을 최신 잡
    (A.start=1시간 전)으로 잡으면 "컷오프 이전 저장" = 소실로 오판돼 재조회가 돌고
    임계 초과 오탐까지 간다.

    두 축 분리: 시각 간격을 3h / 2h / 1h 로 서로 다르게 벌려, 어느 잡을 소유자로
    보는지가 결과를 실제로 가르게 만든다(우연 일치 회피).
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    from datetime import timedelta

    from crawler.service_common import _checkpoint
    from utils import utcnow

    now = utcnow()
    job_z = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                     status="failed", started_at=now - timedelta(hours=3))
    db.add(job_z)
    db.commit()
    _checkpoint.save(db, job_z.id, {"done_ld_codes": ["1168010600"], "total": 1})

    job_a = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                     status="failed", started_at=now - timedelta(hours=1))
    db.add(job_a)
    db.commit()
    _checkpoint.save(db, job_a.id, {"done_ld_codes": ["1168010600"], "total": 1})

    # Z 가 저장한 단지 — 동 소유자 Z 의 컷오프(3h 전) 이후이나 A 시작(1h 전) 보다는 이전.
    _seed_prior_row(db, seeded, days_ago=0, minutes_ago=120)

    with patch("crawler.vworld_price_api.fetch_official_prices") as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 0, (
        "동 컷오프를 최신 잡 기준으로 잡아 Z 가 저장한 단지를 소실로 오판했다"
    )

    job = db.query(CrawlJob).filter(
        CrawlJob.job_type == "official_price",
        CrawlJob.id.notin_([job_z.id, job_a.id]),
    ).one()
    assert job.status == "completed"
    assert "잔여" not in (job.error_message or "")


def test_repass_inherited_cutoff_is_per_dong_owner(db, monkeypatch):
    """동별 컷오프 — 사슬 전체의 min(started_at) 하나로 자르면 새는 단지가 있다.

    적대검증이 잡은 시나리오(세션 380):
      · 실패 O(70h 전 시작, 체크포인트 {D0})
      · 그 사이 **완료된** 실행 C 가 단지 X(동 D1, D1 ∉ {D0})를 저장(60h 전)
      · 실패 R(30분 전 시작)이 72h 내라 O 의 옛 체크포인트를 상속하고 D1 을 새로
        처리하다 X 를 드리프트로 놓치고 사망(체크포인트 {D0, D1})
      · 이번 실행이 R 을 이어받음

    단일 min 컷오프면 D1 의 기준이 O.start(70h 전)가 돼 X 의 저장 시각(60h 전)이 그
    뒤라 "사슬이 이미 매칭함"으로 오판 → X 를 영영 못 줍는다. D1 을 **처음 완료한**
    잡은 R 이므로 정답 컷오프는 R.start(30분 전)이고, 그러면 X 가 소실로 잡힌다.

    두 축 분리 (testing.md): 동을 2개 두고 저장 시각도 65h / 60h 로 다르게 벌린다 —
    D0(소유자 O, 컷오프 70h 전)의 단지 Y 는 65h 전 저장이라 정상이고, D1(소유자 R,
    컷오프 30분 전)의 단지 X 만 소실이다. 두 동이 같은 컷오프를 공유하면(단일 min·
    단일 max 어느 쪽이든) 반드시 한쪽이 틀리므로, setdefault 오름차순 귀속이
    실제로 동작해야만 통과한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    from datetime import timedelta

    from crawler.service_common import _checkpoint
    from utils import utcnow

    now = utcnow()
    # D0 = 1168010600 (Y 소속), D1 = 1168010700 (X 소속)
    db.add(Complex(complex_no="Y", complex_name="와이아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="X", complex_name="엑스아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    job_o = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                     status="failed", started_at=now - timedelta(hours=70))
    db.add(job_o)
    db.commit()
    _checkpoint.save(db, job_o.id, {"done_ld_codes": ["1168010600"], "total": 2})

    # R 은 O 의 체크포인트를 상속한 채 D1 을 새로 처리하다 죽었다 → 누적 {D0, D1}
    job_r = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                     status="failed", started_at=now - timedelta(minutes=30))
    db.add(job_r)
    db.commit()
    _checkpoint.save(
        db, job_r.id, {"done_ld_codes": ["1168010600", "1168010700"], "total": 2}
    )

    # Y — O 가 저장(65h 전). D0 컷오프(70h 전) 이후라 정상, 재조회 대상 아님.
    _seed_prior_row(db, "Y", days_ago=0, minutes_ago=65 * 60)
    # X — 사이의 완료 실행 C 가 저장(60h 전). D1 컷오프(30분 전) 이전이라 소실.
    _seed_prior_row(db, "X", days_ago=0, minutes_ago=60 * 60)

    complete = make_rows_for_complex(aphus_nm="엑스", ho_count=10, base_price=2_700_000_000)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices", side_effect=[complete]
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 1, (
        "동별 컷오프 미동작 — 0회면 X 를 못 주웠고(단일 min), 2회면 Y 까지 소실로"
        " 오판했다(단일 최신 컷오프)"
    )

    saved = {row.complex_no: row for row in db.query(ComplexOfficialPrice).all()}
    assert saved["X"].price_median > 1_000_000_000, "X 가 재수집으로 갱신되지 않았다"
    assert saved["Y"].price_median == 1_000_000_000, "Y 는 건드리지 말아야 한다"

    job = db.query(CrawlJob).filter(
        CrawlJob.job_type == "official_price",
        CrawlJob.id.notin_([job_o.id, job_r.id]),
    ).one()
    assert job.status == "completed"
    assert "잔여" not in (job.error_message or "")


def test_repass_cutoff_map_limited_to_inherited_dongs(db, monkeypatch):
    """컷오프 맵은 **이어받은 동**으로 한정된다 — 이번 실행이 직접 조회할 동은 제외.

    옛 실패잡 O 의 체크포인트에는 있지만 최신 실패잡 R 에는 없는 동이 있을 수 있다
    (R 이 O 를 상속하지 않고 새로 시작한 경우). done_ld_codes 는 R 것만 이어받으므로
    그 동은 이번 실행이 **직접 조회**하고, 소실 판정도 `_find_regressed_targets`
    관할이다. 컷오프 맵을 한정하지 않으면 같은 단지가 양쪽 판정에 걸려 중복 계상되고
    (잔여 보고가 부풀려지고 임계 초과에도 가까워진다), 조회한 동을 또 재조회한다.

    두 축 분리: D_only_O(=1168010600, O 에만 있음 → 이번에 직접 조회) 와
    D_inherited(=1168010700, R 에 있음 → 스킵) 를 두고, 전자의 단지 P 는 이번
    본루프에서 **드리프트로 탈락**시킨다(호수 8/세대수 10). 그러면 P 는
    `_find_regressed_targets` 가 소실로 잡아 그 동을 정확히 1회 재조회하는데,
    컷오프 맵이 한정되지 않으면 P 가 이어받은 동 판정에도 **중복**으로 잡혀
    잔여 보고가 2단지로 부풀고 임계에도 그만큼 가까워진다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    from datetime import timedelta

    from crawler.service_common import _checkpoint
    from utils import utcnow

    now = utcnow()
    db.add(Complex(complex_no="P", complex_name="피아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="Q", complex_name="큐아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    # 같은 동의 정상 매칭 단지 — 전량 미매칭이면 silent failure 가드가 (정당하게)
    # failed 로 끊어 이 테스트의 '일부만 소실' 상황이 성립하지 않는다.
    db.add(Complex(complex_no="H", complex_name="정상아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    # O — 옛 잡, D_only_O 만 완료. R 은 이걸 상속하지 않았다.
    job_o = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                     status="failed", started_at=now - timedelta(hours=10))
    db.add(job_o)
    db.commit()
    _checkpoint.save(db, job_o.id, {"done_ld_codes": ["1168010600"], "total": 2})

    # R — 최신 잡, D_inherited 만 완료 (done_ld_codes 는 이것만 이어받는다).
    job_r = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                     status="failed", started_at=now - timedelta(minutes=30))
    db.add(job_r)
    db.commit()
    _checkpoint.save(db, job_r.id, {"done_ld_codes": ["1168010700"], "total": 2})

    # P 의 과거 행 — O 컷오프(10h 전)보다 이전이라, 맵이 한정 안 되면 이어받은 동
    # 판정에도 중복으로 걸린다(정상 관할은 _find_regressed_targets 다).
    _seed_prior_row(db, "P", days_ago=30)
    # Q 는 R 이 저장(사슬 안 정상 매칭) → 이어받은 동에서 소실 아님.
    _seed_prior_row(db, "Q", days_ago=0, minutes_ago=10)

    # P 는 본루프·재수집 모두 드리프트(호 8 < 세대수 10 게이트 탈락) → 끝까지 잔여.
    # H 는 완전 데이터라 정상 매칭 (silent failure 가드 회피).
    drifted = (
        make_rows_for_complex(aphus_nm="피", ho_count=8)
        + make_rows_for_complex(aphus_code="AH", aphus_nm="정상", ho_count=10)
    )

    # 이번 실행은 D_only_O(1168010600)만 조회 → 본루프 1회 + 소실 재수집 시도 상한만큼.
    # (P 는 어느 표본에서도 호 8건이라 합집합을 떠도 끝까지 게이트 탈락 = 시도 소진)
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted] * (1 + _REPASS_MAX_ATTEMPTS),
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 1 + _REPASS_MAX_ATTEMPTS, (
        "본루프 1회 + 소실 동 재수집 시도 상한만큼이어야 한다"
    )

    job = db.query(CrawlJob).filter(
        CrawlJob.job_type == "official_price",
        CrawlJob.id.notin_([job_o.id, job_r.id]),
    ).one()
    assert job.status == "completed"
    assert "잔여 1단지" in (job.error_message or ""), (
        "본루프 관할 단지가 이어받은 동 판정에도 걸려 중복 계상됐다"
        f" (실제: {job.error_message})"
    )


def test_repass_inherited_dong_restores_claimed_from_db(db, monkeypatch):
    """이어받은 동에서도 사슬이 이미 배정한 그룹을 재수집 2차가 다시 집지 않는다.

    `test_repass_inherits_claimed_from_main_loop` 의 재개판 — 그쪽은 본루프
    `claimed_by_dong` 이 인계원이지만, 재개 실행에서는 그 동을 이번 실행이 조회조차
    안 해 인계할 것이 메모리에 없다. DB 의 (aphus_code, max(collected_at)) 로 복원하지
    않으면 재수집 2차가 C1 의 그룹(A1)을 C2 에 다시 배정해 이중 배정이 된다.

    두 축 분리: C2 의 과거 행 aphus_code 를 "OLD" 로 심어, 이번 실행이 A1 을 **새로**
    배정했는지만 보게 한다(기본값 A1 그대로면 오염 여부를 구분할 수 없다).
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    from datetime import timedelta

    from crawler.service_common import _checkpoint
    from utils import utcnow

    db.add(Complex(complex_no="C1", complex_name="광동상가", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="C2", complex_name="광동", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    prev = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                    status="failed", started_at=utcnow() - timedelta(hours=1))
    db.add(prev)
    db.commit()
    _checkpoint.save(db, prev.id, {"done_ld_codes": ["1168010600"], "total": 1})

    # 죽은 잡이 C1 에 A1 그룹을 배정하고 저장했다 (사슬 시작 이후 = 이미 매칭).
    _seed_prior_row(db, "C1", days_ago=0, minutes_ago=30, aphus_code="A1")
    # C2 는 지난달 행뿐 = 사슬 시작 이전 = 소실 대상.
    _seed_prior_row(db, "C2", days_ago=30, aphus_code="OLD")

    rows = make_rows_for_complex(aphus_code="A1", aphus_nm="광동상가", ho_count=10)

    # C2 는 1차 완전일치 후보가 없고 2차는 claimed 로 막히므로 끝까지 pending —
    # 시도 상한(_REPASS_MAX_ATTEMPTS)까지 합집합을 키워 본 뒤 포기한다.
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[rows] * _REPASS_MAX_ATTEMPTS,
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == _REPASS_MAX_ATTEMPTS, (
        "소실(C2) 감지로 이어받은 동을 시도 상한만큼 재조회해야 한다"
    )

    saved = {row.complex_no: row for row in db.query(ComplexOfficialPrice).all()}
    assert saved["C2"].aphus_code == "OLD", (
        "재수집 2차가 사슬이 C1 에 배정한 그룹(A1)을 다시 가져갔다 = 이중 배정"
    )
    # 구제 실패이므로 잔여로 보고돼야 한다 (조용히 오매칭으로 덮이지 않았다는 증거)
    job = db.query(CrawlJob).filter(
        CrawlJob.job_type == "official_price", CrawlJob.id != prev.id
    ).one()
    assert job.status == "completed"
    assert "잔여 1단지" in (job.error_message or "")
    assert "C2" in (job.error_message or "")


def test_repass_ignores_prior_rows_from_other_year(db, seeded, monkeypatch):
    """작년 행만 있는 단지는 소실이 아니다 — 올해 공시 미발표 시 오탐 폭발 방지.

    연도 무필터면 연초 실행에서 작년 행 보유 단지가 전부 소실로 잡히고, 영구 미매칭
    단지가 매달 재판정돼 경보 피로를 만든다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded, stdr_year="2025")  # 작년 행만 보유
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, healthy],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2, "작년 행만 있는 단지 때문에 재수집이 돌면 안 된다"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert not (job.error_message or ""), "작년 행 보유가 소실로 오판됐다"


def test_repass_excludes_fetch_failed_dongs(db, seeded, monkeypatch):
    """본 루프 조회 실패 동의 단지는 '매칭 소실'이 아니다 — 원인은 API 다운.

    실패 동을 소실로 분류하면 진단 문구가 매칭 문제로 나와 원인 추적을 어긋나게 한다.
    실패 자체는 failed_ld_codes 로 이미 계상된다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)  # 1168010600 = 조회 실패시킬 동
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    # 1168010600: 1차+재시도 모두 None(실패) / 1168010700: 정상
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[None, None, healthy],
    ) as mock_fetch, patch("crawler.service_official_price.time.sleep"):
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 3, "실패 동(1차+재시도) + 정상 동 = 3회. 재수집은 0회여야"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert not (job.error_message or ""), "조회 실패 동이 매칭 소실로 오분류됐다"
    # total_items = processed(1) + failed(1) — 본 루프 실패만 반영, 재수집 실패 계상 없음
    assert job.total_items == 2


def test_repass_exception_does_not_fail_the_job(db, seeded, monkeypatch):
    """재수집 중 예외가 나도 본 수집 결과는 살린다 (구제는 best-effort).

    감싸지 않으면 outer except 로 빠져 job 이 failed 가 되고, 거의 전량 완료된
    체크포인트가 잔존해 다음 달 실행이 그걸 이어받아 거의 아무것도 안 하게 된다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, healthy, RuntimeError("V-WORLD 폭발")],
    ):
        collect_official_prices(stdr_year=_YEAR)

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed", "재수집 예외가 본 수집 성공을 실패로 뒤집었다"
    assert job.processed_items == 1, "본 루프에서 매칭한 정상 단지는 보존돼야 한다"

    saved = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.complex_no == "C9"
    ).count()
    assert saved == 1, "본 루프 저장분이 롤백됐다"


def test_repass_bails_out_on_collapse(db, monkeypatch):
    """소실이 임계를 넘으면 재수집 자체를 생략 — 드리프트가 아니라 시스템 이상.

    임계를 넘는 소실은 매칭 규칙 붕괴·API 구조 변경이라 재조회가 구제가 아니라 폭주다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    monkeypatch.setattr(
        "crawler.service_official_price._REPASS_COLLAPSE_THRESHOLD", 2
    )
    # 소실 후보 3개(임계 2 초과) + 매칭 성공 1개(silent failure 가드 회피)
    for i in range(3):
        db.add(Complex(complex_no=f"L{i}", complex_name=f"소실{i}아파트",
                       cortar_no="1168010600", real_estate_type_code="APT",
                       total_household_count=10))
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    for i in range(3):
        _seed_prior_row(db, f"L{i}")

    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    # 1168010600 은 아무것도 매칭 안 되는 데이터 → 3단지 전부 소실
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[make_rows_for_complex(aphus_nm="무관단지", ho_count=10), healthy],
    ) as mock_fetch, patch("services.telegram.send_telegram") as mock_send:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2, "임계 초과인데 재수집이 돌았다"
    # 붕괴는 시스템 이상 신호라 error_message 만으론 부족 — 텔레그램으로 승격
    assert mock_send.call_count == 1, "붕괴 이탈인데 텔레그램 알림이 안 나갔다"
    # 단언 의도("기준치를 넘은 이상 상황임이 알림에 드러나는가")는 그대로.
    # 세션 408 에 "임계 초과" 를 쉬운 말로 바꿨다("평소 N곳을 넘으면 이상으로 봅니다").
    sent = mock_send.call_args[0][0]
    assert "이상으로 봅니다" in sent, f"기준 초과라는 뜻이 안 드러난다: {sent}"
    assert "중간에 멈췄어요" in sent, f"수집이 중단됐다는 뜻이 안 드러난다: {sent}"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert "임계" in (job.error_message or ""), "붕괴 사실이 기록되지 않았다"


# ── 7-3. 재수집 벽시계 캡 (_REPASS_MAX_SECONDS, 세션 371) ──
#
# 현실 소실은 한 자릿수라 재수집이 수 분에 끝나지만, 이론 최악(대형 동 20개)은 ~1.8h 다.
# 1h 로 끊어 "본 루프 최악 7h + 재수집 1h = 8h < 16h(monitor stale 예외)" 여유를 지킨다.


def _fake_time(*values):
    """수집기 모듈의 `time` 이름 바인딩을 통째로 대체할 페이크 객체.

    ⚠ 공유 time **모듈**을 패치하지 않는다 — `time.monotonic` 을 직접 갈아끼우면 테스트가
    도는 동안 프로세스 전역 monotonic 이 페이크가 돼, 무관한 컴포넌트가 한 번만 호출해도
    시퀀스가 어긋나는 취약 구조가 된다. 모듈-로컬 이름만 바꾸면 service_official_price
    안의 time.* 호출만 영향받고 전역 time 모듈은 무손상이다.

    monotonic 은 호출 순서대로 값을 주고 소진되면 마지막 값을 유지한다(실제 경과 시간에
    의존하지 않는 게 핵심 — 테스트 시각 하드코딩 금지 답습). sleep 은 no-op — 법정동
    단위 재시도 경로(time.sleep(2))가 타면 테스트가 실제로 멈추지 않게 한다.
    """
    from types import SimpleNamespace

    seq = list(values)

    def _monotonic():
        return seq.pop(0) if len(seq) > 1 else seq[0]

    return SimpleNamespace(monotonic=_monotonic, sleep=lambda _s: None)


def test_repass_stops_when_wall_clock_cap_exceeded(db, monkeypatch):
    """캡 초과 시 남은 법정동은 재조회하지 않고, 그 단지는 잔여 보고에 합류한다.

    소실 단지를 서로 다른 법정동 2개에 두고 첫 동 재수집 직후 시간이 캡을 넘게 만든다.
    두 번째 동은 조회조차 되면 안 되고(호출 카운트), 구제 못 한 단지는 error_message
    잔여 목록에 남아야 하며, job 은 (일부 소실이므로) completed 를 유지해야 한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    # 소실 후보 2개(서로 다른 동) + 매칭 성공 1개(silent failure 가드 회피)
    db.add(Complex(complex_no="L1", complex_name="소실일아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="L2", complex_name="소실이아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010800",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    _seed_prior_row(db, "L1")
    _seed_prior_row(db, "L2")

    # 본 루프: 두 소실 동은 호수 부족(게이트 탈락), 세 번째 동만 정상 매칭
    drift1 = make_rows_for_complex(aphus_code="A1", aphus_nm="소실일", ho_count=8)
    drift2 = make_rows_for_complex(aphus_code="A2", aphus_nm="소실이", ho_count=8)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)
    # 재수집에서 첫 동은 완전 데이터(구제 성공) — 캡이 아니라 데이터 때문에 실패한 게
    # 아님을 분명히 하려고 성공시킨다. 두 번째 동은 캡에 막혀 아예 조회되지 않아야 한다.
    rescue1 = make_rows_for_complex(aphus_code="A1", aphus_nm="소실일", ho_count=10)

    # 재수집 시작 시각 0 → 첫 동 처리 전 체크 0(통과) → 두 번째 동 체크에서 캡 초과
    monkeypatch.setattr(
        "crawler.service_official_price.time", _fake_time(0, 0, 10_000)
    )

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drift1, drift2, healthy, rescue1],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 4, (
        "본 루프 3개 동 + 재수집 1개 동이어야 한다 — 캡 초과인데 두 번째 동을 재조회했다"
    )

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed", "일부 소실은 전량 실패가 아니라 completed 유지"
    # 캡으로 못 주운 단지는 별도 채널이 아니라 기존 잔여 보고로 자연 합류해야 한다
    assert "잔여 1단지" in (job.error_message or "")
    assert "L2" in (job.error_message or ""), "캡에 막힌 단지가 잔여 목록에 없다"
    assert "L1" not in (job.error_message or ""), "캡 전에 구제된 단지가 잔여로 잡혔다"


def test_repass_completes_all_dongs_when_within_cap(db, monkeypatch):
    """시간이 캡 안이면 캡은 아무 영향이 없다 — 전 법정동 재수집·구제 성공.

    (기본 구제 경로 자체는 test_repass_rescues_regressed_complex 가 이미 커버하므로,
    여기서는 '동이 2개일 때도 캡 미발동이면 둘 다 돈다'만 추가로 단언한다.)
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="L1", complex_name="소실일아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="L2", complex_name="소실이아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    _seed_prior_row(db, "L1")
    _seed_prior_row(db, "L2")

    drift1 = make_rows_for_complex(aphus_code="A1", aphus_nm="소실일", ho_count=8)
    drift2 = make_rows_for_complex(aphus_code="A2", aphus_nm="소실이", ho_count=8)
    rescue1 = make_rows_for_complex(aphus_code="A1", aphus_nm="소실일", ho_count=10)
    rescue2 = make_rows_for_complex(aphus_code="A2", aphus_nm="소실이", ho_count=10)

    # 시각 고정 — 경과 0 이라 캡 조건이 절대 참이 되지 않는다
    monkeypatch.setattr("crawler.service_official_price.time", _fake_time(0))

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drift1, drift2, rescue1, rescue2],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 4, "캡 미발동인데 재수집이 중간에 끊겼다"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert job.processed_items == 2, "두 단지 모두 재수집으로 구제돼야 한다"
    assert not (job.error_message or ""), "전부 구제됐으므로 잔여 문구가 없어야 한다"


# ── 7-4. 재수집 다중 표본 합집합 (_REPASS_MAX_ATTEMPTS, 세션 413) ──
#
# V-WORLD 는 같은 법정동을 다시 조회할 때마다 **다른** (dongNm,hoNm) 부분집합을 준다
# (2026-09-17 프로브: 은마 4,424세대에 대해 연속 3회 유니크 호 4,356/3,597/3,199, 누적
# 합집합 4,424 = 100%). 한 표본만 보면 단발 통과율이 ~1/3 이지만, 표본마다 빠뜨리는 호가
# 달라 누적 합집합은 빠르게 세대수에 수렴한다. 아래 테스트는 그 합집합 구제와 조기 중단·
# 시도 상한·None 섞임·캡·2차 우선순위·진단 로그를 각각 본다.
#
# ⚠ fixture 축 분리 — 동 수(1~2) ≠ 시도 상한(3) ≠ 대상 단지 수(1~2) 로 일부러 어긋나게
# 둔다. 세 축이 우연히 같으면 카운터를 뒤바꿔 써도 테스트가 통과한다(testing.md 답습).


def _rows_ho_range(start, end, *, aphus_code="A1", aphus_nm="은마", area="84.43"):
    """호 번호 [start, end) 구간의 행 — 표본마다 다른 호 부분집합을 만들기 위한 팩토리.

    V-WORLD 드리프트 재현용: 같은 단지(aphusCode)인데 담긴 호 집합만 다른 표본을 만든다.
    """
    return [
        make_row(aphus_code=aphus_code, aphus_nm=aphus_nm, dong="1", ho=str(ho),
                 area=area, price=2_000_000_000 + ho)
        for ho in range(start, end)
    ]


def test_repass_union_of_two_failing_samples_rescues(db, monkeypatch):
    """핵심 — 각각은 게이트 탈락인 두 표본이 **합집합**으로는 통과해 구제된다.

    세대수 20(게이트 [19,21]) 단지에 재수집 표본 A=호 16건(0.80배 탈락),
    B=호 8건(0.40배 탈락)을 준다. 두 표본의 호 구간이 겹치면서도 어긋나 합집합은
    정확히 20건 → 1.00배 통과. 저장된 ho_count 가 합집합 수와 같아야, 최신 표본만
    색인하는 구현(합집합 아님)과 구분된다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="U1", complex_name="은마아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=20))
    db.commit()
    _seed_prior_row(db, "U1")

    # 본루프 표본: 호 4건뿐 → 탈락(소실 판정 유도)
    main_sample = _rows_ho_range(100, 104)
    # 재수집 1회차: 호 100~115 = 16건 (16/20 = 0.80 탈락)
    sample_a = _rows_ho_range(100, 116)
    # 재수집 2회차: 호 112~119 = 8건 (8/20 = 0.40 탈락) — 겹침 4건 + 신규 4건
    sample_b = _rows_ho_range(112, 120)
    # 합집합 = 호 100~119 = 20건 → 1.00배 통과

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[main_sample, sample_a, sample_b],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 3, "본루프 1회 + 재수집 2회(2회차에 합집합으로 구제)"

    saved = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.complex_no == "U1"
    ).one()
    assert saved.ho_count == 20, (
        "합집합(20호)이 아니라 마지막 표본만 저장됐다"
        f" — 실제 ho_count={saved.ho_count}"
    )

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert job.processed_items == 1
    assert "잔여" not in (job.error_message or ""), "합집합으로 구제됐으므로 잔여가 없어야 한다"


def test_repass_stops_fetching_once_all_targets_rescued(db, monkeypatch):
    """조기 중단 — 첫 재조회로 그 동의 대상이 전부 구제되면 더 뜨지 않는다.

    합집합 도입이 평시 실행의 호출 수를 3배로 늘리면 안 된다. 대상 단지 2개(축을
    시도 상한 3·동 1개와 다르게)를 한 표본으로 전부 구제하고, 재수집 호출이 정확히
    1회인지 본다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="E1", complex_name="가아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="E2", complex_name="나아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    _seed_prior_row(db, "E1")
    _seed_prior_row(db, "E2")

    drifted = (
        make_rows_for_complex(aphus_code="A1", aphus_nm="가", ho_count=8)
        + make_rows_for_complex(aphus_code="A2", aphus_nm="나", ho_count=8)
    )
    complete = (
        make_rows_for_complex(aphus_code="A1", aphus_nm="가", ho_count=10)
        + make_rows_for_complex(aphus_code="A2", aphus_nm="나", ho_count=10)
    )

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, complete],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2, (
        "전부 구제됐는데 남은 시도까지 조회했다 = 평시 호출량이 시도 상한배로 늘어난다"
    )

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.processed_items == 2
    assert not (job.error_message or "")


def test_repass_gives_up_after_attempt_cap(db, monkeypatch):
    """시도 상한 — 끝내 구제 못 하면 정확히 _REPASS_MAX_ATTEMPTS 회만 조회하고 잔여로 남는다.

    (동 1개 · 대상 2개 · 시도 3회 — 세 축을 어긋나게 둬 카운터 혼동을 차단)
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="X1", complex_name="영영아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="X2", complex_name="이이아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    # 다른 동의 정상 단지 — 전량 미매칭이면 silent failure 가드가 정당하게 failed 로 끊는다
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    _seed_prior_row(db, "X1")
    _seed_prior_row(db, "X2")

    drifted = (
        make_rows_for_complex(aphus_code="A1", aphus_nm="영영", ho_count=8)
        + make_rows_for_complex(aphus_code="A2", aphus_nm="이이", ho_count=8)
    )
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        # 재수집 표본을 상한보다 1회 더 준비한다 — 상한을 넘겨 조회하면 StopIteration 이
        # 아니라 **호출 횟수 단언**에서 걸리게 해 실패 원인이 분명해진다.
        side_effect=[drifted, healthy] + [drifted] * (_REPASS_MAX_ATTEMPTS + 1),
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2 + _REPASS_MAX_ATTEMPTS, (
        "재수집이 시도 상한을 넘어 조회했다"
    )

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert "잔여 2단지" in (job.error_message or ""), f"실제: {job.error_message}"
    assert "X1" in (job.error_message or "") and "X2" in (job.error_message or "")


def test_repass_none_in_the_middle_keeps_accumulated_rows(db, monkeypatch):
    """중간 조회 실패(None)는 누적을 버리지 않는다 — 다음 회차가 누적분과 합집합을 이룬다.

    재수집 1회차 = 호 16건(탈락) → 2회차 = None(실패) → 3회차 = 호 8건.
    3회차만 보면 0.40배 탈락이라, 1회차 누적이 살아 있어야만(합집합 20건) 구제된다.
    조회 실패가 있었어도 그 동이 결국 한 번이라도 성공했으면 repass_fetch_failed 는
    올라가지 않고, failed_ld_codes/total_items 도 오염되지 않아야 한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="N1", complex_name="은마아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=20))
    db.commit()
    _seed_prior_row(db, "N1")

    main_sample = _rows_ho_range(100, 104)
    sample_a = _rows_ho_range(100, 116)   # 16건 (0.80 탈락)
    sample_c = _rows_ho_range(112, 120)   # 8건 (0.40 탈락) — 누적과 합쳐야 20건

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[main_sample, sample_a, None, sample_c],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 4, "본루프 1회 + 재수집 3회(성공·실패·성공)"

    saved = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.complex_no == "N1"
    ).one()
    assert saved.ho_count == 20, (
        "None 회차가 누적 행을 날려 마지막 표본만 남았다"
        f" — 실제 ho_count={saved.ho_count}"
    )

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert job.processed_items == 1
    # 본 루프 조회 실패 0 → total_items = processed(1) + failed(0). 재수집의 None 이
    # 여기 섞이면 2 가 된다 = 카운터 오염.
    assert job.total_items == 1, "재수집 중간 실패가 failed_ld_codes 에 합산됐다"
    assert not (job.error_message or ""), "구제됐으므로 잔여 문구가 없어야 한다"


def test_repass_all_attempts_none_counts_dong_once(db, seeded, monkeypatch, caplog):
    """한 동의 조회가 전부 실패해도 '조회 못 한 동'은 1개로만 센다 (회차마다 세지 않는다).

    repass_fetch_failed 의 뜻은 "재수집을 아예 못 뜬 **동**의 수"다. 회차마다 올리면
    시도 상한배(3)로 부풀어 완료 로그의 뜻이 달라진다. 카운터 자체는 내부 변수라 완료
    로그 문구로 검증한다(동 1개 · 시도 3회 — 축이 달라야 혼동이 드러난다).
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    with caplog.at_level("INFO", logger="crawler.service_official_price"):
        with patch(
            "crawler.vworld_price_api.fetch_official_prices",
            side_effect=[drifted, healthy] + [None] * _REPASS_MAX_ATTEMPTS,
        ) as mock_fetch:
            collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2 + _REPASS_MAX_ATTEMPTS

    done = [r.getMessage() for r in caplog.records if "완료: 단지" in r.getMessage()]
    assert done, "완료 로그가 없다"
    assert "재수집 조회실패 1개" in done[-1], (
        f"동 1개인데 회차 수({_REPASS_MAX_ATTEMPTS})만큼 부풀려 셌다: {done[-1]}"
    )


def test_repass_wall_clock_cap_stops_between_attempts(db, monkeypatch):
    """벽시계 캡이 **회차 사이**에 터지면 그 동은 더 조회하지 않는다.

    1회차로는 구제 못 하는 표본을 주고, 1회차 직후 시각이 캡을 넘게 만든다.
    2·3회차 조회가 아예 없어야 하며(호출 카운트), 못 구제한 단지는 잔여 보고에 남는다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="W1", complex_name="은마아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=20))
    # 다른 동 정상 단지 — silent failure 가드 회피
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    _seed_prior_row(db, "W1")

    main_sample = _rows_ho_range(100, 104)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)
    sample_a = _rows_ho_range(100, 116)   # 0.80배 탈락 — 2회차가 있었다면 구제됐을 표본
    sample_b = _rows_ho_range(112, 120)   # (캡 때문에 소비되지 않아야 한다)

    # monotonic 호출 순서: repass_start(0) → 동 경계 체크(0, 통과) → 2회차 직전 체크(10_000, 캡 초과)
    monkeypatch.setattr(
        "crawler.service_official_price.time", _fake_time(0, 0, 10_000)
    )

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[main_sample, healthy, sample_a, sample_b],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 3, (
        "본루프 2개 동 + 재수집 1회차까지여야 한다 — 캡 초과인데 2회차를 조회했다"
    )

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert "잔여 1단지" in (job.error_message or "")
    assert "W1" in (job.error_message or "")


def test_repass_secondary_runs_once_after_union_and_yields_to_exact_match(db, monkeypatch):
    """2차(부분일치)는 최종 합집합에서 **한 번만** 돌고, 1차 완전일치가 우선한다.

    공시 그룹은 "꿈에그린상가"(A1, 진짜 20호) 하나뿐이고 우리 단지는 둘이다:
      · S1 "꿈에그린상가" 세대수 20 — 1차 완전일치 대상. **합집합이 20 이 돼야** 통과.
      · S2 "신당꿈에그린" 세대수 16 — 완전일치 이름이 없어 2차 부분포함(동명 프리픽스)
        대상. 세대수가 16 이라 **1회차 부분표본(16호)에서는 게이트를 통과**하고,
        합집합이 완성된 20호에서는 16/20=0.80 으로 탈락한다.

    ⚠ 이 세대수 배치가 이 테스트의 전부다(축 분리): S2 의 게이트 통과 여부가 표본 크기에
    따라 **뒤집히게** 잡아야, 2차를 회차마다 돌릴 때와 마지막에 한 번만 돌릴 때의 결과가
    갈린다. 두 단지 세대수를 같게 두면(옛 버전) 부분표본에서 S2 도 함께 탈락해 순서가
    결과에 아무 영향을 못 준다 = 장식 테스트.
    또 S1·S2 의 alt 정규화 키가 달라야 한다("꿈에그린" vs "신당꿈에그린") — 같으면 2차의
    (a') 이름-쌍둥이 규칙이 부분포함 경로를 통째로 막아 역시 순서가 드러나지 않는다.

    회차마다 2차를 돌리면: 1회차에 S2 가 A1 을 선점 → 2회차 합집합에서 S1 의 **1차**가
    (1차는 claimed 를 안 본다) 같은 A1 을 또 가져가 **이중 배정**. 2차를 최종 합집합에서
    한 번만 돌리면: S1 이 1차로 A1 을 갖고, S2 는 게이트 탈락으로 잔여에 남는다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="S1", complex_name="꿈에그린상가", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=20))
    db.add(Complex(complex_no="S2", complex_name="신당꿈에그린", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=16))
    db.commit()
    # 두 단지 모두 과거 행 보유 = 재수집 대상. aphus_code 는 이번 실행과 무관한 값으로
    # 심어(두 축 우연 일치 함정) "이번에 A1 을 새로 배정했는지"만 보게 한다.
    _seed_prior_row(db, "S1", aphus_code="OLD1")
    _seed_prior_row(db, "S2", aphus_code="OLD2")

    nm = "꿈에그린상가"
    main_sample = _rows_ho_range(100, 104, aphus_nm=nm)      # 4호 — 둘 다 탈락(소실 유도)
    sample_a = _rows_ho_range(100, 116, aphus_nm=nm)         # 16호 — S1 탈락 / S2 는 통과
    sample_b = _rows_ho_range(112, 120, aphus_nm=nm)         # 합집합 20호 → S1 통과
    # 2회차에 S1 이 구제돼도 S2 가 아직 pending 이라 조기 중단은 안 걸린다(3회차까지 간다).
    sample_c = _rows_ho_range(100, 120, aphus_nm=nm)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[main_sample, sample_a, sample_b, sample_c],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 1 + _REPASS_MAX_ATTEMPTS, (
        "S2 가 끝까지 pending 이므로 시도 상한까지 돈다(조기 중단은 전원 구제 시에만)"
    )

    saved = {row.complex_no: row for row in db.query(ComplexOfficialPrice).all()}
    # A1 의 주인은 이름이 정확히 같은 S1 이어야 한다
    assert saved["S1"].aphus_code == "A1", (
        "합집합 완성 후 1차 완전일치가 A1 을 가져가야 하는데,"
        " 부분표본의 2차가 먼저 선점했다"
    )
    assert saved["S1"].ho_count == 20, "1차가 붙은 시점의 합집합(20호)으로 저장돼야 한다"
    # S2 는 이번 실행에서 아무것도 저장하지 못했어야 한다 — 과거 행이 그대로.
    # (2차를 회차마다 돌리면 S2 가 부분표본으로 A1 을 집어 16호짜리 행이 저장된다)
    assert saved["S2"].aphus_code == "OLD2", (
        "부분표본의 2차가 A1 을 선점했다 = S1 과 이중 배정"
    )
    assert saved["S2"].ho_count == 10, (
        "S2 에 이번 실행의 행이 새로 저장됐다 — 2차가 부분표본에서 돌았다는 뜻"
    )

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert "잔여 1단지" in (job.error_message or "")
    assert "S2" in (job.error_message or "")


def test_repass_exact_hit_without_saved_rows_retries_on_next_attempt(db, monkeypatch):
    """1차 완전일치가 붙었는데 저장 행이 0 이면 다음 회차에서 1차로 다시 시도한다.

    옛 코드는 n_saved==0 일 때 그 대상을 repass_unmatched 에 넣지 않고 넘겨(=그 fetch
    에서 끝) 2차로도 떨어뜨리지 않았다. 합집합에서는 "다음 회차 1차 재시도" 라는 새
    기회가 생기므로 pending 에 남기되, 2차 대상에서는 계속 빼 둔다(exact_hit_unsaved).

    구성: 1회차 공시 행은 가격이 전부 0 이라 세대수 게이트는 통과하지만(ho_keys 유효)
    저장 행이 0 이다. 2회차에 정상 가격 행이 합류하면 같은 그룹이 제대로 저장돼야 한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="Z1", complex_name="은마아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    _seed_prior_row(db, "Z1", aphus_code="OLD")

    # 본루프: 호 8건 → 게이트 탈락(소실 판정 유도)
    main_sample = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    # 재수집 1회차: 호 10건이라 게이트는 통과하지만 가격이 전부 0 → 저장 행 0
    # (_to_price 가 None 을 주고 aggregate_area_medians 가 전부 버린다)
    zero_priced = [
        make_row(aphus_code="A1", aphus_nm="은마", dong="1", ho=str(100 + i), price=0)
        for i in range(10)
    ]
    # 재수집 2회차: 같은 호에 정상 가격 — 합집합의 유효 행이 생겨 저장된다
    priced = make_rows_for_complex(aphus_nm="은마", ho_count=10, base_price=3_000_000_000)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[main_sample, zero_priced, priced],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 3, (
        "저장 0 인 대상을 pending 에서 빼 버려 2회차 재시도가 없었다"
    )

    saved = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.complex_no == "Z1"
    ).one()
    assert saved.aphus_code == "A1", "2회차 합집합에서 1차가 다시 붙어 저장돼야 한다"
    assert saved.price_median >= 3_000_000_000, (
        "가격 0 행만 반영됐다 — 2회차 유효 행이 합류하지 않았다"
    )

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert "잔여" not in (job.error_message or "")


def test_repass_commits_each_dong_so_later_exception_keeps_earlier_rescue(db, monkeypatch):
    """동 하나가 끝날 때마다 커밋 — 뒤쪽 동의 예외가 앞선 동의 구제를 롤백하면 안 된다.

    재수집 패스 전체가 best-effort try/except(+`db.rollback()`) 안이라, 커밋이 패스 끝에만
    있으면 두 번째 동에서 예외가 날 때 첫 동의 저장분까지 되돌아간다. 그런데 rescued·
    matched_complexes·saved_rows 는 파이썬 변수라 롤백되지 않아 "구제했다"고 보고하면서
    DB 에는 없는 상태가 된다. 동당 최대 3회 조회로 그 창이 3배가 됐다.

    축 분리: 소실 동 2개 · 시도 상한 3 · 구제 대상 1+1 — 숫자가 서로 달라야 카운터 혼동이
    드러난다. 첫 동은 1회차에 구제(조기 중단), 두 번째 동의 첫 조회에서 예외를 던진다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="D1", complex_name="가아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="D2", complex_name="나아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    _seed_prior_row(db, "D1", aphus_code="OLD1")
    _seed_prior_row(db, "D2", aphus_code="OLD2")

    drift1 = make_rows_for_complex(aphus_code="A1", aphus_nm="가", ho_count=8)
    drift2 = make_rows_for_complex(aphus_code="A2", aphus_nm="나", ho_count=8)
    rescue1 = make_rows_for_complex(aphus_code="A1", aphus_nm="가", ho_count=10)

    # 본루프 2동(둘 다 드리프트 탈락) → 재수집: 1168010600 구제 성공(1회) → 1168010700 예외
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drift1, drift2, rescue1, RuntimeError("V-WORLD 폭발")],
    ):
        collect_official_prices(stdr_year=_YEAR)

    saved = {row.complex_no: row for row in db.query(ComplexOfficialPrice).all()}
    assert saved["D1"].aphus_code == "A1", (
        "두 번째 동의 예외가 첫 동의 구제를 롤백했다 — 카운터는 구제했다고 하는데 DB 엔 없다"
    )
    assert saved["D2"].aphus_code == "OLD2", "예외가 난 동은 당연히 그대로"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed", "재수집 예외가 본 수집 성공을 실패로 뒤집었다"


def test_repass_sleeps_between_failed_attempts_but_not_after_the_last(db, seeded, monkeypatch):
    """조회 실패 뒤 다음 회차가 남았을 때만 2초 쉰다 (본 루프 재시도와 같은 간격).

    실패 직후 곧바로 다시 찌르면 같은 이유(일시 네트워크 오류·rate limit)로 또 실패하기
    쉽다. 반대로 마지막 회차 뒤에는 더 뜰 게 없으므로 자면 순수 낭비다.
    축: 시도 3회 · 실패 3회 · 기대 sleep 2회 — 셋이 다 달라 off-by-one 이 드러난다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, healthy] + [None] * _REPASS_MAX_ATTEMPTS,
    ), patch("crawler.service_official_price.time.sleep") as mock_sleep:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_sleep.call_count == _REPASS_MAX_ATTEMPTS - 1, (
        f"실패 {_REPASS_MAX_ATTEMPTS}회에 sleep 은 {_REPASS_MAX_ATTEMPTS - 1}회여야 한다"
        f" (마지막 회차 뒤엔 자지 않는다) — 실제 {mock_sleep.call_count}회"
    )
    assert all(call.args == (2,) for call in mock_sleep.call_args_list), (
        f"본 루프 재시도와 같은 2초여야 한다: {mock_sleep.call_args_list}"
    )


def test_repass_does_not_sleep_on_success_path(db, seeded, monkeypatch):
    """조회가 성공하면 회차 사이에 자지 않는다 — 간격은 실패 뒤 완충일 뿐이다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    complete = make_rows_for_complex(aphus_nm="은마", ho_count=10)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, complete],
    ), patch("crawler.service_official_price.time.sleep") as mock_sleep:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_sleep.call_count == 0, (
        f"성공 경로인데 {mock_sleep.call_count}회 잤다 — 월 1회 잡의 시간 예산 낭비"
    )


# ── 7-5. 누적 중복 제거 (_extend_unique, 세션 413 리뷰 반영) ──
#
# V-WORLD 는 호마다 완전 동일한 행을 2회 준다(세션 376). 재수집이 같은 동을 3회 뜨면
# 대치동 기준 누적이 ~147,000 dict 라 메모리·재색인 비용이 헛되이 커진다. 파이프라인이
# 읽는 필드가 전부 같은 행은 합집합의 의미를 안 바꾸므로 누적 시점에 거른다.


def test_extend_unique_skips_identical_rows_across_attempts():
    """완전히 같은 행은 두 번 누적되지 않는다 (표본이 겹치는 부분 = 같은 행)."""
    acc: list = []
    seen: set = set()

    first = make_rows_for_complex(ho_count=3)
    added1 = _extend_unique(acc, seen, first)
    # 같은 표본을 그대로 다시 — V-WORLD 의 행 2회 반환 + 표본 겹침 재현
    added2 = _extend_unique(acc, seen, list(first))

    assert added1 == 3
    assert added2 == 0, "같은 행이 또 누적됐다"
    assert len(acc) == 3, f"누적이 중복으로 불었다: {len(acc)}"


def test_repass_accumulation_uses_dedupe_at_the_call_site(db, seeded, monkeypatch, caplog):
    """호출부도 dedupe 를 쓴다 — 헬퍼 단위 테스트만으론 `acc_rows.extend()` 회귀를 못 잡는다.

    회차 로그가 찍는 "누적 N건" 으로 확인한다: 1회차 8행, 2회차에 **같은 8행**이 다시 오면
    누적은 8 이어야 한다(그냥 extend 면 16). 축 분리 — 호 8 · 회차 2 · 기대 누적 8.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    with caplog.at_level("INFO", logger="crawler.service_official_price"):
        with patch(
            "crawler.vworld_price_api.fetch_official_prices",
            # 재수집 3회차 모두 **완전히 같은** 표본 — 누적은 8 에서 더 늘면 안 된다
            side_effect=[drifted, healthy] + [list(drifted)] * _REPASS_MAX_ATTEMPTS,
        ), patch("crawler.service_official_price.time.sleep"):
            collect_official_prices(stdr_year=_YEAR)

    lines = [r.getMessage() for r in caplog.records if "회차: 행" in r.getMessage()]
    assert len(lines) == _REPASS_MAX_ATTEMPTS, f"회차 로그가 모자라다: {lines}"
    assert "누적 8건" in lines[-1], (
        f"마지막 회차 누적이 8 이 아니다 = 호출부가 dedupe 없이 extend 했다: {lines[-1]}"
    )


def test_extend_unique_keeps_same_ho_with_different_price():
    """같은 호라도 가격·면적이 다르면 **버리지 않는다** (집계의 '유효한 첫 행' 성질 보존).

    aggregate_area_medians 는 같은 _ho_key 의 유효한 첫 행을 쓴다 — 앞 복제본이 깨져
    있으면 뒤의 멀쩡한 복제본이 살아남아야 하므로, 여기서 호 키만 보고 거르면 손실이다.
    """
    acc: list = []
    seen: set = set()

    broken = make_row(ho="101", price=0)          # 가격 0 = 집계에서 무효
    fixed = make_row(ho="101", price=2_700_000_000)  # 같은 호, 멀쩡한 가격

    _extend_unique(acc, seen, [broken])
    added = _extend_unique(acc, seen, [fixed])

    assert added == 1, "같은 호의 다른 가격 행이 중복으로 잘렸다 = 집계 손실"
    assert len(acc) == 2
    # 실제 집계가 뒤의 멀쩡한 행을 살려내는지까지 확인
    assert aggregate_area_medians(acc) == [(Decimal("84.43"), 2_700_000_000, 1)]


def test_extend_unique_tolerates_unhashable_field_values():
    """값에 list 가 섞여도 죽지 않는다 — frozenset(row.items()) 였다면 TypeError.

    이 함수는 best-effort 블록 안에서 도므로, 여기서 예외가 나면 재수집 패스가 통째로
    날아간다(그 실행의 구제 전량 소실). 명시 필드 튜플이라 무관한 필드는 손대지 않는다.
    """
    acc: list = []
    seen: set = set()
    row = make_row(ho="101")
    row["someList"] = [1, 2, 3]  # V-WORLD 가 언젠가 배열 필드를 추가해도 안전해야 한다

    assert _extend_unique(acc, seen, [row]) == 1
    assert len(acc) == 1


def test_repass_logs_gate_ratio_for_unrescued_target(db, seeded, monkeypatch, caplog):
    """미구제 단지는 '게이트를 몇 배 차이로 놓쳤는지'가 로그 한 줄로 남는다.

    다음 달 실행이 "합집합을 더 키우면 될 일"인지 아닌지 판단하려면, 이름 후보 그룹의
    합집합 호수와 세대수 대비 비율이 필요하다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    drifted = make_rows_for_complex(aphus_nm="은마", ho_count=8)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    with caplog.at_level("WARNING", logger="crawler.service_official_price"):
        with patch(
            "crawler.vworld_price_api.fetch_official_prices",
            side_effect=[drifted, healthy] + [drifted] * _REPASS_MAX_ATTEMPTS,
        ):
            collect_official_prices(stdr_year=_YEAR)

    lines = [r.getMessage() for r in caplog.records if "재수집 미구제" in r.getMessage()]
    assert len(lines) == 1, f"미구제 단지 1개인데 진단 줄이 {len(lines)}개다: {lines}"
    line = lines[0]
    assert seeded in line and "은마아파트" in line, f"단지 식별 정보가 없다: {line}"
    assert "세대수 10" in line, f"세대수가 없다: {line}"
    assert "이름 후보 1그룹" in line, f"후보 그룹 수가 없다: {line}"
    # 합집합 호수 8 / 세대수 10 = 0.800배 — 게이트(±5%)를 얼마나 놓쳤는지가 드러나야 한다
    assert "호8(0.800배)" in line, f"합집합 호수·비율이 없다: {line}"


def test_repass_logs_rename_suspicion_when_no_name_candidate(db, seeded, monkeypatch, caplog):
    """이름 후보가 아예 없으면 '개명 의심'으로 구분해 남긴다.

    후보가 0개면 표본을 더 떠도 못 붙으므로 처방이 다르다(재시도 증설 vs 이름 보정).
    '게이트를 X% 차이로 놓침'과 섞이면 다음 달 실행이 엉뚱한 처방을 고른다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _seed_prior_row(db, seeded)
    db.add(Complex(complex_no="C9", complex_name="정상아파트", cortar_no="1168010700",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    # 같은 동인데 우리 단지명(은마)과 일치하는 공시 단지명이 하나도 없다 = 개명 상황
    renamed = make_rows_for_complex(aphus_code="AZ", aphus_nm="은마리버뷰", ho_count=10)
    healthy = make_rows_for_complex(aphus_code="A9", aphus_nm="정상", ho_count=10)

    with caplog.at_level("WARNING", logger="crawler.service_official_price"):
        with patch(
            "crawler.vworld_price_api.fetch_official_prices",
            side_effect=[renamed, healthy] + [renamed] * _REPASS_MAX_ATTEMPTS,
        ):
            collect_official_prices(stdr_year=_YEAR)

    lines = [r.getMessage() for r in caplog.records if "재수집 미구제" in r.getMessage()]
    assert len(lines) == 1, f"미구제 단지 1개인데 진단 줄이 {len(lines)}개다: {lines}"
    assert "이름 그룹 없음(개명 의심)" in lines[0], f"개명 구분이 안 된다: {lines[0]}"
    assert seeded in lines[0]


def test_silent_failure_guard_skips_when_nothing_to_scan(db, seeded, monkeypatch):
    """조회할 법정동이 0개인 재개 실행은 '시도 0회'라 매칭 0 이 정상 — failed 아님.

    전량-done 체크포인트를 이어받으면 본 루프가 no-op 이라 matched=0 이 되는데, 이를
    '전량 매칭 실패'와 구분하지 않으면 정상 재개가 failed 로 오판된다(세션 370 리뷰어
    2차 함정의 뿌리). 가드가 remaining 조건까지 보는지 확인한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    from crawler.service_common import _checkpoint
    from utils import utcnow

    # 72h 이내 실패 job + 전 법정동(seeded 단지의 동) 완료 체크포인트 → remaining=0
    prev = CrawlJob(job_type="official_price", scheduler_job_id="collect_official_prices",
                    status="failed", started_at=utcnow())
    db.add(prev)
    db.commit()
    _checkpoint.save(db, prev.id, {"done_ld_codes": ["1168010600"], "total": 1})

    with patch("crawler.vworld_price_api.fetch_official_prices") as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 0, "전량 완료 체크포인트인데 다시 조회했다"

    job = db.query(CrawlJob).filter(
        CrawlJob.job_type == "official_price", CrawlJob.id != prev.id
    ).one()
    assert job.status == "completed", "시도 0회 재개가 '전량 매칭 실패'로 오판됐다"
    assert "매칭 실패" not in (job.error_message or "")


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


# ── 9. 행수 정합성 가드 (은마 미매칭 실사고 회귀) ──

def _patch_pages(monkeypatch, page_size, page_fn):
    """_fetch_page 를 대체하고 PAGE_SIZE 를 줄여 페이지 루프를 짧게 만든다."""
    from crawler import vworld_price_api

    monkeypatch.setattr(vworld_price_api, "PAGE_SIZE", page_size)
    monkeypatch.setattr(vworld_price_api, "_fetch_page", page_fn)
    return vworld_price_api


def test_fetch_returns_rows_when_count_matches(monkeypatch):
    """정상 — 수신 행수가 totalCount 와 정확히 같으면 그대로 반환."""
    def fake_page(pnu, year, page_no):
        return [make_row(ho=f"{page_no}-1"), make_row(ho=f"{page_no}-2")], 4

    vp = _patch_pages(monkeypatch, 2, fake_page)
    rows = vp.fetch_official_prices("1168010600", _YEAR)

    assert rows is not None
    assert len(rows) == 4


def test_fetch_returns_none_when_rows_fewer_than_total_count(monkeypatch):
    """모자란 응답 → None.

    2026-08-09 은마(4,424세대) 미매칭 실사고 회귀 가드. 페이지가 통째로 실패한 게 아니라
    '성공했는데 몇 행 모자란' 응답이라 기존 방어망을 그대로 통과했고, 대형 단지가 뒷
    페이지에 몰려 있어 호수 부족 → 세대수 ±5% 게이트에서 조용히 탈락했다.
    """
    def fake_page(pnu, year, page_no):
        # totalCount=4 라고 해놓고 2페이지는 1건만 준다 (총 3행 != 4행)
        if page_no == 1:
            return [make_row(ho="1-1"), make_row(ho="1-2")], 4
        return [make_row(ho="2-1")], 4

    vp = _patch_pages(monkeypatch, 2, fake_page)

    assert vp.fetch_official_prices("1168010600", _YEAR) is None


def test_fetch_returns_none_when_rows_exceed_total_count(monkeypatch):
    """초과도 비정상 → None (마지막 페이지 반복 반환 등 중복 누적 → 중위값 왜곡)."""
    def fake_page(pnu, year, page_no):
        return [make_row(ho=f"{page_no}-1"), make_row(ho=f"{page_no}-2")], 3

    vp = _patch_pages(monkeypatch, 2, fake_page)

    assert vp.fetch_official_prices("1168010600", _YEAR) is None


def test_fetch_zero_rows_still_returns_empty_list(monkeypatch):
    """0건 조기 반환 경로는 정합성 가드 대상이 아니다 — 빈 리스트 유지."""
    vp = _patch_pages(monkeypatch, 2, lambda p, y, n: ([], 0))

    assert vp.fetch_official_prices("1168010600", _YEAR) == []


def test_fetch_returns_none_when_total_count_unparseable(monkeypatch):
    """totalCount=0 인데 rows 가 있는 기형 응답도 None — 총량을 모르면 완전성 증명 불가."""
    def fake_page(pnu, year, page_no):
        return [make_row(ho="1-1")], 0  # 파싱 실패 시 _fetch_page 가 0 을 돌려준다

    vp = _patch_pages(monkeypatch, 2, fake_page)

    assert vp.fetch_official_prices("1168010600", _YEAR) is None


def test_collect_name_secondary_pass_saves_unmatched_complex(db, monkeypatch):
    """본루프에서 1차 미매칭인 단지가 이름 2차 패스로 저장된다 (PR-E3 통합).

    fixture 설계(testing.md 답습): 같은 법정동에 단지 2개를 둔다 — C1 은 1차 완전일치로,
    C2 는 표기 차이(공시 "성서주공(2단지)" ↔ 우리 "성서주공2차")라 2차로만 붙는다.
    세대수도 서로 다르게(10 vs 20) 둬서 두 단지가 상대 그룹으로 교차 매칭되는 사고를
    세대수 게이트가 실제로 막는지까지 함께 검증한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="C1", complex_name="은마아파트", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="C2", complex_name="성서주공2차", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=20))
    db.commit()

    rows = (
        make_rows_for_complex(aphus_code="A1", aphus_nm="은마", ho_count=10)
        + make_rows_for_complex(aphus_code="A2", aphus_nm="성서주공(2단지)", ho_count=20,
                                area="59.98")
    )

    with _patch_fetch(rows):
        collect_official_prices(stdr_year=_YEAR)

    saved = {row.complex_no: row for row in db.query(ComplexOfficialPrice).all()}
    assert set(saved) == {"C1", "C2"}, "2차 매칭 단지(C2)가 저장되지 않았다"
    assert saved["C1"].aphus_code == "A1", "1차 매칭 단지가 다른 그룹에 붙었다"
    assert saved["C2"].aphus_code == "A2", "2차가 엉뚱한 그룹을 골랐다"
    assert saved["C2"].ho_count == 20

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert job.processed_items == 2, "1차·2차 매칭 단지가 모두 매칭 수에 반영돼야 한다"


def test_collect_name_secondary_does_not_steal_primary_group(db, monkeypatch):
    """2차는 1차가 가져간 그룹을 뺏지 않는다 — claimed 제외가 통합 경로에서도 유효.

    우리 단지 두 개("광동" / "광동상가")가 공시 "광동상가" 그룹 하나를 두고 겹친다.
    1차는 "광동상가" 를 완전일치로 가져가고, 남은 "광동" 은 2차 후보이지만 그 그룹이
    이미 claimed 라 붙으면 안 된다(붙으면 한쪽은 반드시 오매칭).
    세대수를 둘 다 10 으로 맞춰 **게이트가 아니라 claimed 가** 막는 것임을 분명히 한다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="C1", complex_name="광동상가", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="C2", complex_name="광동", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()

    rows = make_rows_for_complex(aphus_code="A1", aphus_nm="광동상가", ho_count=10)

    with _patch_fetch(rows):
        collect_official_prices(stdr_year=_YEAR)

    saved = {row.complex_no for row in db.query(ComplexOfficialPrice).all()}
    assert saved == {"C1"}, "2차가 1차 매칭 단지의 그룹을 중복 사용했다(오매칭)"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.processed_items == 1


def test_repass_inherits_claimed_from_main_loop(db, monkeypatch):
    """재수집 패스의 2차는 본루프가 이미 배정한 그룹을 다시 가져가지 않는다 (MEDIUM-1).

    적대검증이 잡은 이중 배정 시나리오: 본루프에서 C1("광동상가")이 공시 "광동상가"
    그룹(A1)을 1차 완전일치로 가져간다. 같은 동의 C2("광동")는 과거 행이 있어 재수집
    대상('소실')이 되는데, 재수집 fetch 에서 repass_claimed 가 빈 set 으로 시작하면
    2차 매칭이 A1 을 **다시** 집어 C1·C2 두 단지가 같은 공시 그룹을 공유한다 —
    한쪽은 필연 오매칭이고 월 1회 잡이라 매달 고착된다.

    fixture 두 축 분리: 세대수는 둘 다 10 으로 맞춰(게이트가 아니라 claimed 인계가
    막는 것임을 분명히) 두고, 저장 여부라는 별개 축으로 판정한다.
    ⚠ C2 의 과거 행 aphus_code 를 기본값 "A1" 그대로 두면, 이중 배정이 일어나든 말든
    조회 결과가 "A1" 이라 판정이 무의미해진다(두 축 우연 일치 함정). 과거 행은 이번
    실행과 무관한 코드("OLD")로 심어 **이번 실행이 A1 을 새로 배정했는지**만 본다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    db.add(Complex(complex_no="C1", complex_name="광동상가", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.add(Complex(complex_no="C2", complex_name="광동", cortar_no="1168010600",
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    # C2 를 재수집 '소실' 대상으로 만든다 (과거 행 보유). aphus_code 는 A1 과 구분되게.
    from datetime import timedelta

    from utils import utcnow

    db.add(ComplexOfficialPrice(
        complex_no="C2", stdr_year=_YEAR, prvuse_ar=Decimal("84.43"),
        price_median=1_000_000_000, ho_count=10, aphus_code="OLD", aphus_nm="광동",
        collected_at=utcnow() - timedelta(days=30),
    ))
    db.commit()

    rows = make_rows_for_complex(aphus_code="A1", aphus_nm="광동상가", ho_count=10)

    # 본루프 1회(C1 매칭·C2 미매칭) → C2 소실 판정 → 같은 동 재수집. C2 는 1차 후보가
    # 없고 2차는 claimed 로 막히므로 시도 상한까지 합집합을 키워 본 뒤 포기한다.
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[rows] * (1 + _REPASS_MAX_ATTEMPTS),
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 1 + _REPASS_MAX_ATTEMPTS, (
        "본루프 1회 + 소실 동 재수집 시도 상한만큼"
    )

    saved = {row.complex_no: row for row in db.query(ComplexOfficialPrice).all()}
    assert saved["C1"].aphus_code == "A1", "본루프 1차 매칭분이 보존돼야 한다"
    # C2 의 행은 과거 그대로("OLD")여야 한다 — 이번 실행이 A1 을 새로 배정했다면 오염이다
    assert saved["C2"].aphus_code == "OLD", (
        "재수집 2차가 본루프에서 배정된 그룹(A1)을 다시 가져갔다 = 이중 배정"
    )
    # 구제 실패이므로 잔여로 보고돼야 한다 (조용히 오매칭으로 덮이지 않았다는 증거)
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert "잔여 1단지" in (job.error_message or "")
    assert "C2" in (job.error_message or "")


def test_fetch_returns_none_when_exceeding_max_pages(monkeypatch):
    """MAX_PAGES 캡 초과 → 정합성 가드 오발이 아니라 전용 분기로 포기.

    캡에 걸리면 len(rows) < totalCount 가 정상이라 가드가 오발할 수 있다. 결과는 같은
    '불완전 스냅샷'이라 동일하게 포기하되, 원인이 다르므로 별도 분기·로그로 구분한다.
    """
    from crawler import vworld_price_api

    monkeypatch.setattr(vworld_price_api, "MAX_PAGES", 2)

    def fake_page(pnu, year, page_no):
        # totalCount=10 (PAGE_SIZE=2 → 5페이지 필요) 인데 캡이 2페이지
        return [make_row(ho=f"{page_no}-1"), make_row(ho=f"{page_no}-2")], 10

    vp = _patch_pages(monkeypatch, 2, fake_page)

    assert vp.fetch_official_prices("1168010600", _YEAR) is None


# ── 10. 호 중복 행 dedupe (V-WORLD 가 호마다 동일 행 2회 반환 — 2026-08-22 실측) ──

def test_aggregate_area_medians_counts_unique_ho_not_rows():
    """표본 수(ho_count)는 원본 행 수가 아니라 유니크 호 개수여야 한다.

    V-WORLD 는 같은 (dongNm,hoNm) 을 완전 동일 행으로 2번 반환하며, 중복은 연속이
    아니라 섞여 있다. 중위값은 중복에 불변이지만 len(prices) 로 세면 2배가 된다.
    """
    a = make_row(area="84.43", price=100, ho="101")
    b = make_row(area="84.43", price=200, ho="102")
    c = make_row(area="84.43", price=300, ho="103")
    d = make_row(area="59.98", price=50, ho="104")
    # 섞인 순서 (연속 중복이 아님)
    rows = [a, b, c, d, a, b, c, d]

    result = aggregate_area_medians(rows)

    assert result == [(Decimal("59.98"), 50, 1), (Decimal("84.43"), 200, 3)]


def test_aggregate_area_medians_uses_valid_copy_when_first_duplicate_invalid():
    """같은 호의 첫 복제본이 깨져 있어도(면적 빈값) 뒤의 멀쩡한 복제본으로 집계한다 — 호 유실 방지.

    실측 복제본은 완전 동일이라 현재는 도달 안 하는 분기지만, '본 것' 등록을 유효성 검사 뒤에
    두는 이유를 테스트로 박아 둔다(앞에 두면 101호가 통째로 사라져 [(84.43, 300, 1)] 이 된다).
    """
    rows = [
        make_row(area="", price=100, ho="101"),       # 깨진 복제본
        make_row(area="84.43", price=300, ho="102"),
        make_row(area="84.43", price=100, ho="101"),  # 멀쩡한 복제본
    ]

    result = aggregate_area_medians(rows)

    assert result == [(Decimal("84.43"), 200, 2)]


def test_group_rows_sum_ho_count_equals_ho_keys():
    """불변식: 모든 행이 유효하면 sum(ho_count) == len(group['ho_keys'])."""
    rows = make_rows_for_complex(ho_count=10)
    grouped = _group_by_aphus(rows + rows)
    group = grouped["A1"]

    assert len(group["rows"]) == 20, "그룹의 원본 행은 중복 그대로 담긴다 (fetch 정합성 축)"
    assert len(group["ho_keys"]) == 10

    areas = aggregate_area_medians(group["rows"])
    assert sum(ho_count for _, _, ho_count in areas) == len(group["ho_keys"]) == 10


def test_collect_saves_unique_ho_count_when_vworld_duplicates_rows(db, seeded, monkeypatch):
    """V-WORLD 호마다 동일 행 2회 반환(2026-08-22 실측) 회귀 가드 — 저장 ho_count 는 유니크 호 수."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    rows = make_rows_for_complex(aphus_nm="은마", ho_count=10, area="84.43")
    dup = rows + rows

    with _patch_fetch(dup):
        collect_official_prices(stdr_year=_YEAR)

    saved = db.query(ComplexOfficialPrice).all()
    assert len(saved) == 1
    assert saved[0].complex_no == seeded
    assert saved[0].ho_count == 10, "원본 행 수(20)가 아니라 유니크 호 수(10)"

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"


def test_resume_lookback_limit_covers_long_failure_chain(db, monkeypatch):
    """재개 조회 상한(RESUME_LOOKBACK_LIMIT) — 72h 창의 실패 잡이 10건을 넘어도
    **동별 소유잡 사슬**이 끊기지 않는다 (세션 391, 백로그 §5-D).

    상한이 10 이던 시절의 구조 결함:
      · 재개 후보 조회는 `ORDER BY id DESC LIMIT N` 이라, 실패가 N건을 넘으면
        **가장 오래된 잡부터** 조회에서 밀려난다.
      · 그런데 동별 컷오프(inherited_cutoff_by_dong)는 "그 동을 **처음 완료한** 잡"의
        started_at 이어야 한다(세션 380 B3). 소유 잡이 밀려나면 그 동의 컷오프가
        더 최신 잡으로 오채택되고, 소유 잡 직후에 정상 저장된 단지가 "컷오프 이전
        저장" = 소실로 오판돼 불필요한 재조회(V-WORLD 호출)와 잔여 보고가 생긴다.

    시나리오: 72h 창 안에 실패 잡 12건. 문제의 동 D_owned 를 처음 완료한 잡은 **가장
    오래된 J1**(70h 전)이고, J2~J12 는 체크포인트로 상속만 했다. J1 이 68h 전에 저장한
    단지 Y 는 소유잡 컷오프(70h 전) 이후라 정상이다. 상한이 10 이면 J1·J2 가 조회에서
    잘려 D_owned 컷오프가 J3.start(60h 전)로 오채택 → Y 가 소실로 오판된다.

    두 축 분리 (testing.md): ① 잡 시각을 70h·66h·60h·…·1h 로 서로 다르게 벌리고
    ② 동 코드도 잡마다 다르게 준다 — "몇 번째 잡이냐"와 "어느 동이냐"가 우연히 같은
    값으로 겹치지 않아, 어느 잡을 소유자로 보는지가 결과를 실제로 가른다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")

    from datetime import timedelta

    from crawler.service_common import _checkpoint
    from utils import utcnow

    now = utcnow()
    job_count = 12
    dong_owned = "1168010600"  # J1 이 처음 완료한 동 — Y 소속

    # Y — D_owned 의 단지. 소유잡 J1(70h 전) 직후인 68h 전에 저장됐다.
    db.add(Complex(complex_no="Y", complex_name="와이아파트", cortar_no=dong_owned,
                   real_estate_type_code="APT", total_household_count=10))
    db.commit()
    _seed_prior_row(db, "Y", days_ago=0, minutes_ago=68 * 60)

    # 잡 시각: J1=70h 전 … J12=1h 전 (서로 다른 간격 — 두 축 분리)
    hours_ago = [70, 66, 60, 53, 47, 41, 34, 28, 23, 17, 9, 1]
    assert len(hours_ago) == job_count

    prior_jobs = []
    done_so_far = [dong_owned]
    for idx, hours in enumerate(hours_ago):
        prev = CrawlJob(job_type="official_price",
                        scheduler_job_id="collect_official_prices",
                        status="failed", started_at=now - timedelta(hours=hours))
        db.add(prev)
        db.commit()
        if idx > 0:
            # 잡마다 자기 몫의 동을 추가로 완료 — 동 코드 꼬리를 07,09,11… 로 띄워
            # "몇 번째 잡"과 "어느 동"이 우연히 같은 숫자가 되지 않게 한다(두 축 분리).
            done_so_far.append(f"116801{5 + idx * 2:02d}00")
        _checkpoint.save(db, prev.id, {"done_ld_codes": list(done_so_far),
                                       "total": len(done_so_far)})
        prior_jobs.append(prev)

    prior_ids = [j.id for j in prior_jobs]

    with patch("crawler.vworld_price_api.fetch_official_prices") as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 0, (
        "재개 조회 상한이 낮아 가장 오래된 소유잡(J1)이 잘렸다 — D_owned 컷오프가"
        " 더 최신 잡으로 오채택돼 정상 저장된 Y 를 소실로 오판했다"
    )

    job = db.query(CrawlJob).filter(
        CrawlJob.job_type == "official_price",
        CrawlJob.id.notin_(prior_ids),
    ).one()
    assert job.status == "completed"
    assert "잔여" not in (job.error_message or "")
