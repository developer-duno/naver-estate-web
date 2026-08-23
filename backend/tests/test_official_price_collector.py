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

    # 법정동 오름차순(1168010600=은마, 1168010700=정상) → 본 루프 2회, 재수집은 은마 1회
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, healthy, drifted],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 3, "본 루프 2개 법정동 + 소실 1개 법정동 재수집"

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

    # 본 루프: 은마(드리프트 성공)·정상(성공) → 재수집: 은마 조회 실패(None)
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, healthy, None],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 3

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

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, healthy, drifted],
    ), patch("services.telegram.send_telegram") as mock_send:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_send.call_count == 1, "잔여 미매칭인데 텔레그램 알림이 안 나갔다"
    sent = mock_send.call_args[0][0]
    assert "잔여" in sent and seeded in sent, f"알림 본문에 잔여 단지가 없다: {sent}"


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

    # 이번 실행은 D_only_O(1168010600)만 조회 → 본루프 1회 + 소실 재수집 1회 = 2회.
    with patch(
        "crawler.vworld_price_api.fetch_official_prices", side_effect=[drifted, drifted]
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2, "본루프 1회 + 소실 동 재수집 1회여야 한다"

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

    with patch(
        "crawler.vworld_price_api.fetch_official_prices", side_effect=[rows]
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 1, "소실(C2) 감지로 이어받은 동을 1회 재조회해야 한다"

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
    assert "임계" in mock_send.call_args[0][0]

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

    # 본루프 1회(C1 매칭·C2 미매칭) → C2 소실 판정 → 같은 동 재수집 1회
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[rows, rows],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_YEAR)

    assert mock_fetch.call_count == 2, "본루프 1회 + 소실 동 재수집 1회"

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
