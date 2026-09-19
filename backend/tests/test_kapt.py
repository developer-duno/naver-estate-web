"""K-apt 관리비 연동 테스트 (V051) — 매칭 3중 게이트 · 합산 · API · silent failure 가드.

외부 API 호출은 전부 mock — 실제 data.go.kr 호출 0 (conftest 의 외부발송 봉쇄 관례 답습).
"""

from datetime import datetime, timezone

import pytest

from crawler import kapt_api, service_kapt
from crawler.kapt_api import KaptApiError
from crawler.service_kapt import (
    _substring_related,
    candidate_cost_months,
    collect_kapt_costs,
    household_within_tolerance,
    match_kapt_complexes,
    name_similarity,
    normalize_complex_name,
    ordinal_ambiguous,
    ordinal_conflict,
    ordinal_tokens,
    pick_best_match,
)
from db.models import Complex, KaptComplexMap, KaptManagementCost
from routers.complexes import _kapt_cost_cache


@pytest.fixture(autouse=True)
def _clear_kapt_cache():
    """모듈 전역 TTLCache 를 테스트마다 비운다 (test_subway.py 선례 답습).

    conftest 의 setup_db 는 services.cache 레지스트리(get_cache 로 만든 것)만 비우는데
    이 캐시는 official-prices·subway 와 같이 모듈 전역 TTLCache(...) 라 레지스트리에
    없다 → 테이블을 drop 해도 같은 complex_no 면 이전 테스트 응답이 그대로 돌아온다.
    (실제로 이 픽스처 없이 404 테스트가 200 을 받아 발견됨.)
    """
    _kapt_cost_cache._store.clear()
    yield
    _kapt_cost_cache._store.clear()


def _make_complex(db, complex_no="1001", name="경희궁의아침4단지",
                  cortar_no="1111011800", households=120, type_code="APT"):
    cpx = Complex(
        complex_no=complex_no,
        complex_name=name,
        cortar_no=cortar_no,
        real_estate_type_code=type_code,
        total_household_count=households,
    )
    db.add(cpx)
    db.commit()
    return cpx


def _kapt(code="A10021295", name="경희궁의아침4단지", bjd="1111011800", households=None):
    row = {"kaptCode": code, "kaptName": name, "bjdCode": bjd}
    if households is not None:
        row["kaptdaCnt"] = households
    return row


# ─────────────────────────── 이름 정규화 · 유사도 ───────────────────────────


def test_normalize_strips_parens_spaces_and_apt_suffix():
    """괄호 기호·공백·'아파트' 접미사는 지우되 괄호 안 차수는 남긴다."""
    assert normalize_complex_name("경희궁의아침 (4단지) 아파트") == "경희궁의아침4단지"
    assert normalize_complex_name(None) == ""


def test_normalize_keeps_number_inside_parens():
    """괄호 '안의 내용'을 통째로 지우면 1단지·4단지가 같아져 형제 오매칭이 난다.

    구현 중 이 테스트로 실제 결함을 잡았다(초기 정규식이 괄호 내용을 삭제).
    """
    assert normalize_complex_name("경희궁의아침(4단지)") == "경희궁의아침4단지"
    assert normalize_complex_name("경희궁의아침(1단지)") != normalize_complex_name(
        "경희궁의아침(4단지)"
    )


def test_normalize_keeps_sibling_number():
    """차수 숫자를 지우면 형제 단지가 100% 일치해버린다 — 남는지 직접 단언."""
    assert normalize_complex_name("래미안1차") != normalize_complex_name("래미안4차")
    assert name_similarity("래미안1차", "래미안4차") < 1.0


def test_name_similarity_ignores_notation_difference():
    """표기만 다른 같은 단지는 높은 유사도."""
    assert name_similarity("경희궁의아침4단지", "경희궁의아침(4단지)") == 1.0


# ─────────────────────────── 게이트 ② 이름 유사도 ───────────────────────────


def test_gate_name_similarity_below_threshold_rejected(db):
    """이름이 전혀 다르면 같은 법정동이어도 탈락."""
    cpx = _make_complex(db)
    assert pick_best_match(cpx, [_kapt(name="전혀다른이름타워", households=120)]) is None


def test_gate_name_tie_rejected(db):
    """최고점 동률이 둘 이상이면 어느 쪽인지 알 수 없으므로 탈락."""
    cpx = _make_complex(db, name="래미안")
    candidates = [
        _kapt(code="A1", name="래미안", households=120),
        _kapt(code="A2", name="래미안", households=120),
    ]
    assert pick_best_match(cpx, candidates) is None


def test_gate_name_best_of_several_wins(db):
    """동률이 아니면 최고점 1건이 선택된다."""
    cpx = _make_complex(db, name="경희궁의아침4단지")
    candidates = [
        _kapt(code="A1", name="경희궁의아침4단지", households=120),
        _kapt(code="A2", name="경희궁의아침3단지", households=120),
    ]
    best, ratio = pick_best_match(cpx, candidates)
    assert best["kaptCode"] == "A1"
    assert ratio == 1.0


# ─────────────────────────── 게이트 ③ 세대수 ───────────────────────────


def test_household_tolerance_boundaries():
    """15% 이내는 통과, 초과는 탈락, 한쪽이 없으면 '대조 불가'(None)."""
    assert household_within_tolerance(100, 100) is True
    assert household_within_tolerance(100, 85) is True     # 정확히 15%
    assert household_within_tolerance(100, 84) is False    # 16%
    assert household_within_tolerance(100, None) is None
    assert household_within_tolerance(None, 100) is None
    assert household_within_tolerance(100, 0) is None


def test_gate_household_mismatch_rejects_identical_name(db):
    """이름이 100% 같아도 세대수가 크게 다르면 다른 단지 — 탈락."""
    cpx = _make_complex(db, name="래미안", households=100)
    assert pick_best_match(cpx, [_kapt(name="래미안", households=500)]) is None


def test_gate_missing_household_raises_name_threshold(db):
    """세대수 대조 불가 시 이름 임계가 0.75 로 강화된다.

    같은 후보가 세대수를 주면 통과(0.6 임계)하지만, 세대수가 없으면 탈락하는
    구간의 이름을 골라 두 경로가 실제로 갈리는지 확인한다.
    """
    cpx = _make_complex(db, name="한신아파트", households=100)
    borderline = "한신더휴"  # 실측 ratio 0.6667 — 0.6 통과 / 0.75 탈락 구간
    ratio = name_similarity(cpx.complex_name, borderline)
    assert 0.6 <= ratio < 0.75, f"경계 표본 전제 깨짐: ratio={ratio}"

    # 세대수 있음 → 0.6 임계 통과
    assert pick_best_match(cpx, [_kapt(name=borderline, households=100)]) is not None
    # 세대수 없음 → 0.75 임계로 강화되어 탈락
    assert pick_best_match(cpx, [_kapt(name=borderline)]) is None


# ─────────────────────────── 게이트 ① 법정동 (수집기 경로) ───────────────────────────


def test_gate_different_bjd_not_matched(db, monkeypatch):
    """법정동이 다르면 이름·세대수가 완벽해도 후보에 오르지 않는다."""
    _make_complex(db, cortar_no="1111011800")
    # 같은 이름·세대수인데 법정동만 다른 K-apt 단지
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(bjd="2611010100", households=120)], True),
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert result["matched"] == 0
    assert db.query(KaptComplexMap).count() == 0


def test_match_success_persists_with_basis_info(db, monkeypatch):
    """정상 매칭 — 확정분만 기본정보를 보강해 저장."""
    _make_complex(db)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt", lambda *a, **k: ([_kapt(households=120)], True)
    )
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: {"codeHallNm": "계단식", "kaptdaCnt": 120.0},
    )

    result = match_kapt_complexes()

    assert result["matched"] == 1
    row = db.query(KaptComplexMap).one()
    assert row.kapt_code == "A10021295"
    assert row.corridor_type == "계단식"
    assert row.kapt_household_count == 120
    assert row.match_score == 1.0


def test_match_household_gate_rejects_after_basis_lookup(db, monkeypatch):
    """세대수 게이트는 basis(getAphusBassInfoV5) 수신 후 재판정돼야 한다.

    ⚠ fixture 두 축을 일부러 다르게 만든다(testing.md 세션372 답습):
      - 목록 API mock 은 kaptdaCnt 를 **주지 않는다**(실제 getTotalAptList4 와 동일)
      - basis API mock 만 세대수를 돌려준다
    이 구조라야 "pick_best_match 안의 세대수 게이트는 항상 None 이고, 실제 판정은
    basis 수신 후에만 가능하다"는 실행 경로가 재현된다. 목록 mock 에 kaptdaCnt 를
    넣어버리면 게이트가 앞단에서 걸려버려 이 결함을 영영 못 잡는다.

    이름 유사도 0.9231 로 0.75 강화 임계를 통과하므로, 저장을 막는 것은 오직
    세대수 게이트뿐이다(우리 500 vs kapt 1500 = 3배 차이).
    """
    _make_complex(db, complex_no="5001", name="푸르지오시티", households=500)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="A9", name="푸르지오시티2")], True),  # kaptdaCnt 없음
    )
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: {"codeHallNm": "복도식", "kaptdaCnt": 1500.0},
    )

    result = match_kapt_complexes()

    assert result["matched"] == 0, "세대수 3배 차이인데 매칭됨 — 게이트 ③ 무력화"
    assert result["skipped"] == 1
    assert db.query(KaptComplexMap).count() == 0


def test_match_household_gate_accepts_close_count_after_basis(db, monkeypatch):
    """같은 경로에서 세대수가 근사(500 vs 520, 4%)하면 정상 저장된다."""
    _make_complex(db, complex_no="5002", name="푸르지오시티", households=500)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="A9", name="푸르지오시티2")], True),
    )
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: {"codeHallNm": "복도식", "kaptdaCnt": 520.0},
    )

    result = match_kapt_complexes()

    assert result["matched"] == 1
    row = db.query(KaptComplexMap).one()
    assert row.kapt_household_count == 520
    assert row.corridor_type == "복도식"


def test_match_saves_when_basis_lookup_fails(db, monkeypatch):
    """basis 조회 실패(None)면 세대수를 알 수 없으므로 기존대로 저장한다.

    이미 이름 임계 0.75 강화를 통과한 건이라 보수 원칙과 상충하지 않는다.
    """
    _make_complex(db, complex_no="5003", name="푸르지오시티", households=500)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="A9", name="푸르지오시티2")], True),
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert result["matched"] == 1
    assert db.query(KaptComplexMap).one().kapt_household_count is None


def test_match_skips_non_apt_types(db, monkeypatch):
    """오피스텔(OPST)은 대상이 아니다 — APT/JGC 만."""
    _make_complex(db, complex_no="2002", type_code="OPST")
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt", lambda *a, **k: ([_kapt(households=120)], True)
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert result["matched"] == 0


def test_match_empty_list_fails_job(db, monkeypatch):
    """K-apt 목록이 0건이면 API 실패로 보고 job 을 failed 로 — '완료(0)' 위장 금지."""
    _make_complex(db)
    monkeypatch.setattr(service_kapt, "_fetch_all_kapt", lambda *a, **k: ([], False))

    result = match_kapt_complexes()

    assert result["error"] == "kapt_list_empty"
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_match").one()
    assert job.status == "failed"


def test_match_partial_list_marks_job_warning(db, monkeypatch):
    """목록이 중간에 끊겼으면 매칭은 하되 job 에 경고를 남긴다.

    부분 목록으로도 매칭 자체는 안전하지만(upsert 라 기존 매칭 삭제 0), 낮은
    매칭 수가 '정상 완료'로만 보이면 조용한 퇴행이 된다.
    """
    _make_complex(db)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(households=120)], False),  # is_complete=False
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert result["matched"] == 1
    assert result["list_complete"] is False
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_match").one()
    assert job.status == "completed"          # 매칭은 됐으니 실패는 아니다
    assert "부분 목록" in (job.error_message or "")


def test_fetch_all_kapt_reports_completeness(monkeypatch):
    """totalCount 를 다 못 채우면 is_complete=False."""
    pages = {1: ([_kapt(code="A1")], 5)}  # total 5 인데 1건만 주고 끝
    monkeypatch.setattr(
        service_kapt, "fetch_apt_list_page",
        lambda page, size: pages.get(page, ([], 5)),
    )
    rows, complete = service_kapt._fetch_all_kapt()
    assert len(rows) == 1 and complete is False

    pages_full = {1: ([_kapt(code="A1"), _kapt(code="A2")], 2)}
    monkeypatch.setattr(
        service_kapt, "fetch_apt_list_page",
        lambda page, size: pages_full.get(page, ([], 2)),
    )
    rows, complete = service_kapt._fetch_all_kapt()
    assert len(rows) == 2 and complete is True


# ─────────────────────────── 관리비 합산 · 세대당 계산 ───────────────────────────


def test_summarize_splits_common_and_individual():
    """op 목록 소속으로 공용/개별을 갈라 합산하고 세대당 금액을 낸다."""
    breakdown = {
        "getHsmpGuardCostInfoV3": 7_602_810,
        "getHsmpCleaningCostInfoV3": 2_000_000,
        "getHsmpElectricityCostInfoV3": 10_262_622,
    }
    summary = service_kapt._summarize(breakdown, household=120)

    assert summary["common_cost"] == 9_602_810
    assert summary["individual_cost"] == 10_262_622
    assert summary["total_cost"] == 19_865_432
    assert summary["cost_per_household"] == round(19_865_432 / 120)


def test_summarize_without_household_leaves_per_household_none():
    """세대수를 모르면 세대당 금액은 None — 0 으로 채우지 않는다."""
    summary = service_kapt._summarize(
        {"getHsmpGuardCostInfoV3": 100}, household=None
    )
    assert summary["total_cost"] == 100
    assert summary["cost_per_household"] is None


def test_summarize_splits_by_op_membership_not_version_suffix():
    """공용·개별 구분이 버전 접미사에 의존하지 않는다 (V2→V3 전환 회귀 가드).

    두 서비스가 같은 버전(V3)을 쓰는 지금, 접미사로 가르던 옛 구현은 개별
    금액을 통째로 공용에 합산해버렸다. op 목록 소속으로 갈라야 두 서비스가
    같은 버전이어도 정확히 나뉜다.
    """
    breakdown = {op: 100 for op in service_kapt.INDIVIDUAL_COST_OPS}
    breakdown["getHsmpGuardCostInfoV3"] = 700

    summary = service_kapt._summarize(breakdown, household=None)

    assert summary["individual_cost"] == 100 * len(service_kapt.INDIVIDUAL_COST_OPS)
    assert summary["common_cost"] == 700


def test_candidate_cost_months_uses_three_month_lag():
    """공개 지연 3개월 — 당월-3 부터 거꾸로 (2026-08-27 라이브 실측 기준)."""
    from datetime import date

    assert candidate_cost_months(date(2026, 8, 27)) == ["202605", "202604", "202603"]
    # 연도 경계
    assert candidate_cost_months(date(2026, 2, 10)) == ["202511", "202510", "202509"]


# ─────────────────────────── 수집기 ───────────────────────────


def _seed_mapping(db, complex_no="1001", kapt_code="A10021295", households=120):
    db.add(KaptComplexMap(
        complex_no=complex_no, kapt_code=kapt_code,
        kapt_name="경희궁의아침4단지", kapt_household_count=households,
    ))
    db.commit()


def test_collect_costs_persists_summary(db, monkeypatch):
    """관리비 수집 정상 경로 — 합산 결과와 breakdown 원값 저장."""
    _make_complex(db)
    _seed_mapping(db)
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost",
        lambda code, month: {"getHsmpGuardCostInfoV3": 7_602_810},
    )
    monkeypatch.setattr(
        service_kapt, "fetch_individual_cost",
        lambda code, month: {"getHsmpElectricityCostInfoV3": 10_262_622},
    )

    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 1
    row = db.query(KaptManagementCost).one()
    assert row.common_cost == 7_602_810
    assert row.individual_cost == 10_262_622
    assert row.total_cost == 17_865_432
    assert row.cost_per_household == round(17_865_432 / 120)
    assert row.breakdown["getHsmpGuardCostInfoV3"] == 7_602_810


def test_collect_costs_falls_back_to_older_month(db, monkeypatch):
    """최신 후보월이 비면 더 과거 달로 물러나 수집한다."""
    _make_complex(db)
    _seed_mapping(db)
    months = candidate_cost_months()

    def common(code, month):
        return {"aV3": 500} if month == months[1] else {}

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 1
    assert db.query(KaptManagementCost).one().cost_month == months[1]


def test_collect_costs_prefers_newest_month_when_several_published(db, monkeypatch):
    """두 후보월 모두 공개돼 있으면 더 최신인 months[0] 을 저장한다.

    기존 `test_collect_costs_falls_back_to_older_month` 는 months[1] 에만 데이터를
    publish 해서, 루프 순서를 `for month in months:` → `for month in reversed(months):`
    로 뒤집어도(= 과거달부터 조회) 결국 같은 months[1] 이 저장돼 통과해버린다
    (두 축 — "조회 순서"와 "그 결과로 저장되는 달" — 이 이 fixture 에서는 우연히 같은
    값을 낸다는 뜻). 이 테스트는 두 달 모두 공개해 순서를 뒤집으면 저장되는 달이
    갈리도록(= 두 축이 서로 다른 값이 되도록) 만들어 그 함정을 막는다.
    """
    _make_complex(db)
    _seed_mapping(db)
    months = candidate_cost_months()

    def common(code, month):
        if month == months[0]:
            return {"aV3": 100}
        if month == months[1]:
            return {"aV3": 200}
        return {}

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 1
    row = db.query(KaptManagementCost).one()
    assert row.cost_month == months[0]
    assert row.common_cost == 100
    assert row.breakdown["aV3"] == 100


def test_collect_costs_skips_unpublished_without_failing(db, monkeypatch):
    """전 항목 미공개면 행을 만들지 않되, 실패가 아니라 정상 완료로 본다."""
    _make_complex(db)
    _seed_mapping(db)
    monkeypatch.setattr(service_kapt, "fetch_common_cost", lambda code, month: {})
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 0
    assert result["empty"] == 1
    assert db.query(KaptManagementCost).count() == 0
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "completed", "전량 미공개는 정상 — failed 오탐 금지"


def test_collect_costs_silent_failure_guard(db, monkeypatch):
    """대상이 있는데 전부 예외로 실패하면 '완료(0)' 위장 대신 failed."""
    _make_complex(db)
    _seed_mapping(db)

    def boom(code, month):
        raise RuntimeError("API 폭발")

    monkeypatch.setattr(service_kapt, "fetch_common_cost", boom)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["error"] == "no_collect"
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "failed"


def test_collect_costs_reupsert_overwrites_same_month(db, monkeypatch):
    """같은 (단지, 조회월) 재수집은 UNIQUE 충돌 없이 최신값으로 덮어쓴다.

    _do_upsert 의 복합 키 경로는 DB 레벨 UNIQUE 제약이 실제로 있어야 동작한다
    (services/upsert.py docstring) — 그 전제가 살아있는지 행 수로 확인한다.
    """
    _make_complex(db)
    _seed_mapping(db)
    month = candidate_cost_months()[0]
    db.add(KaptManagementCost(complex_no="1001", cost_month=month, total_cost=1))
    db.commit()

    # 이미 수집한 달은 건너뛰므로, 덮어쓰기 경로를 보려면 직접 upsert 를 태운다.
    from services.upsert import _do_upsert
    _do_upsert(
        db, KaptManagementCost,
        {"complex_no": "1001", "cost_month": month, "total_cost": 999},
        ["complex_no", "cost_month"],
    )
    db.commit()

    row = db.query(KaptManagementCost).one()  # 행이 2개면 여기서 터진다
    assert row.total_cost == 999


def test_collect_costs_skips_already_collected_month(db, monkeypatch):
    """이번 대상월을 이미 수집한 단지는 재호출하지 않는다."""
    _make_complex(db)
    _seed_mapping(db)
    db.add(KaptManagementCost(
        complex_no="1001", cost_month=candidate_cost_months()[0], total_cost=1,
    ))
    db.commit()

    called = []
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost",
        lambda code, month: called.append(month) or {},
    )
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 0
    assert called == [], "이미 수집한 달을 다시 호출하면 쿼터 낭비"


def test_collect_costs_retries_only_newer_months_than_stored(db, monkeypatch):
    """폴백으로 과거 달을 받은 단지는 **더 새 달만** 시도한다 (보유월 이하 재조회 0).

    ⚠ 계약이 바뀐 테스트다 — 결함 박제가 아니라 **정당한 새 계약**이다(2026-09-19
    사장님 결정: 관리비를 매월 갱신). 옛 계약은 "후보월 중 아무 달이나 가지고 있으면
    통째로 건너뛴다"(called == [])였고, 그 목적은 "매일 22콜 x 3개월 무한 재조회"를
    막는 것이었다. 새 계약은 그 목적을 **더 강하게** 지킨다 — 보유월(months[1]) 이하는
    어떤 경우에도 다시 부르지 않고, 아직 안 받은 months[0] 만 첫 op 1콜로 찔러본다.
    미공개면 거기서 끝이라 이 단지가 한 달에 무는 비용은 하루 1콜이다.
    """
    _make_complex(db)
    _seed_mapping(db)
    months = candidate_cost_months()
    # 폴백 달(months[1])로만 저장된 상태
    db.add(KaptManagementCost(
        complex_no="1001", cost_month=months[1], total_cost=100,
    ))
    db.commit()

    called = []
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost",
        lambda code, month: called.append(month) or {},
    )
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 0
    assert called == [months[0]], (
        f"보유월({months[1]}) 이하를 다시 불렀거나 새 달을 안 불렀다: {called}"
    )


# ─────────────────────────── 조회 API ───────────────────────────


def test_kapt_endpoint_returns_latest_month(db, client):
    """최신 cost_month 1건을 반환한다."""
    _make_complex(db)
    db.add(KaptComplexMap(
        complex_no="1001", kapt_code="A10021295",
        kapt_name="경희궁의아침4단지", corridor_type="계단식", kapt_household_count=120,
    ))
    db.add(KaptManagementCost(
        complex_no="1001", cost_month="202604", total_cost=1, common_cost=1,
        individual_cost=0, cost_per_household=1, household_count=120,
    ))
    db.add(KaptManagementCost(
        complex_no="1001", cost_month="202605", total_cost=17_865_432,
        common_cost=7_602_810, individual_cost=10_262_622,
        cost_per_household=148_879, household_count=120,
    ))
    db.commit()

    res = client.get("/api/complexes/1001/kapt")

    assert res.status_code == 200
    body = res.json()
    assert body["cost_month"] == "202605"
    assert body["total_cost"] == 17_865_432
    assert body["kapt_name"] == "경희궁의아침4단지"
    assert body["corridor_type"] == "계단식"


def test_kapt_endpoint_404_when_no_mapping(db, client):
    """매칭 자체가 없으면 404."""
    _make_complex(db)
    assert client.get("/api/complexes/1001/kapt").status_code == 404


def test_kapt_endpoint_200_when_mapped_but_no_cost(db, client):
    """매칭만 있으면 200 + 금액 null — 복도유형까지 숨기지 않는다.

    ⚠ 이 테스트는 옛 동작(404)을 정답으로 박제하고 있던 것을 정정한 것이다
    (testing.md '결함 박제 테스트' 케이스). 복도유형은 매칭 시점에 이미
    KaptComplexMap 에 저장되는데, 관리비 기준 INNER JOIN 이라 관리비가 없다는
    이유만으로 함께 404 로 숨겨졌다 — 매칭 1,212건 중 관리비 보유는 19건뿐이라
    사실상 대부분의 단지가 가진 정보를 못 보여주던 구조였다.
    """
    _make_complex(db)
    db.add(KaptComplexMap(
        complex_no="1001", kapt_code="A10021295",
        kapt_name="경희궁의아침4단지", corridor_type="계단식",
    ))
    db.commit()

    res = client.get("/api/complexes/1001/kapt")

    assert res.status_code == 200
    body = res.json()
    assert body["corridor_type"] == "계단식"
    assert body["kapt_name"] == "경희궁의아침4단지"
    # 금액은 전부 null — "0원"과 구분된다(0 이면 숫자로 내려간다)
    assert body["cost_month"] is None
    assert body["total_cost"] is None
    assert body["cost_per_household"] is None


def test_kapt_endpoint_404_is_not_cached(db, client):
    """미매칭 404 를 캐시에 굳히지 않는다 — 매칭되면 즉시 200 이어야 한다.

    지금은 raise 가 cache.set() 앞에 있어 안전하지만, 순서가 바뀌면 "없음"이
    12시간(TTL) 동안 굳어 그 사이 매칭된 단지가 계속 404 를 받는다. 그 순서
    의존을 코드 리뷰가 아니라 테스트로 고정한다.
    """
    _make_complex(db)

    assert client.get("/api/complexes/1001/kapt").status_code == 404

    db.add(KaptComplexMap(
        complex_no="1001", kapt_code="A10021295", corridor_type="계단식",
    ))
    db.add(KaptManagementCost(
        complex_no="1001", cost_month="202605", total_cost=17_865_432,
        cost_per_household=148_879, household_count=120,
    ))
    db.commit()

    res = client.get("/api/complexes/1001/kapt")
    assert res.status_code == 200, "404 가 캐시에 굳어 매칭 후에도 없음으로 응답"
    assert res.json()["total_cost"] == 17_865_432


# ─────────────────────────── API 파서 ───────────────────────────


@pytest.mark.parametrize("item,expected", [
    ({"kaptCode": "A1", "kaptName": "이름", "guardCost": 7602810}, 7602810),
    ({"kaptCode": "A1", "kaptName": "이름", "cleaningCost": "2,000,000"}, 2000000),
    ({"kaptCode": None, "kaptName": None, "guardCost": None}, None),
])
def test_extract_amount_is_field_name_agnostic(item, expected):
    """op 마다 다른 금액 필드명을 이름으로 찾지 않는다 — 식별 필드만 제외."""
    from crawler.kapt_api import _extract_amount

    assert _extract_amount(item) == expected


def test_extract_paired_amount_sums_common_and_private():
    """개별사용료는 공용(C)+전용(P) 합산. 둘 다 없으면 None."""
    from crawler.kapt_api import _extract_paired_amount

    assert _extract_paired_amount(
        {"kaptCode": "A1", "kaptName": "n", "electC": "2210072", "electP": "8052550"}
    ) == 10262622
    assert _extract_paired_amount(
        {"kaptCode": None, "kaptName": None, "heatC": None, "heatP": None}
    ) is None


def test_as_item_list_normalizes_single_and_many():
    """공공데이터 API 는 1건이면 dict, 여러 건이면 list 를 준다."""
    from crawler.kapt_api import _as_item_list

    assert _as_item_list(None) == []
    assert _as_item_list({"item": {"kaptCode": "A1"}}) == [{"kaptCode": "A1"}]
    assert _as_item_list({"item": [{"kaptCode": "A1"}, {"kaptCode": "A2"}]}) == [
        {"kaptCode": "A1"}, {"kaptCode": "A2"}
    ]


# ─────────────── #1 역방향 중복 배정 (우리 단지 N ↔ kapt 후보 1) ───────────────


def test_reverse_tie_only_top_scorer_wins(db, monkeypatch):
    """한 kaptCode 를 우리 단지 여러 개가 노릴 때 최고점 1개만 배정된다.

    ⚠ 기존 동률 테스트(test_gate_name_tie_rejected)는 전부 **정방향**
    ("우리 단지 1 vs kapt 후보 N")만 본다. pick_best_match 는 그 방향만
    막으므로, 반대 방향("우리 단지 N vs kapt 후보 1")은 무방어였다 —
    라이브 실측에서 10그룹·21단지가 같은 kaptCode 에 중복 배정됐고 전부
    1차/2차 형제 단지였다(남의 단지 관리비를 보여주는 치명적 오매칭).

    fixture 두 축을 일부러 다르게 잡는다(testing.md 세션372 답습):
    두 단지의 이름 유사도가 **서로 달라야** "상위 1개만 생존"이 검증된다.
    같은 점수면 아래 동률 테스트가 담당한다.
    """
    _make_complex(db, complex_no="7001", name="래미안퍼스티지1", households=120)
    _make_complex(db, complex_no="7002", name="래미안퍼스티지2차", households=120)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="AX", name="래미안퍼스티지1")], True),
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    rows = db.query(KaptComplexMap).all()
    assert len(rows) == 1, f"같은 kaptCode 가 {len(rows)}개 단지에 중복 배정됨"
    assert rows[0].complex_no == "7001", "이름 유사도 최고점 단지가 가져가야 한다"
    assert result["matched"] == 1


def test_reverse_tie_all_rejected_when_scores_equal(db, monkeypatch):
    """점수가 완전 동률이면 어느 단지인지 알 수 없으므로 전원 탈락.

    pick_best_match 의 정방향 동률 규칙과 대칭 — 오매칭이 미매칭보다
    훨씬 나쁘다는 보수 원칙을 양방향에 똑같이 적용한다.
    """
    _make_complex(db, complex_no="7101", name="래미안퍼스티지", households=120)
    _make_complex(db, complex_no="7102", name="래미안퍼스티지", households=120)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="AY", name="래미안퍼스티지")], True),
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert db.query(KaptComplexMap).count() == 0, "동률인데 한쪽을 찍어 배정함"
    assert result["matched"] == 0


def test_reverse_dedupe_skips_basis_call_for_losers(db, monkeypatch):
    """탈락한 경쟁 단지에는 basis(getAphusBassInfoV5)를 부르지 않는다.

    2-pass 구조의 부수 효과이자 쿼터 보호 — 후보 전량에 API 를 태우면
    매월 매칭이 쿼터를 태운다(모듈 docstring 의 설계 의도).
    """
    _make_complex(db, complex_no="7201", name="래미안퍼스티지1", households=120)
    _make_complex(db, complex_no="7202", name="래미안퍼스티지2차", households=120)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="AZ", name="래미안퍼스티지1")], True),
    )
    calls = []
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: calls.append(code) or None,
    )

    match_kapt_complexes()

    assert len(calls) == 1, f"생존자 1개만 basis 를 불러야 하는데 {len(calls)}회 호출"


def test_cross_run_stale_mapping_removed(db, monkeypatch):
    """옛 실행이 다른 단지에 붙여둔 같은 kapt_code 행은 이번 실행이 정리한다.

    complex_no 가 PK 라 upsert 만으로는 "kaptCode X 를 단지 A 가 쥐고 있는데
    이번엔 단지 B 에 붙는" 상황을 못 막는다 — 두 행이 공존해 두 단지가 같은
    관리비를 보여준다(라이브에서 실제로 발생한 형태).
    """
    _make_complex(db, complex_no="8001", name="옛단지이름", households=120)
    _make_complex(db, complex_no="8002", name="자이센트럴", households=120)
    # 옛 실행 잔재 — kaptCode "AC" 를 단지 8001 이 쥐고 있다
    db.add(KaptComplexMap(complex_no="8001", kapt_code="AC", kapt_name="자이센트럴"))
    db.commit()

    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="AC", name="자이센트럴")], True),
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    match_kapt_complexes()

    rows = db.query(KaptComplexMap).filter(KaptComplexMap.kapt_code == "AC").all()
    assert len(rows) == 1, f"kapt_code 'AC' 가 {len(rows)}행에 중복 존재"
    assert rows[0].complex_no == "8002", "이번 실행 배정분이 남아야 한다"


# ─────────────── #3 재매칭으로 kapt_code 가 바뀌면 옛 관리비 무효화 ───────────────


def test_rematch_to_new_kapt_code_purges_old_costs(db, monkeypatch):
    """매칭이 다른 kaptCode 로 바뀌면 옛 코드로 모은 관리비를 지운다.

    kapt_management_costs 는 complex_no 로만 조인되므로(price_queries
    get_latest_kapt_cost), 매칭만 갈아끼우면 **옛 K-apt 단지의 금액이 새 이름과
    나란히** 표시된다. 재수집될 때까지 틀린 값이 사실처럼 보이는 구간이 생긴다.
    """
    _make_complex(db, complex_no="9001", name="자이센트럴", households=120)
    db.add(KaptComplexMap(complex_no="9001", kapt_code="A_OLD", kapt_name="옛매칭"))
    db.add(KaptManagementCost(
        complex_no="9001", cost_month="202604", total_cost=11_111,
    ))
    db.commit()

    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="A_NEW", name="자이센트럴")], True),
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    match_kapt_complexes()

    assert db.query(KaptComplexMap).one().kapt_code == "A_NEW"
    assert db.query(KaptManagementCost).count() == 0, (
        "옛 kaptCode 로 모은 관리비가 새 매칭에 그대로 붙어 있다"
    )


def test_rematch_same_kapt_code_keeps_costs(db, monkeypatch):
    """매칭이 그대로면(같은 kaptCode 재확인) 관리비는 보존한다 — 과잉 삭제 금지.

    매월 매칭이 도는데 매번 지우면 관리비를 매달 전량 재수집하게 되어
    쿼터가 터진다(단지당 22콜).
    """
    _make_complex(db, complex_no="9002", name="자이센트럴", households=120)
    db.add(KaptComplexMap(complex_no="9002", kapt_code="A_SAME", kapt_name="자이센트럴"))
    db.add(KaptManagementCost(
        complex_no="9002", cost_month="202604", total_cost=22_222,
    ))
    db.commit()

    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="A_SAME", name="자이센트럴")], True),
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    match_kapt_complexes()

    assert db.query(KaptManagementCost).count() == 1, "매칭 무변경인데 관리비를 지웠다"


# ─────────────── #2 관리비 API 전면 장애가 '정상 완료'로 위장 ───────────────


def test_collect_costs_all_empty_with_targets_fails_job(db, monkeypatch):
    """대상 전량이 빈 응답이면(예: API 폐기·키 만료) failed 로 알린다.

    _body 가 None 을 주면 breakdown 이 빈 dict 가 되어 `empty` 로 계수되고
    failed 는 0 이라 기존 가드(`and failed > 0`)가 발동하지 않았다 →
    '완료(0건)' 위장. total_items 도 0 이라 freshness 의 헛바퀴 감지
    (processed==0 AND total>0)까지 동시에 무력화됐다.

    대상을 _ALL_EMPTY_MIN_TARGETS 이상으로 잡는다 — 표본이 그보다 작으면
    개별 단지의 정상적인 미공개와 구분되지 않아 판정을 보류하도록 설계했고,
    그 경계는 아래 test_collect_costs_all_empty_small_sample_stays_completed
    가 따로 지킨다.

    ⚠ 계약 변경(매월 갱신 PR): 이 경로는 이제 **카나리**를 거친다. 여기선 저장된
    관리비 행이 하나도 없어 찔러볼 표본이 0건이므로 옛 결론(failed)이 그대로 유지된다
    — 표본이 있는 경우는 test_collect_costs_canary_* 가 따로 지킨다.
    """
    for i in range(service_kapt._ALL_EMPTY_MIN_TARGETS):
        _make_complex(db, complex_no=f"41{i:02d}")
        _seed_mapping(db, complex_no=f"41{i:02d}", kapt_code=f"AE{i:02d}")
    monkeypatch.setattr(service_kapt, "fetch_common_cost", lambda code, month: {})
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["error"] == "all_empty"
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "failed"
    assert "빈 응답" in (job.error_message or "")


def test_collect_costs_partial_empty_stays_completed(db, monkeypatch):
    """일부만 미공개면 정상 — completed 유지(오탐 방지).

    fixture 두 축을 다르게: 단지 2개 중 1개만 값이 있어 '전량 빈 응답'과
    구분된다. 한 축만 두면 두 분기가 같은 값이 되어 결함을 못 잡는다.
    """
    _make_complex(db, complex_no="1001")
    _make_complex(db, complex_no="1002")
    _seed_mapping(db, complex_no="1001", kapt_code="AA")
    _seed_mapping(db, complex_no="1002", kapt_code="BB")
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost",
        lambda code, month: {"aV3": 500} if code == "AA" else {},
    )
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 1 and result["empty"] == 1
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "completed", "일부 미공개는 정상 — failed 오탐 금지"


def test_collect_costs_total_items_counts_scanned(db, monkeypatch):
    """total_items 는 **훑은 단지 수** — 미공개 단지도 '처리 시도'에 포함된다.

    total=0 이면 freshness 헛바퀴 감지(processed==0 AND total>0)가 영영
    발동하지 않는다.

    ⚠ 계약 변경(매월 갱신 PR): 선자르기 `targets[:batch_size]` 가 없어져 기준이
    `len(targets)` → `collected + failed + empty` 로 바뀌었다. 취지(전량 미공개여도
    total>0 이라 헛바퀴가 감지된다)는 그대로다 — 이 회차는 둘 다 2 라 값이 같지만,
    "훑지도 않은 큐 뒤쪽"이 total 에 섞이지 않는지는 아래 슬롯 테스트가 지킨다.
    """
    _make_complex(db, complex_no="1001")
    _make_complex(db, complex_no="1002")
    _seed_mapping(db, complex_no="1001", kapt_code="AA")
    _seed_mapping(db, complex_no="1002", kapt_code="BB")
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost",
        lambda code, month: {"aV3": 500} if code == "AA" else {},
    )
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    collect_kapt_costs(batch_size=10)

    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.processed_items == 1
    assert job.total_items == 2, "훑은 2개(수집1+미공개1)인데 total_items 가 다르다"


# ─────────────── #4 skipped 를 failed 통계로 세지 않는다 ───────────────


def test_match_job_total_excludes_skipped(db, monkeypatch):
    """미매칭(skipped)은 '실패'가 아니다 — total_items 에 섞지 않는다.

    _complete_job(total = processed + failed) 규약상 skipped 를 넘기면
    라이브 total 이 47,606(=1,233+46,373)처럼 부풀어 실패율 지표가 망가진다.
    fixture 두 축을 다르게: 대상 2개 중 1개만 매칭되어 matched(1) != skipped(1)
    이 아니라 각각 독립적으로 확인된다.
    """
    _make_complex(db, complex_no="1001", name="경희궁의아침4단지")
    _make_complex(db, complex_no="1002", name="전혀다른이름타워")
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt", lambda *a, **k: ([_kapt()], True)
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert result["matched"] == 1 and result["skipped"] == 1
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_match").one()
    assert job.processed_items == 1
    assert job.total_items == 1, "미매칭이 failed 통계로 들어가 total 이 부풀었다"


# ─────────────── #6 금액 파서가 메타 숫자 필드를 금액으로 오채택 ───────────────


def test_extract_amount_ignores_search_date_meta():
    """응답에 searchDate 같은 숫자형 메타가 먼저 와도 금액으로 쓰지 않는다.

    '식별 필드 제외 첫 숫자 필드'라는 규칙은 응답 키 순서에 의존하므로,
    금액이 아닌 숫자 메타가 앞에 오면 202605(연월)를 관리비로 저장한다.
    """
    from crawler.kapt_api import _extract_amount

    assert _extract_amount(
        {"kaptCode": "A1", "searchDate": "202605", "guardCost": "1234"}
    ) == 1234


def test_extract_paired_amount_ignores_meta_fields():
    """합산 파서도 같은 메타를 더하지 않는다 — 202605 가 요금에 얹히면 안 된다."""
    from crawler.kapt_api import _extract_paired_amount

    assert _extract_paired_amount(
        {"kaptCode": "A1", "searchDate": "202605", "electC": "100", "electP": "200"}
    ) == 300


def test_collect_costs_all_empty_small_sample_stays_completed(db, monkeypatch):
    """표본이 작으면 '전량 미공개' 를 장애로 단정하지 않는다 (오탐 방지 경계).

    수집이 거의 끝나 잔여 1~2단지만 남은 날이나 수동 소량 트리거에서는
    '대상 전량 미공개' 가 정상적으로 자주 일어난다. 이때까지 failed 로 올리면
    official_price 오탐 sweep(세션 369)과 같은 가짜 경보가 매일 울린다.

    위 test_collect_costs_all_empty_with_targets_fails_job 과 **표본 크기만**
    다른 짝 테스트다 — 두 축(표본 크기 / 응답 내용)이 같은 값이 되지 않도록
    응답은 양쪽 다 '전량 빈 응답' 으로 고정했다(testing.md 세션372 답습).

    ⚠ 계약 변경(매월 갱신 PR): 임계 미만은 카나리를 **거치지 않는다**(경고 로그 후
    completed 유지) — 옛 동작 그대로다.
    """
    _make_complex(db, complex_no="4201")
    _seed_mapping(db, complex_no="4201", kapt_code="AF01")
    monkeypatch.setattr(service_kapt, "fetch_common_cost", lambda code, month: {})
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 0 and result["empty"] == 1
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "completed", "표본 1개 전량 미공개를 장애로 오판"


# ── (c) 호출 실패 vs (b) 정상 미공개 구분 (반쪽 저장 차단) ──
#
# 이 블록은 "공용(V3) 17콜이 통째로 실패하고 개별(사고 당시 V2, 현행 V3 — PR #435) 5콜만 성공한 회차에
# 공용관리비 0원짜리 반쪽 총액이 저장되고, 그 달 행이 생겨 다음 달까지
# 재수집도 안 되던" 결함의 회귀 가드다.


def test_collect_costs_partial_failure_saves_nothing(db, monkeypatch):
    """공용(V3) 호출 실패 + 개별(V3) 성공 -> 행 0 · failed 계수 (반쪽 저장 금지).

    결함 재현: 예전에는 `_body` 가 실패에도 None 을 줘서 fetch_common_cost 가
    빈 dict 를 돌려줬고, 개별(V2)만 성공하면 breakdown 이 비어있지 않아
    `_summarize` 가 common_cost=0 · total_cost=개별만 인 반쪽 값을 저장했다.
    그러면 그 달 행이 생겨 `done` 셋에 걸리므로 다음 달까지 고쳐지지도 않는다.

    fixture 두 축을 다르게 (testing.md 세션372 답습): 대상 3단지 중 실패는
    1단지뿐이라 "대상 수"와 "실패 수"가 우연히 같아지지 않는다 — 두 값이
    같으면 코드가 둘을 뒤바꿔 써도 단언이 통과해버린다.
    """
    for i, code in enumerate(("AA", "BB", "CC")):
        _make_complex(db, complex_no="50%02d" % i)
        _seed_mapping(db, complex_no="50%02d" % i, kapt_code=code)

    def common(code, month):
        if code == "AA":
            raise KaptApiError("서비스 점검", code="99", op="getHsmpGuardCostInfoV3")
        return {"aV3": 1_000}

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(
        service_kapt, "fetch_individual_cost",
        lambda code, month: {"getHsmpHeatCostInfoV3": 500},
    )

    result = collect_kapt_costs(batch_size=10)

    # 실패 단지는 저장 0 — 반쪽 행이 절대 생기면 안 된다.
    assert result["failed"] == 1
    assert result["collected"] == 2
    saved = {r.complex_no for r in db.query(KaptManagementCost).all()}
    assert saved == {"5001", "5002"}, "실패 단지가 반쪽 값으로 저장됨"
    # 저장된 정상 단지는 공용+개별이 온전하다 (반쪽 아님).
    ok_row = db.query(KaptManagementCost).filter(
        KaptManagementCost.complex_no == "5001").one()
    assert ok_row.common_cost == 1_000 and ok_row.individual_cost == 500


def test_collect_costs_failed_complex_retried_next_run(db, monkeypatch):
    """호출 실패 단지는 그 달 행이 없으므로 다음 회차에 자동 재시도된다.

    `done` 셋은 '후보월에 행이 있는 단지'라 실패로 저장을 건너뛴 단지는 걸리지
    않는다 — 이 성질이 "실패는 저장 안 함" 처방의 안전판이다.
    """
    _make_complex(db, complex_no="5101")
    _seed_mapping(db, complex_no="5101", kapt_code="AA")

    calls = {"n": 0}

    def common(code, month):
        calls["n"] += 1
        if calls["n"] == 1:
            raise KaptApiError("일시 실패", code=None, op="x")
        return {"aV3": 700}

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    first = collect_kapt_costs(batch_size=10)
    assert first["failed"] == 1
    assert db.query(KaptManagementCost).count() == 0

    second = collect_kapt_costs(batch_size=10)
    assert second["collected"] == 1, "실패 단지가 다음 회차 대상에서 빠짐"
    assert db.query(KaptManagementCost).one().common_cost == 700


def test_collect_costs_month_fallback_skipped_on_call_failure(db, monkeypatch):
    """이번 달이 (c) 호출 실패면 이전 달로 폴백하지 않는다 (쿼터 낭비 방지).

    폴백은 (b) '그 달은 아직 미공개' 일 때만 의미가 있다. 죽은 API 에 대고
    이전 달을 또 부르면 22콜을 헛되이 태우고 결과도 같다.
    """
    _make_complex(db, complex_no="5201")
    _seed_mapping(db, complex_no="5201", kapt_code="AA")

    seen_months = []

    def common(code, month):
        seen_months.append(month)
        raise KaptApiError("호출 실패", code=None, op="x")

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["failed"] == 1
    assert len(candidate_cost_months()) > 1, "폴백 후보가 1개면 이 테스트가 무의미"
    assert len(seen_months) == 1, "실패 후에도 이전 달로 폴백함: %r" % (seen_months,)


def test_collect_costs_quota_exceeded_stops_batch(db, monkeypatch):
    """쿼터 초과(22)면 남은 대상에 호출 0 · 잡 failed · 앞선 성공분은 보존.

    fixture 두 축을 다르게: 대상 5단지 중 3번째에서 한도가 터지도록 해
    '대상 수'·'처리 수'·'잔여 수'가 서로 다른 값이 되게 했다.
    """
    for i in range(5):
        _make_complex(db, complex_no="53%02d" % i)
        _seed_mapping(db, complex_no="53%02d" % i, kapt_code="K%d" % i)

    called = []

    def common(code, month):
        called.append(code)
        if code == "K2":
            raise KaptApiError("일일 한도 초과(22)", code="22", op="x", is_quota=True)
        return {"aV3": 100}

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["error"] == "quota_exceeded"
    # 한도 이후 단지(K3·K4)에는 호출이 아예 나가지 않는다.
    assert called == ["K0", "K1", "K2"], "한도 후 헛호출 발생: %r" % (called,)
    assert result["remaining"] == 2
    # 앞서 성공한 2단지는 커밋돼 보존된다 (중단이 롤백을 뜻하지 않는다).
    assert {r.complex_no for r in db.query(KaptManagementCost).all()} == {"5300", "5301"}
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "failed"
    assert "쿼터" in (job.error_message or "") and "22" in (job.error_message or "")


def test_collect_costs_unpublished_still_treated_as_empty(db, monkeypatch):
    """(b) 정상 미공개는 예전 그대로 `empty` 경로 — 실패로 승격되지 않는다.

    이 PR 이 (c)만 골라내는지 확인하는 반대편 가드. 두 축을 다르게: 대상
    2단지 중 1개만 미공개라 '대상 수'와 '미공개 수'가 갈린다.
    """
    _make_complex(db, complex_no="5401")
    _make_complex(db, complex_no="5402")
    _seed_mapping(db, complex_no="5401", kapt_code="AA")
    _seed_mapping(db, complex_no="5402", kapt_code="BB")
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost",
        lambda code, month: {"aV3": 300} if code == "AA" else {},
    )
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["empty"] == 1 and result["failed"] == 0 and result["collected"] == 1
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "completed", "정상 미공개가 실패로 승격됨"


# ── API 계층 3상태 구분 단위 테스트 ──


def test_body_or_raise_raises_on_call_failure(monkeypatch):
    """call_api 가 None(키 미설정·한도·HTTP 실패·XML 파싱 실패)이면 예외.

    ⚠ 이게 (b)와 뭉개지던 지점이다 — data.go.kr 은 `_type=json` 을 줘도 에러는
    XML(`cmmMsgHeader`)로 주는 엔드포인트가 있어, 쿼터 초과가 `resp.json()`
    예외 -> call_api None 으로 도착한다.
    """
    monkeypatch.setattr(kapt_api.KaptAPI, "call_api", classmethod(lambda cls, u, p: None))
    with pytest.raises(KaptApiError):
        kapt_api.KaptAPI._body_or_raise("http://x", {}, op="opA")


def test_body_or_raise_returns_none_on_empty_body(monkeypatch):
    """(b) 정상 응답 + 빈 body -> None (예외 아님)."""
    monkeypatch.setattr(
        kapt_api.KaptAPI, "call_api",
        classmethod(
            lambda cls, u, p: {"response": {"header": {"resultCode": "00"}, "body": None}}
        ),
    )
    assert kapt_api.KaptAPI._body_or_raise("http://x", {}, op="opA") is None


@pytest.mark.parametrize("payload", [
    # 실측 형태 (tests/test_api_version_monitor.py 픽스처 답습) — JSON cmmMsgHeader
    {"cmmMsgHeader": {"returnAuthMsg": "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
                      "returnReasonCode": "22"}},
    # 코드만 오는 변형
    {"cmmMsgHeader": {"returnReasonCode": "22"}},
    # 정상 구조 안에 22 가 실려 오는 변형
    {"response": {"header": {"resultCode": "22", "resultMsg": "LIMITED..."}}},
])
def test_body_or_raise_flags_quota(monkeypatch, payload):
    """한도 초과(22)는 is_quota=True 로 올라온다 — 응답 포맷 변형 전부 커버."""
    monkeypatch.setattr(kapt_api.KaptAPI, "call_api", classmethod(lambda cls, u, p: payload))
    with pytest.raises(KaptApiError) as exc:
        kapt_api.KaptAPI._body_or_raise("http://x", {}, op="opA")
    assert exc.value.is_quota is True


def test_body_or_raise_non_quota_error_not_flagged(monkeypatch):
    """키 미등록(30) 등 다른 에러는 실패이되 쿼터 플래그는 꺼둔다.

    두 축 분리: 같은 '예외 발생' 이라도 is_quota 로 배치 중단 여부가 갈린다 —
    30 을 쿼터로 오판하면 정상 회차가 통째로 중단된다.
    """
    monkeypatch.setattr(
        kapt_api.KaptAPI, "call_api",
        classmethod(lambda cls, u, p: {"cmmMsgHeader": {
            "returnAuthMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
            "returnReasonCode": "30"}}),
    )
    with pytest.raises(KaptApiError) as exc:
        kapt_api.KaptAPI._body_or_raise("http://x", {}, op="opA")
    assert exc.value.is_quota is False


def test_collect_ops_propagates_failure_without_partial(monkeypatch):
    """_collect_ops 는 한 op 라도 실패하면 부분 dict 대신 예외를 올린다."""
    seen = []

    def fake(base_url, op, kapt_code, search_date):
        seen.append(op)
        if len(seen) == 2:
            raise KaptApiError("실패", code=None, op=op)
        return {"someCost": 100}

    monkeypatch.setattr(kapt_api, "fetch_cost_item", fake)
    with pytest.raises(KaptApiError):
        kapt_api._collect_ops("http://x", ("a", "b", "c"), "K1", "202605",
                              kapt_api._extract_amount)
    # 실패 즉시 빠져나와 남은 op("c")를 부르지 않는다 — 쿼터 보호.
    assert seen == ["a", "b"]


# ── 미공개 단지 조기 이탈 (첫 op 이 비면 그 서비스·월 전체 미공개) ──────────────
#
# 근거 = 저장 7,757행 전수 실측: 한 서비스가 부분만 실린 행 0건 · 개별만 있고 공용이
# 없는 행 0건. 아래 4 테스트는 전부 "실제로 나간 호출 목록"을 단언한다 — 반환값만
# 보면 조기 이탈을 지워도 (빈 dict 라는) 같은 결과가 나와 장식 테스트가 된다.


def test_collect_ops_first_op_empty_stops_immediately(monkeypatch):
    """[T1] 첫 op 이 미공개면 나머지 op 를 부르지 않고 빈 dict.

    호출 목록이 ["a"] 하나뿐임을 단언한다 — 조기 이탈을 지우면 3콜이 다 나가 FAIL.
    """
    seen = []

    def fake(base_url, op, kapt_code, search_date):
        seen.append(op)
        return None  # 전 op 미공개 (HTTP 200 + 빈 body)

    monkeypatch.setattr(kapt_api, "fetch_cost_item", fake)
    result = kapt_api._collect_ops("http://x", ("a", "b", "c"), "K1", "202605",
                                   kapt_api._extract_amount)

    assert result == {}
    assert seen == ["a"], "첫 op 미공개인데 남은 op 까지 호출됨"


def test_collect_ops_later_empty_op_does_not_stop(monkeypatch):
    """[T2] 첫 op 이 공개면 뒤쪽 빈 op 은 그 항목만 건너뛰고 끝까지 돈다.

    조기 이탈을 "아무 빈 op" 으로 넓히면 "c" 가 안 불려 FAIL — 첫 op 전용임을 고정.
    """
    seen = []

    def fake(base_url, op, kapt_code, search_date):
        seen.append(op)
        return None if op == "b" else {"someCost": 100}

    monkeypatch.setattr(kapt_api, "fetch_cost_item", fake)
    result = kapt_api._collect_ops("http://x", ("a", "b", "c"), "K1", "202605",
                                   kapt_api._extract_amount)

    assert seen == ["a", "b", "c"], "중간 빈 op 에서 남은 op 이 잘림"
    assert result == {"a": 100, "c": 100}, "빈 op 만 제외되고 나머지는 남아야"


def test_collect_ops_first_op_failure_still_raises(monkeypatch):
    """[T3] 첫 op 의 (c) 호출 실패는 조기 이탈이 아니라 예외 그대로.

    "미공개(빈 응답)"와 "호출 실패"는 뭉개면 안 된다 — 실패를 빈 dict 로 바꾸면
    저장할 값이 없는데도 정상 미공개로 계수돼 다음 회차 재시도가 사라진다.
    """
    def fake(base_url, op, kapt_code, search_date):
        raise KaptApiError("실패", code=None, op=op)

    monkeypatch.setattr(kapt_api, "fetch_cost_item", fake)
    with pytest.raises(KaptApiError):
        kapt_api._collect_ops("http://x", ("a", "b", "c"), "K1", "202605",
                              kapt_api._extract_amount)


def test_collect_ops_first_op_unparsable_amount_continues(monkeypatch):
    """첫 op 이 item 은 줬으면 금액 파싱이 None 이어도 계속 돈다.

    item 이 왔다 = 그 서비스는 공개 중 — 조기 이탈 조건을 `not item` 이 아니라
    "금액 없음"으로 잡으면 공개 단지의 뒤쪽 16항목이 통째로 날아간다.
    """
    seen = []

    def fake(base_url, op, kapt_code, search_date):
        seen.append(op)
        return {"kaptCode": "K1"} if op == "a" else {"someCost": 100}

    monkeypatch.setattr(kapt_api, "fetch_cost_item", fake)
    result = kapt_api._collect_ops("http://x", ("a", "b", "c"), "K1", "202605",
                                   kapt_api._extract_amount)

    assert seen == ["a", "b", "c"]
    assert result == {"b": 100, "c": 100}


def test_fetch_costs_for_month_skips_individual_when_common_empty(monkeypatch):
    """[T4] 공용이 비면 개별 서비스를 아예 호출하지 않는다.

    저장 7,757행 중 "개별만 있고 공용이 없는" 행은 0건 — 부를 이유가 없고,
    부르면 '공용 0원' 반쪽 총액을 저장할 위험만 생긴다. 실배선(call_api 만 mock)
    으로 재서, 스킵을 지우면 개별 첫 op 이 더 불려 총 호출 수가 어긋나 FAIL.
    """
    calls = []

    def fake_call(cls, url, params):
        calls.append(url)
        return {"response": {"header": {"resultCode": "00"}, "body": {}}}

    monkeypatch.setattr(kapt_api.KaptAPI, "call_api", classmethod(fake_call))

    assert service_kapt._fetch_costs_for_month("K1", "202605") == {}
    assert len(calls) == 1, "공용 미공개인데 개별까지 호출됨 — 실제 호출 %d건" % len(calls)
    assert "AptCmnuseManageCostServiceV3" in calls[0], "첫 호출은 공용 서비스여야"


def test_fetch_costs_for_month_individual_empty_keeps_common(monkeypatch):
    """[T5] 공용은 공개·개별은 미공개 -> 공용 17키만, 호출은 17 + 1콜.

    실측에 존재하는 조합(공용 17·개별 0) 그대로 — 개별이 비어도 공용 값은 살린다.
    """
    calls = []

    def fake_call(cls, url, params):
        calls.append(url)
        if "AptCmnuseManageCostServiceV3" in url:
            return {"response": {"header": {"resultCode": "00"},
                                 "body": {"item": {"someCost": "100"}}}}
        return {"response": {"header": {"resultCode": "00"}, "body": {}}}

    monkeypatch.setattr(kapt_api.KaptAPI, "call_api", classmethod(fake_call))

    result = service_kapt._fetch_costs_for_month("K1", "202605")

    assert set(result) == set(kapt_api.COMMON_COST_OPS), "공용 17항목이 그대로 남아야"
    assert len(calls) == len(kapt_api.COMMON_COST_OPS) + 1, (
        "공용 17콜 + 개별 첫 op 1콜 = 18 이어야 하는데 %d콜" % len(calls)
    )


def test_collect_costs_unpublished_complex_costs_three_calls(db, monkeypatch):
    """[T6] 통합: 전 후보월 미공개 단지는 총 3콜(월당 1콜)로 끝난다.

    옛 동작은 22콜 × 3개월 = 66콜을 매일 태웠다(미공개 ~228단지 = 하루 ~15,000 헛콜).
    호출 수를 세는 것이 핵심 단언 — empty 계수·저장 0 은 옛 코드도 만족했다.
    """
    _make_complex(db, complex_no="7701")
    _seed_mapping(db, complex_no="7701", kapt_code="U1")

    calls = []

    def fake_call(cls, url, params):
        calls.append(url)
        return {"response": {"header": {"resultCode": "00"}, "body": {}}}

    monkeypatch.setattr(kapt_api.KaptAPI, "call_api", classmethod(fake_call))

    result = collect_kapt_costs(batch_size=10)

    assert len(calls) == len(candidate_cost_months()), (
        "미공개 단지가 후보월당 1콜을 넘겼다 — 실제 %d콜" % len(calls)
    )
    assert result["empty"] == 1
    assert result["collected"] == 0
    assert db.query(KaptManagementCost).count() == 0


def test_body_non_raising_wrapper_keeps_none_contract(monkeypatch):
    """목록·기본정보용 `_body` 는 기존대로 실패에도 None (예외 전파 안 함)."""
    monkeypatch.setattr(kapt_api.KaptAPI, "call_api", classmethod(lambda cls, u, p: None))
    assert kapt_api.KaptAPI._body("http://x", {}) is None


def test_fetch_common_cost_raises_through_real_chain(monkeypatch):
    """`fetch_common_cost` -> `fetch_cost_item` -> `_body_or_raise` 실배선 가드.

    ⚠ 위 collect 계열 테스트들은 `fetch_common_cost` 자체를 mock 하므로 이 구간을
    **한 줄도 지나지 않는다** — 뮤테이션 검증에서 `fetch_cost_item` 을 옛 `_body`
    (실패를 None 으로 삼키는 버전)로 되돌려도 전부 통과해버렸다. 그래서 API 계층
    전체를 실제로 통과시키는 이 테스트가 따로 필요하다.

    call_api 만 mock 해서, 그 아래 `_body_or_raise` -> `fetch_cost_item` ->
    `_collect_ops` -> `fetch_common_cost` 사슬이 예외를 끝까지 올리는지 본다.
    """
    monkeypatch.setattr(kapt_api.KaptAPI, "call_api", classmethod(lambda cls, u, p: None))
    with pytest.raises(KaptApiError):
        kapt_api.fetch_common_cost("K1", "202605")


def test_fetch_individual_cost_raises_through_real_chain(monkeypatch):
    """개별사용료(V3)도 같은 실배선 가드 — 공용(V3)과 별개 함수라 따로 지킨다."""
    monkeypatch.setattr(kapt_api.KaptAPI, "call_api", classmethod(lambda cls, u, p: None))
    with pytest.raises(KaptApiError):
        kapt_api.fetch_individual_cost("K1", "202605")


def test_fetch_common_cost_returns_empty_on_unpublished(monkeypatch):
    """(b) 정상 미공개는 실배선에서도 예외가 아니라 빈 dict 다.

    두 축 분리: 위 실패 테스트와 **응답 내용만** 다르다(둘 다 같은 사슬을 통과) —
    같은 경로에서 (b)와 (c)가 실제로 갈리는지 확인하는 짝 테스트.
    """
    monkeypatch.setattr(
        kapt_api.KaptAPI, "call_api",
        classmethod(
            lambda cls, u, p: {"response": {"header": {"resultCode": "00"}, "body": {}}}
        ),
    )
    assert kapt_api.fetch_common_cost("K1", "202605") == {}


@pytest.mark.parametrize(
    "item, expect_none",
    [
        ({"laborCost": "1000"}, False),  # (a) 성공 + 공개 — item dict 반환
        ({}, True),                       # (b) 성공 + 미공개 — None 반환
    ],
)
def test_fetch_common_cost_probe_makes_exactly_one_low_level_call(
    monkeypatch, item, expect_none
):
    """`fetch_common_cost_probe` 는 첫 op 1콜만 쓴다 — 17콜(`fetch_common_cost`)로

    바뀌어도 기존 카나리 테스트는 전부 `service_kapt.fetch_common_cost_probe` 자체를
    monkeypatch 하므로 이 구간을 한 줄도 지나지 않아 못 잡는다(위
    `test_fetch_common_cost_raises_through_real_chain` 과 같은 이유). 최하위 seam
    (`kapt_api.fetch_cost_item`)을 스파이해 호출 횟수·op 를 직접 단언한다.
    """
    calls = []

    def spy(base_url, op, kapt_code, search_date):
        calls.append((base_url, op, kapt_code, search_date))
        return dict(item) if item else None

    monkeypatch.setattr(kapt_api, "fetch_cost_item", spy)

    result = kapt_api.fetch_common_cost_probe("K1", "202605")

    assert len(calls) == 1, "카나리가 1콜을 넘었다 — 실제 %d콜: %r" % (len(calls), calls)
    _base_url, op, kapt_code, search_date = calls[0]
    assert op == kapt_api.COMMON_COST_OPS[0] == "getHsmpLaborCostInfoV3"
    assert kapt_code == "K1"
    assert search_date == "202605"
    assert (result is None) == expect_none


def test_collect_costs_partial_failure_through_real_api_layer(db, monkeypatch):
    """실배선 통합: 공용(V3) 전량 실패 + 개별(V3) 성공 -> 저장 0 (반쪽 저장 금지).

    이 PR 이 고치는 **실제 사고 시나리오** 그대로다 — 공용 V3 서비스만 한도에 걸려
    17콜이 전부 죽고 개별(사고 당시 V2, 현행 V3) 5콜은 성공하는 상황. `fetch_common_cost` 를 mock 하지
    않고 call_api 레벨에서 URL 로 갈라, API 계층 전체를 실제로 통과시킨다.
    """
    _make_complex(db, complex_no="5501")
    _seed_mapping(db, complex_no="5501", kapt_code="AA")

    def fake_call(cls, url, params):
        if "AptCmnuseManageCostServiceV3" in url:
            return None  # 공용 = 호출 실패 (한도 초과가 XML 로 와 json() 이 터진 모양)
        return {"response": {"header": {"resultCode": "00"},
                             "body": {"item": {"heatC": "300", "heatP": "200"}}}}

    monkeypatch.setattr(kapt_api.KaptAPI, "call_api", classmethod(fake_call))

    result = collect_kapt_costs(batch_size=10)

    assert result["failed"] == 1, "공용 전량 실패가 failed 로 안 잡힘"
    assert result["collected"] == 0
    assert db.query(KaptManagementCost).count() == 0, "공용 0원짜리 반쪽 행이 저장됨"


# ── 연속 전 op 실패 조기 중단 (API 장애/한도가 XML 로 와서 is_quota 가 안 서는 사각) ──
#
# 쿼터 초과(22)가 JSON 으로 오면 `is_quota` 로 1건에 즉시 중단된다. 그런데 같은 상황이
# XML 로 오면 call_api 가 resp.json() 에서 터져 **코드 미상 실패**로 도착해 그 중단이
# 발동하지 않는다 → 남은 단지(최대 250) 전부에 22콜씩 헛호출. 아래는 그 사각의 회귀 가드.


def test_collect_costs_consecutive_failures_stop_batch(db, monkeypatch):
    """연속 5단지 전 op 실패 -> 6번째부터 호출 0 · 잡 failed · 잔여 보고.

    fixture 두 축을 다르게 (testing.md 세션372 답습): 대상 8단지 / 임계 5 /
    잔여 3 이 전부 다른 값이라, 코드가 셋 중 둘을 뒤바꿔 써도 단언이 잡아낸다.
    """
    for i in range(8):
        _make_complex(db, complex_no="60%02d" % i)
        _seed_mapping(db, complex_no="60%02d" % i, kapt_code="K%d" % i)

    called = []

    def common(code, month):
        called.append(code)
        # is_quota 를 세우지 않는다 — XML 에러로 코드 미상 실패가 오는 상황 재현
        raise KaptApiError("응답 없음", code=None, op="getHsmpGuardCostInfoV3")

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["error"] == "api_down"
    # 임계(5)에서 멈췄으므로 6~8번째 단지에는 호출이 아예 안 나간다
    assert called == ["K0", "K1", "K2", "K3", "K4"], "임계 후 헛호출 발생: %r" % (called,)
    assert result["failed"] == 5
    assert result["remaining"] == 3
    assert db.query(KaptManagementCost).count() == 0

    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "failed"
    assert "연속" in (job.error_message or "")
    assert "잔여 3" in (job.error_message or "")


def test_collect_costs_success_resets_consecutive_counter(db, monkeypatch):
    """4실패 + 1성공 + 4실패 -> 중단되지 않는다 (연속이 끊기면 리셋).

    '연속' 이 아니라 '누적' 으로 세면 정상 회차가 통째로 중단된다 — 개별 단지의
    일시적 실패는 흔하기 때문. 두 축을 다르게: 총 실패 8 · 연속 최대 4 · 임계 5.
    """
    for i in range(9):
        _make_complex(db, complex_no="61%02d" % i)
        _seed_mapping(db, complex_no="61%02d" % i, kapt_code="K%d" % i)

    called = []

    def common(code, month):
        called.append(code)
        if code == "K4":  # 5번째만 성공 -> 연속 카운터 리셋
            return {"aV3": 900}
        raise KaptApiError("응답 없음", code=None, op="x")

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    # 9단지 전부 시도됐다 — 중간에 끊기지 않았다
    assert called == ["K%d" % i for i in range(9)], "리셋 실패로 조기 중단됨: %r" % (called,)
    assert result.get("error") != "api_down"
    assert result["collected"] == 1
    assert result["failed"] == 8


def test_collect_costs_unpublished_also_resets_counter(db, monkeypatch):
    """정상 미공개(빈 응답)도 카운터를 리셋한다 — 호출 자체는 성공했으므로.

    미공개는 API 가 살아있다는 증거다. 이걸 리셋에 안 넣으면 '미공개가 드문드문
    섞인 정상 회차' 가 API 장애로 오판돼 중단된다.
    두 축을 다르게: 대상 9 · 미공개 1 · 실패 8 · 임계 5.
    """
    for i in range(9):
        _make_complex(db, complex_no="62%02d" % i)
        _seed_mapping(db, complex_no="62%02d" % i, kapt_code="K%d" % i)

    called = []

    def common(code, month):
        called.append(code)
        if code == "K4":
            return {}  # 미공개 — 예외 아님
        raise KaptApiError("응답 없음", code=None, op="x")

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    # ⚠ 호출 "횟수" 가 아니라 **시도된 단지** 로 센다 — 미공개(K4)는 후보월을 거슬러
    #   올라가며 여러 번 불리는 게 정상이라(월 폴백), 횟수로 세면 9가 아니다.
    assert [c for c in dict.fromkeys(called)] == ["K%d" % i for i in range(9)], (
        "미공개가 카운터를 리셋하지 않아 조기 중단됨: %r" % (called,)
    )
    assert result["empty"] == 1
    assert result["failed"] == 8


def test_collect_costs_quota_stops_before_consecutive_limit(db, monkeypatch):
    """쿼터(22)는 연속 임계를 기다리지 않고 1건에 즉시 중단한다 (기존 동작 보존).

    두 중단 규칙이 겹칠 때 우선순위 가드 — 원인이 확정된 쿼터가 먼저다.
    """
    for i in range(8):
        _make_complex(db, complex_no="63%02d" % i)
        _seed_mapping(db, complex_no="63%02d" % i, kapt_code="K%d" % i)

    called = []

    def common(code, month):
        called.append(code)
        raise KaptApiError("한도 초과", code="22", op="x", is_quota=True)

    monkeypatch.setattr(service_kapt, "fetch_common_cost", common)
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["error"] == "quota_exceeded", "쿼터가 연속 임계에 가려짐"
    assert called == ["K0"], "쿼터인데 임계까지 헛호출함: %r" % (called,)


# ─────── 매칭 정밀도 강화 (분류 꼬리표 · 차수 충돌 · 대조불가 임계) ───────
# prod 실측 발단(2026-08-29): K-apt 세대수가 0/NULL 이라 이름만으로 붙은 533건 중
# 점수 0.9 미만 165건에 오매칭이 다수 섞여 있었다. 아래 표본은 전부 그 실측 쌍이다.


def test_normalize_strips_category_tags():
    """분류 꼬리표는 '내용째' 제거 — 남기면 같은 단지의 점수를 깎는다."""
    assert normalize_complex_name("빌리브라디체(주상복합)") == "빌리브라디체"
    assert normalize_complex_name("보령더포레젠(민간임대)") == "보령더포레젠"
    assert normalize_complex_name("행복마을(도시형)") == "행복마을"
    assert normalize_complex_name("실버빌(실버주택)") == "실버빌"
    assert normalize_complex_name("타워팰리스(주거복합)") == "타워팰리스"
    # 실측상 태그는 콤마로 섞여 온다 — 태그만 빠지고 동 표기는 남아야 한다.
    assert normalize_complex_name("래미안(101동,주상복합)") == "래미안101동"


def test_normalize_strips_category_tags_without_parens():
    """K-apt 는 같은 분류어를 **괄호 없이** 본문에 붙여 온다 — 그쪽도 지워야 한다.

    prod 실측: 우리 쪽 분류어는 100% 괄호 안(12,865건), K-apt 쪽은 100% 괄호 밖(79건).
    괄호 안만 지우면 우리 쪽만 짧아져 격차가 **오히려 벌어진다**.
    """
    assert normalize_complex_name("대산주상복합아파트") == "대산"
    assert normalize_complex_name("루체스타 도시형생활주택") == "루체스타"
    # "도시형생활주택"을 "도시형"이 먼저 먹으면 "생활주택"이 남는다 — 긴 것부터 제거.
    assert "생활주택" not in normalize_complex_name("주안웰가도시형생활주택")


def test_normalize_category_tag_makes_same_complex_identical():
    """꼬리표를 걷어내면 실측 정답 쌍이 1.0 이 된다(기존 0.75~0.78 로 깎였던 것)."""
    assert name_similarity("빌리브라디체(주상복합)", "빌리브라디체") == 1.0
    assert name_similarity("보령더포레젠(민간임대)", "보령 더포레젠") == 1.0
    # 양쪽에 꼬리표가 다른 표기로 붙은 실측 쌍 — 한쪽만 지우면 오탈락한다.
    assert name_similarity("대산(주상복합)", "대산주상복합아파트") == 1.0
    assert name_similarity("루체스타(도시형)", "루체스타 도시형생활주택") == 1.0


def test_normalize_keeps_non_category_paren_content():
    """차수 괄호는 종전대로 내용 보존 — 형제 단지 구분이 무너지면 안 된다(회귀)."""
    assert normalize_complex_name("경희궁의아침(4단지)") == "경희궁의아침4단지"
    assert normalize_complex_name("경희궁의아침(1단지)") != normalize_complex_name(
        "경희궁의아침(4단지)"
    )


def test_ordinal_tokens_extracted_from_all_notations():
    """차수 신호는 N차·N단지·N블록·NBL 표기를 모두 잡는다."""
    assert ordinal_tokens("방주기픈샘2차") == {"2"}
    assert ordinal_tokens("경희궁의아침(4단지)") == {"4"}
    assert ordinal_tokens("한빛마을3블록") == {"3"}
    assert ordinal_tokens("행복도시2BL") == {"2"}
    assert ordinal_tokens("동익파크") == set()


def test_ordinal_conflict_only_when_sets_contradict():
    """서로 부분집합이 아닐 때만 충돌 — 부분집합은 '한쪽이 더 적은 것'이라 모순 아님."""
    assert ordinal_conflict("방주기픈샘2차", "방주기픈샘1차아파트") is True   # {2} vs {1}
    assert ordinal_conflict("방주기픈샘2차", "방주기픈샘2차아파트") is False  # {2} vs {2}
    assert ordinal_conflict("동익파크", "동익파크1차아파트") is False        # {}  vs {1}
    assert ordinal_conflict("동익파크", "동익파크") is False                # {}  vs {}
    # {2} ⊂ {2,7} — 단지 차수는 일치하고 7 은 시공 차수라는 별개 축이다.
    assert ordinal_conflict("분성마을2단지부영", "분성마을2단지부영(북부부영7차)") is False
    # {6,1} ⊃ {1} — 역방향 부분집합도 마찬가지.
    assert ordinal_conflict("현대아이파크홈타운6차1단지", "현대아이파크홈타운1단지") is False


def test_ordinal_ambiguous_covers_missing_and_extra_ordinals():
    """모호 = 차수 정보가 한쪽에 치우침(없거나, 더 많거나). 완전 일치는 모호 아님."""
    assert ordinal_ambiguous("동익파크", "동익파크1차아파트") is True          # {}  vs {1}
    assert ordinal_ambiguous("분성마을2단지부영", "분성마을2단지부영(북부부영7차)") is True
    assert ordinal_ambiguous("현대아이파크홈타운6차1단지", "현대아이파크홈타운1단지") is True
    assert ordinal_ambiguous("방주기픈샘2차", "방주기픈샘2차아파트") is False   # 완전 일치
    # 모순({2} vs {1})은 ordinal_conflict 소관 — 모호로 분류되지 않는다.
    assert ordinal_ambiguous("방주기픈샘2차", "방주기픈샘1차아파트") is False


def test_gate_ordinal_conflict_rejects_even_with_matching_households(db):
    """차수가 다르면 세대수가 **완전히 같아도** 탈락 — 형제 단지는 세대수도 비슷하다.

    실측 쌍 "방주기픈샘2차" ↔ "방주기픈샘1차아파트"(ratio 0.857)는 점수로도,
    세대수로도 못 걸러 통과했었다. 차수 축이 없으면 이 오매칭이 되살아난다.
    """
    cpx = _make_complex(db, name="방주기픈샘2차", households=300)
    # 세대수를 일부러 '완전 일치'로 준다 — 세대수 게이트가 통과시키는 조건.
    cand = _kapt(name="방주기픈샘1차아파트", households=300)
    assert household_within_tolerance(300, 300) is True, "전제: 세대수 게이트는 통과 상태"
    assert name_similarity(cpx.complex_name, cand["kaptName"]) >= 0.85, "전제: 점수도 높다"
    assert pick_best_match(cpx, [cand]) is None


def test_gate_one_side_ordinal_rejected_when_household_unknown(db):
    """한쪽만 차수 + 세대수 대조 불가 = 모호 → 탈락.

    "동익파크"가 무차수 단지인지 "동익파크1차"의 축약인지 가릴 근거가 없다.
    """
    cpx = _make_complex(db, name="동익파크", households=300)
    assert pick_best_match(cpx, [_kapt(name="동익파크1차아파트")]) is None


def test_gate_one_side_ordinal_accepted_when_households_match(db):
    """한쪽만 차수라도 세대수가 대조되면 통과 — 세대수가 모호함을 해소한다.

    ⚠ 위 테스트와 fixture 두 축(이름·세대수)을 일부러 갈라 둔다: 이름 쌍은 똑같이
    두고 kaptdaCnt 유무만 바꿔, 두 경로가 실제로 갈리는지 확인한다.
    """
    cpx = _make_complex(db, name="동익파크", households=300)
    best = pick_best_match(cpx, [_kapt(name="동익파크1차아파트", households=300)])
    assert best is not None


def test_gate_extra_ordinal_accepted_when_households_match(db):
    """한쪽이 시공 차수를 더 적었을 뿐이면(부분집합) 세대수 게이트가 채택한다.

    실측 쌍 "분성마을2단지부영" ↔ "분성마을2단지부영(북부부영7차)" — 단지 차수 2 는
    양쪽 일치하고 7 은 시공 차수라는 별개 축이라 형제 단지가 아니다(세대수 952/952).
    부분집합을 '충돌'로 단정하면 이런 정답이 통째로 탈락한다(드라이런 실측 ~10건).
    """
    cpx = _make_complex(db, name="분성마을2단지부영", households=952)
    cand = _kapt(name="분성마을2단지부영(북부부영7차)", households=952)
    assert ordinal_conflict(cpx.complex_name, cand["kaptName"]) is False, "전제: 모순 아님"
    assert pick_best_match(cpx, [cand]) is not None


def test_gate_extra_ordinal_rejected_when_household_unknown(db):
    """같은 부분집합 쌍이라도 세대수 대조가 안 되면 탈락 — 모호는 세대수만이 푼다.

    ⚠ 위 테스트와 fixture 두 축을 갈라 둔다: 이름 쌍은 똑같이 두고 kaptdaCnt 유무만
    바꿔, 채택/탈락이 세대수 축 하나로 갈리는지 확인한다.
    """
    cpx = _make_complex(db, name="분성마을2단지부영", households=952)
    assert pick_best_match(cpx, [_kapt(name="분성마을2단지부영(북부부영7차)")]) is None


def test_gate_extra_ordinal_rejected_when_households_differ(db):
    """부분집합이어도 세대수가 다르면 탈락 — 형제 오매칭은 세대수 게이트가 막는다.

    "현대아이파크홈타운6차1단지" ↔ "…1단지"({6,1} ⊃ {1})처럼 부분집합 예외를 타는
    쌍에서, 형제 단지 위험을 실제로 막는 건 세대수 게이트라는 것을 직접 단언한다.
    """
    cpx = _make_complex(db, name="현대아이파크홈타운6차1단지", households=1316)
    cand = _kapt(name="현대아이파크홈타운1단지", households=299)   # 다른 형제 단지 세대수
    assert ordinal_conflict(cpx.complex_name, cand["kaptName"]) is False, "전제: 모순 아님"
    assert pick_best_match(cpx, [cand]) is None


@pytest.mark.parametrize("ours,theirs", [
    ("성신2차", "신한2차아파트"),        # 실측 0.75 (차수는 양쪽 2 로 같아 충돌 아님)
    ("우아효성", "우아우성아파트"),        # 실측 0.75
    ("엠시티(주상복합)", "포시티주상복합"),  # 실측 0.857 → 꼬리표 제거 후 0.4
])
def test_gate_no_household_threshold_rejects_lookalike_names(db, ours, theirs):
    """대조 불가 임계 0.85 — 0.75 시절 통과하던 '글자 몇 개만 다른 남남'을 막는다."""
    cpx = _make_complex(db, name=ours)
    assert pick_best_match(cpx, [_kapt(name=theirs)]) is None


def test_gate_no_household_substring_relaxes_threshold(db):
    """포함 관계면 임계를 0.6 으로 완화 — 지역·동명 접두어 붙은 같은 단지 회수."""
    cpx = _make_complex(db, name="강릉송정신원아침도시")
    ratio = name_similarity(cpx.complex_name, "신원아침도시아파트")
    assert ratio < 0.85, f"전제 깨짐: 포함 완화 없이 통과하는 점수 {ratio}"
    assert pick_best_match(cpx, [_kapt(name="신원아침도시아파트")]) is not None

    cpx2 = _make_complex(db, complex_no="1002", name="창전쌍용스윗닷홈")
    assert pick_best_match(cpx2, [_kapt(name="마포창전쌍용스윗닷홈")]) is not None


def test_gate_substring_ignores_too_short_stem(db):
    """짧은 어간(2글자)의 포함은 완화 근거가 못 된다 — 아무 이름에나 걸려 폭발한다.

    "한신아파트"는 접미사 제거 후 "한신" 2글자라 "한신더휴"에 포함된다.
    """
    cpx = _make_complex(db, name="한신아파트", households=100)
    assert _substring_related("한신아파트", "한신더휴") is False, "전제: 짧은 어간은 포함 불인정"
    assert pick_best_match(cpx, [_kapt(name="한신더휴")]) is None


# ─────────────── 전량 실행 정리(reconciliation) ───────────────


def _seed_stale_mapping(db, complex_no="9001", kapt_code="OLD1"):
    """새 규칙에서 탈락할 옛 매칭 1건 + 그 관리비 1건을 과거 시각으로 심는다."""
    from datetime import timedelta

    from utils import utcnow

    old = utcnow() - timedelta(days=40)
    db.add(Complex(
        complex_no=complex_no, complex_name="옛오매칭단지", cortar_no="2611010100",
        real_estate_type_code="APT", total_household_count=500,
    ))
    db.add(KaptComplexMap(
        complex_no=complex_no, kapt_code=kapt_code, kapt_name="옛오매칭단지",
        match_score=0.75, matched_at=old,
    ))
    db.add(KaptManagementCost(
        complex_no=complex_no, cost_month="202605", total_cost=1000,
    ))
    db.commit()


def test_full_run_purges_mappings_not_reconfirmed(db, monkeypatch):
    """전량 실행에서 재확인 안 된 옛 매칭 + 관리비는 삭제된다.

    ⚠ fixture 두 축을 갈라 둔다: 이번에 매칭될 단지(1001)와 옛 행의 단지(9001)를
    서로 다른 법정동에 둬서, '전량 삭제'와 '미재확인분만 삭제'가 구분된다.
    """
    _make_complex(db)                      # 이번 회차에 정상 매칭될 단지
    _seed_stale_mapping(db)                # 재확인되지 않을 옛 행 (다른 단지·다른 법정동)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt", lambda *a, **k: ([_kapt(households=120)], True)
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert result["matched"] == 1
    assert result["purged"] == 1
    assert db.query(KaptComplexMap).filter_by(complex_no="9001").count() == 0
    assert db.query(KaptManagementCost).filter_by(complex_no="9001").count() == 0
    # 이번에 매칭된 단지는 남아 있어야 한다 (전량 삭제가 아님을 단언)
    assert db.query(KaptComplexMap).filter_by(complex_no="1001").count() == 1


def test_partial_run_never_purges(db, monkeypatch):
    """부분 목록 회차는 '못 본 단지'와 '탈락 단지'를 구분 못 하므로 절대 안 지운다."""
    _make_complex(db)
    _seed_stale_mapping(db)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(households=120)], False),   # is_complete=False
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert result["purged"] == 0
    assert db.query(KaptComplexMap).filter_by(complex_no="9001").count() == 1
    assert db.query(KaptManagementCost).filter_by(complex_no="9001").count() == 1


def test_purge_skipped_when_run_matched_nothing(db, monkeypatch):
    """매칭 0건 회차(silent failure)는 정리 전에 멈춘다 — 전량 삭제 사고 차단."""
    _make_complex(db, name="전혀다른이름타워")   # 매칭 실패하도록
    _seed_stale_mapping(db)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt", lambda *a, **k: ([_kapt(households=120)], True)
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert result["matched"] == 0
    assert result.get("purged") is None, "매칭 0건인데 정리가 돌았다"
    assert db.query(KaptComplexMap).filter_by(complex_no="9001").count() == 1


# ───────────── 엄격 규칙 적용 시점 (pass 1 느슨 / pass 2 엄격) ─────────────
#
# PR #433 의 "세대수 대조 불가 시 엄격 규칙"(임계 0.85 / 차수 모호 탈락)이
# **pass 1(후보 선별)** 에서 발동해, basis 를 받으면 세대수가 일치했을 정답까지
# 잘라내던 결함의 회귀 가드. 목록 API(getTotalAptList4)는 kaptdaCnt 를 주지 않아
# pass 1 의 세대수는 **항상** "아직 모름"이지 "알 수 없음 확정"이 아니다.


def test_pass1_keeps_ordinal_ambiguous_candidate_until_basis(db, monkeypatch):
    """차수 모호 후보는 pass 1 에서 살아남아 basis 세대수로 판정돼야 한다.

    prod 실측 표본: 우리 "분성마을2단지부영" ↔ K-apt "분성마을2단지부영(북부부영7차)"
    — 차수 {2} ⊂ {2,7} 라 모호하지만 세대수가 952/952 로 정확히 같은 단지다.

    ⚠ fixture 두 축을 갈라 둔다(testing.md 세션372 답습):
      · 목록 mock 은 kaptdaCnt 를 **주지 않는다**(실제 getTotalAptList4 와 동일)
      · basis mock 만 세대수를 준다
    목록 mock 에 세대수를 넣으면 pass 1 에서 이미 통과해버려 이 결함을 못 본다.
    """
    _make_complex(db, complex_no="7001", name="분성마을2단지부영", households=952)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="K7", name="분성마을2단지부영(북부부영7차)")], True),
    )
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: {"codeHallNm": "계단식", "kaptdaCnt": 952.0},
    )

    result = match_kapt_complexes()

    assert result["matched"] == 1, "차수 모호가 pass 1 에서 잘려 정답을 놓쳤다"
    assert db.query(KaptComplexMap).one().kapt_household_count == 952


def test_pass1_keeps_midscore_candidate_until_basis(db, monkeypatch):
    """0.6~0.85 구간 이름도 pass 1 을 통과해 basis 세대수로 판정돼야 한다.

    포함관계가 아니라 0.85 강화 임계에 걸리던 구간(0.6667)을 표본으로 쓴다 —
    세대수가 같으면 정답이므로 잘라내면 안 된다.
    """
    _make_complex(db, complex_no="7002", name="한신아파트", households=300)
    borderline = "한신더휴"   # 실측 ratio 0.6667 — 0.6 통과 / 0.85 탈락 구간
    assert 0.6 <= name_similarity("한신아파트", borderline) < 0.85

    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="K8", name=borderline)], True),
    )
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: {"codeHallNm": "계단식", "kaptdaCnt": 300.0},
    )

    result = match_kapt_complexes()

    assert result["matched"] == 1, "0.85 임계가 pass 1 에서 발동해 정답을 놓쳤다"


def test_strict_rules_apply_when_basis_household_still_unknown(db, monkeypatch):
    """basis 를 받고도 세대수를 모르면(0/NULL) 그때 엄격 규칙이 발동한다.

    #433 의 규칙 자체는 유지 — 적용 **시점**만 basis 뒤로 옮긴 것이다.
    """
    _make_complex(db, complex_no="7003", name="한신아파트", households=300)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="K9", name="한신더휴")], True),   # ratio 0.6667
    )
    # kapt 세대수 0 → 끝까지 대조 불가
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: {"codeHallNm": "계단식", "kaptdaCnt": 0},
    )

    result = match_kapt_complexes()

    assert result["matched"] == 0, "대조 불가 확정인데 0.85 미만이 저장됐다"
    assert db.query(KaptComplexMap).count() == 0


def test_high_score_saved_when_basis_household_unknown(db, monkeypatch):
    """같은 '대조 불가 확정' 경로라도 0.85 이상이면 저장된다(위 테스트의 짝)."""
    _make_complex(db, complex_no="7004", name="푸르지오시티", households=300)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="KA", name="푸르지오시티2")], True),   # 0.9231
    )
    monkeypatch.setattr(
        service_kapt, "fetch_apt_basis_info",
        lambda code: {"codeHallNm": "계단식", "kaptdaCnt": None},
    )

    result = match_kapt_complexes()

    assert result["matched"] == 1
    assert db.query(KaptComplexMap).one().kapt_household_count is None


def test_ordinal_ambiguous_rejected_when_basis_household_unknown(db, monkeypatch):
    """차수 모호 + 세대수 대조 불가 확정 = 탈락(#433 규칙이 pass 2 에서 살아있음)."""
    _make_complex(db, complex_no="7005", name="동익파크", households=300)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="KB", name="동익파크1차아파트")], True),
    )
    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", lambda code: None)

    result = match_kapt_complexes()

    assert result["matched"] == 0, "차수 모호가 대조 불가 확정에서도 통과했다"


def test_ordinal_conflict_rejected_in_pass1_without_basis_call(db, monkeypatch):
    """차수 **모순**은 세대수와 무관한 규칙이라 pass 1 에서 즉시 탈락한다.

    basis 호출 카운트를 단언해 "쿼터를 태우지 않고 앞단에서 걸렀다"를 증명한다.
    """
    _make_complex(db, complex_no="7006", name="방주기픈샘2차", households=300)
    monkeypatch.setattr(
        service_kapt, "_fetch_all_kapt",
        lambda *a, **k: ([_kapt(code="KC", name="방주기픈샘1차아파트")], True),
    )
    calls = []

    def _basis(code):
        calls.append(code)
        return {"codeHallNm": "계단식", "kaptdaCnt": 300.0}

    monkeypatch.setattr(service_kapt, "fetch_apt_basis_info", _basis)

    result = match_kapt_complexes()

    assert result["matched"] == 0
    assert calls == [], "차수 모순 후보에 basis 를 불러 쿼터를 태웠다"


# ─────────── 매월 갱신 + 슬롯·카나리 (2026-09-19 사장님 결정) ───────────
#
# 옛 계약: "후보월 창(3개월) 안에 아무 달이라도 있으면 그 단지는 건너뛴다" →
#          단지별 갱신이 사실상 3개월에 1회.
# 새 계약: 보유한 가장 최신 달보다 **새 달만** 시도 → 매월 갱신. 재조회 상한은
#          "보유월 이하는 절대 안 부른다" 로 옛 `done` 셋보다 강하게 유지된다.


def _seed_cost(db, complex_no, month, total=100):
    """저장된 관리비 행 1건 (카나리 표본·보유월 fixture 용)."""
    db.add(KaptManagementCost(
        complex_no=complex_no, cost_month=month, total_cost=total,
        common_cost=total, individual_cost=0, household_count=120,
    ))
    db.commit()


def test_collect_costs_stored_newest_month_is_never_refetched(db, monkeypatch):
    """보유월 **이하**는 어떤 경우에도 다시 부르지 않는다 (무한 재조회 방지).

    두 단지를 서로 다른 상태로 둬서 두 축(호출 여부 / 호출한 달)이 한 값으로
    뭉개지지 않게 한다: months[0] 보유 단지는 0콜, months[1] 보유 단지는
    months[0] 1콜뿐이고 months[1]·months[2] 는 안 부른다.
    """
    months = candidate_cost_months()
    _make_complex(db, complex_no="5101")
    _seed_mapping(db, complex_no="5101", kapt_code="CA")
    _seed_cost(db, "5101", months[0])          # 최신달 보유 → 0콜
    _make_complex(db, complex_no="5102")
    _seed_mapping(db, complex_no="5102", kapt_code="CB")
    _seed_cost(db, "5102", months[1])          # 폴백달 보유 → months[0] 만

    called = []
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost",
        lambda code, month: called.append((code, month)) or {},
    )
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    collect_kapt_costs(batch_size=10)

    assert [c for c, _ in called] == ["CB"], f"최신달 보유 단지를 다시 불렀다: {called}"
    assert [m for _, m in called] == [months[0]], f"보유월 이하를 불렀다: {called}"


def test_collect_costs_newer_month_row_coexists_with_older(db, monkeypatch):
    """months[1] 보유 단지에 months[0] 이 공개되면 **두 행이 공존**하고 API 는 최신월.

    매월 갱신은 옛 행을 덮어쓰는 게 아니라 달마다 쌓는 구조다(스키마 무변경).
    """
    months = candidate_cost_months()
    _make_complex(db, complex_no="5103")
    _seed_mapping(db, complex_no="5103", kapt_code="CC")
    _seed_cost(db, "5103", months[1], total=111)

    monkeypatch.setattr(
        service_kapt, "fetch_common_cost",
        lambda code, month: {"aV3": 222} if month == months[0] else {},
    )
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=10)

    assert result["collected"] == 1
    rows = {r.cost_month: r.total_cost for r in db.query(KaptManagementCost).all()}
    assert rows == {months[1]: 111, months[0]: 222}, f"행이 덮어써졌다: {rows}"


def test_kapt_endpoint_serves_newest_of_accumulated_months(db, client):
    """행이 쌓여도 /kapt 는 최신 달을 준다 (매월 갱신이 화면에 반영되는 경로)."""
    months = candidate_cost_months()
    _make_complex(db, complex_no="5104")
    db.add(KaptComplexMap(
        complex_no="5104", kapt_code="CD", kapt_name="경희궁의아침4단지",
        corridor_type="계단식", kapt_household_count=120,
    ))
    db.commit()
    _seed_cost(db, "5104", months[1], total=111)
    _seed_cost(db, "5104", months[0], total=222)

    body = client.get("/api/complexes/5104/kapt").json()

    assert body["cost_month"] == months[0]
    assert body["total_cost"] == 222


def test_collect_costs_unpublished_does_not_consume_slots(db, monkeypatch):
    """미공개 단지는 슬롯을 먹지 않는다 — 앞줄이 전부 미공개여도 batch_size 만큼 수집.

    두 축을 다르게: 미공개 3 + 공개 2, batch_size=2. 슬롯을 미공개까지 세면
    앞 2단지(미공개)에서 배치가 끝나 collected 가 0 이 된다.
    """
    for i in range(3):                       # 큐 앞줄 = 미공개
        _make_complex(db, complex_no=f"52{i:02d}")
        _seed_mapping(db, complex_no=f"52{i:02d}", kapt_code=f"DE{i}")
    for i in range(2):                       # 뒷줄 = 공개
        _make_complex(db, complex_no=f"53{i:02d}")
        _seed_mapping(db, complex_no=f"53{i:02d}", kapt_code=f"DP{i}")

    monkeypatch.setattr(
        service_kapt, "fetch_common_cost",
        lambda code, month: {"aV3": 500} if code.startswith("DP") else {},
    )
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=2)

    assert result["collected"] == 2, "미공개가 슬롯을 먹어 수집이 막혔다"
    assert result["empty"] == 3


def test_collect_costs_empty_scan_cap_stops_loop(db, monkeypatch):
    """미공개 스캔 상한에 닿으면 루프를 멈춘다 (큐 전량 순회 방지).

    상한(2)을 넘는 미공개 5단지를 두고, 훑은 수(total_items)가 상한에서
    멈췄는지로 확인한다 — 미공개를 상한보다 넉넉히 많이 둬서 "상한이 없어도
    같은 값" 인 fixture 를 피한다.
    """
    monkeypatch.setattr(service_kapt, "_EMPTY_SCAN_CAP", 2)
    for i in range(5):
        _make_complex(db, complex_no=f"54{i:02d}")
        _seed_mapping(db, complex_no=f"54{i:02d}", kapt_code=f"EC{i}")
    monkeypatch.setattr(service_kapt, "fetch_common_cost", lambda code, month: {})
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    result = collect_kapt_costs(batch_size=500)

    assert result["empty"] == 2, f"스캔 상한에서 안 멈췄다: {result}"
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.total_items == 2, "훑지도 않은 큐 뒤쪽이 total 에 섞였다"


def test_collect_costs_canary_alive_keeps_job_completed(db, monkeypatch):
    """전량 미공개라도 저장행 생존 확인이 되면 정상 완료 (월초 거짓 경보 차단).

    processed=0 · total=0 이어야 freshness 헛바퀴 감지(processed==0 AND total>0)가
    '정상인데 빨강' 을 만들지 않는다.
    """
    months = candidate_cost_months()
    for i in range(service_kapt._ALL_EMPTY_MIN_TARGETS):
        _make_complex(db, complex_no=f"55{i:02d}")
        _seed_mapping(db, complex_no=f"55{i:02d}", kapt_code=f"FA{i:02d}")
    # 지난달까지 받아둔 단지 1곳 — 카나리 표본
    _make_complex(db, complex_no="5599")
    _seed_mapping(db, complex_no="5599", kapt_code="FZ")
    _seed_cost(db, "5599", months[1])

    monkeypatch.setattr(service_kapt, "fetch_common_cost", lambda code, month: {})
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})
    probes = []
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost_probe",
        lambda code, month: probes.append((code, month)) or {"laborCost": 1},
    )

    result = collect_kapt_costs(batch_size=500)

    assert result.get("canary") == "alive"
    assert probes == [("FZ", months[1])], f"표본당 1콜이 아니거나 달이 틀렸다: {probes}"
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "completed"
    assert (job.processed_items, job.total_items) == (0, 0)


def test_collect_costs_canary_dead_fails_job(db, monkeypatch):
    """표본 3건이 전부 빈 응답이면 API 사망으로 보고 failed."""
    months = candidate_cost_months()
    for i in range(service_kapt._ALL_EMPTY_MIN_TARGETS):
        _make_complex(db, complex_no=f"56{i:02d}")
        _seed_mapping(db, complex_no=f"56{i:02d}", kapt_code=f"GA{i:02d}")
    for i in range(3):
        _make_complex(db, complex_no=f"569{i}")
        _seed_mapping(db, complex_no=f"569{i}", kapt_code=f"GZ{i}")
        _seed_cost(db, f"569{i}", months[1])

    monkeypatch.setattr(service_kapt, "fetch_common_cost", lambda code, month: {})
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})
    probes = []
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost_probe",
        lambda code, month: probes.append(code) or None,
    )

    result = collect_kapt_costs(batch_size=500)

    assert result["error"] == "all_empty"
    assert len(probes) == 3, f"표본 3건을 다 안 찔렀다: {probes}"
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "failed"


def test_collect_costs_canary_uses_older_month_rows_at_month_rollover(db, monkeypatch):
    """months[0] 행이 0건이어도 months[1] 행으로 생존 확인한다 (월 전환일 거짓 경보 차단).

    표본을 months[0] 로 제한하면 달이 막 바뀐 날 표본이 0건이 되어 매월 초
    '표본 없음 → failed' 가짜 경보가 울린다.
    """
    months = candidate_cost_months()
    for i in range(service_kapt._ALL_EMPTY_MIN_TARGETS):
        _make_complex(db, complex_no=f"57{i:02d}")
        _seed_mapping(db, complex_no=f"57{i:02d}", kapt_code=f"HA{i:02d}")
    _make_complex(db, complex_no="5799")
    _seed_mapping(db, complex_no="5799", kapt_code="HZ")
    _seed_cost(db, "5799", months[2])        # 창 안이지만 months[0] 은 아님

    assert db.query(KaptManagementCost).filter(
        KaptManagementCost.cost_month == months[0]
    ).count() == 0, "fixture 전제: months[0] 행이 0건이어야 한다"

    monkeypatch.setattr(service_kapt, "fetch_common_cost", lambda code, month: {})
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})
    probes = []
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost_probe",
        lambda code, month: probes.append((code, month)) or {"laborCost": 1},
    )

    result = collect_kapt_costs(batch_size=500)

    assert result.get("canary") == "alive"
    assert probes == [("HZ", months[2])], f"옛 달 표본을 못 썼다: {probes}"


def test_collect_costs_canary_without_sample_fails_job(db, monkeypatch):
    """찔러볼 저장행이 하나도 없으면 생존을 증명할 수 없다 → failed 유지."""
    for i in range(service_kapt._ALL_EMPTY_MIN_TARGETS):
        _make_complex(db, complex_no=f"58{i:02d}")
        _seed_mapping(db, complex_no=f"58{i:02d}", kapt_code=f"IA{i:02d}")
    monkeypatch.setattr(service_kapt, "fetch_common_cost", lambda code, month: {})
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})
    probes = []
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost_probe",
        lambda code, month: probes.append(code) or {"laborCost": 1},
    )

    result = collect_kapt_costs(batch_size=500)

    assert result["error"] == "all_empty"
    assert probes == [], "표본이 없는데 호출이 나갔다"
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "failed"
    assert "표본 없음" in (job.error_message or "")


def test_collect_costs_canary_call_failure_fails_job_with_reason(db, monkeypatch):
    """카나리 호출이 (c) 실패면 삼키지 않고 failed — '살아있다'의 반대 증거다.

    여기서 KaptApiError 를 잡아 "생존 불명 → 그냥 완료" 로 넘기면, 키 만료·서비스
    폐기가 '정상 완료' 로 위장돼 며칠씩 방치된다(이 모듈이 통째로 막는 결함 유형).
    """
    months = candidate_cost_months()
    for i in range(service_kapt._ALL_EMPTY_MIN_TARGETS):
        _make_complex(db, complex_no=f"60{i:02d}")
        _seed_mapping(db, complex_no=f"60{i:02d}", kapt_code=f"KA{i:02d}")
    _make_complex(db, complex_no="6099")
    _seed_mapping(db, complex_no="6099", kapt_code="KZ")
    _seed_cost(db, "6099", months[1])

    monkeypatch.setattr(service_kapt, "fetch_common_cost", lambda code, month: {})
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    def _boom(code, month):
        raise KaptApiError("일일 한도 초과(22) — op=getHsmpLaborCostInfoV3", code="22")

    monkeypatch.setattr(service_kapt, "fetch_common_cost_probe", _boom)

    result = collect_kapt_costs(batch_size=500)

    assert "error" in result, f"카나리 호출 실패를 삼켰다: {result}"
    from db.models import CrawlJob
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "kapt_costs").one()
    assert job.status == "failed"
    assert "한도 초과" in (job.error_message or ""), (
        f"실패 사유가 잡에 안 남았다: {job.error_message}"
    )


def test_collect_costs_processes_complexes_without_rows_first(db, monkeypatch):
    """관리비 행이 **아예 없는** 단지를 갱신 대상보다 먼저 처리한다.

    화면에 관리비가 통째로 안 뜨는 단지가 '한 달 낡은 단지' 보다 급하다.
    두 축을 다르게: 갱신 대상(행 보유)을 matched_at 이 더 오래된 쪽으로 두어,
    정렬 키가 matched_at 뿐이면 그쪽이 먼저 뽑히도록 만들었다.
    """
    months = candidate_cost_months()
    old = datetime(2020, 1, 1, tzinfo=timezone.utc)
    new = datetime(2026, 1, 1, tzinfo=timezone.utc)
    db.add(KaptComplexMap(                     # 행 보유 + 더 오래된 matched_at
        complex_no="5901", kapt_code="JA", kapt_name="갱신대상",
        kapt_household_count=120, matched_at=old,
    ))
    db.add(KaptComplexMap(                     # 행 없음 + 더 최근 matched_at
        complex_no="5902", kapt_code="JB", kapt_name="신규대상",
        kapt_household_count=120, matched_at=new,
    ))
    db.commit()
    _make_complex(db, complex_no="5901")
    _make_complex(db, complex_no="5902")
    _seed_cost(db, "5901", months[1])

    order = []
    monkeypatch.setattr(
        service_kapt, "fetch_common_cost",
        lambda code, month: order.append(code) or {},
    )
    monkeypatch.setattr(service_kapt, "fetch_individual_cost", lambda code, month: {})

    collect_kapt_costs(batch_size=500)

    assert order[0] == "JB", f"행 없는 단지가 뒤로 밀렸다: {order}"
