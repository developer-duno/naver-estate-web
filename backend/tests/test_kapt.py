"""K-apt 관리비 연동 테스트 (V051) — 매칭 3중 게이트 · 합산 · API · silent failure 가드.

외부 API 호출은 전부 mock — 실제 data.go.kr 호출 0 (conftest 의 외부발송 봉쇄 관례 답습).
"""

import pytest

from crawler import service_kapt
from crawler.service_kapt import (
    candidate_cost_months,
    collect_kapt_costs,
    household_within_tolerance,
    match_kapt_complexes,
    name_similarity,
    normalize_complex_name,
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
    """V3=공용, V2=개별로 갈라 합산하고 세대당 금액을 낸다."""
    breakdown = {
        "getHsmpGuardCostInfoV3": 7_602_810,
        "getHsmpCleaningCostInfoV3": 2_000_000,
        "getHsmpElectricityCostInfoV2": 10_262_622,
    }
    summary = service_kapt._summarize(breakdown, household=120)

    assert summary["common_cost"] == 9_602_810
    assert summary["individual_cost"] == 10_262_622
    assert summary["total_cost"] == 19_865_432
    assert summary["cost_per_household"] == round(19_865_432 / 120)


def test_summarize_without_household_leaves_per_household_none():
    """세대수를 모르면 세대당 금액은 None — 0 으로 채우지 않는다."""
    summary = service_kapt._summarize({"aV3": 100}, household=None)
    assert summary["total_cost"] == 100
    assert summary["cost_per_household"] is None


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
        lambda code, month: {"getHsmpElectricityCostInfoV2": 10_262_622},
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


def test_collect_costs_skips_complex_collected_at_fallback_month(db, monkeypatch):
    """폴백으로 과거 달을 받은 단지도 재조회하지 않는다 (쿼터 무한소모 방지).

    target_month(months[0]) 행만 보고 판단하면, months[1] 로 저장된 단지는
    target_month 행이 영영 안 생겨 매일 22콜 x 3개월을 다시 태운다.
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
    assert called == [], f"과거 달 보유 단지를 재조회함(쿼터 낭비): {called}"


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


def test_kapt_endpoint_404_when_mapped_but_no_cost(db, client):
    """매칭은 있는데 관리비가 아직 없으면 404 — 빈 값 200 금지."""
    _make_complex(db)
    db.add(KaptComplexMap(complex_no="1001", kapt_code="A10021295"))
    db.commit()

    assert client.get("/api/complexes/1001/kapt").status_code == 404


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
