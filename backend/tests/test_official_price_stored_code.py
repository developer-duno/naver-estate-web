"""공동주택 공시가격 — 이름이 바뀐 단지를 저장된 정부 단지 번호로 잇기 (세션 468).

배경: 우리 단지명은 네이버 단지 갱신 때마다 덮어써진다. 한때 이름으로 짝지어 저장한 단지가
개명 뒤엔 이름 규칙에 안 걸려 매달 '미매칭 잔여'가 되고 새 해 값도 못 받았다
(10-15 실측 4곳 — 더레이크원 ↔ 정부 '율정마을13단지' 등).

검증 축:
  1. 정상 — 이름이 달라도 저장 번호가 같은 동에 있으면 잇고 저장한다 (새 해·같은 해 재수집)
  2. 다른 동에만 있는 같은 번호는 잇지 않는다
  3. 이름 1차가 이미 가져간 그룹은 빼앗지 않는다 / 번호로 가져간 그룹은 이름 2차가 못 집는다
  4. 세대수 게이트는 그대로 — 불통과면 저장 안 함
  5. 저장 번호 없음(신규)·같은 번호를 두 단지가 쥠 → 지금과 같음(잇지 않음)
  6. 재수집 패스·리 확장 패스에서도 같은 규칙

API 호출은 전부 mock — 실호출 0.
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest

from crawler.service_official_price import _load_stored_aphus_codes, collect_official_prices
from db.models import Complex, ComplexOfficialPrice, CrawlJob
from tests.test_official_price_collector import make_rows_for_complex
from utils import utcnow

_PREV_YEAR = "2026"
_NEW_YEAR = "2027"
_DONG_A = "1168010600"
_DONG_B = "1168010700"  # 정렬상 _DONG_A 뒤 — 본루프가 _DONG_A 를 먼저 조회한다
_GOV_CODE = "20304671"
_GOV_NAME = "율정마을13단지"


# ── 팩토리 ──

def _add_complex(db, complex_no, name, *, cortar_no=_DONG_B, households=10):
    db.add(Complex(complex_no=complex_no, complex_name=name, cortar_no=cortar_no,
                   real_estate_type_code="APT", total_household_count=households))
    db.commit()


def _add_stored_row(db, complex_no, *, aphus_code=_GOV_CODE, stdr_year=_PREV_YEAR,
                    area="84.43", days_ago=30):
    """지난 수집에서 저장된 공시 행 — 정부 단지 번호(aphus_code)를 쥐고 있다."""
    db.add(ComplexOfficialPrice(
        complex_no=complex_no, stdr_year=stdr_year, prvuse_ar=Decimal(area),
        price_median=1_000_000_000, ho_count=10, aphus_code=aphus_code, aphus_nm=_GOV_NAME,
        collected_at=utcnow() - timedelta(days=days_ago),
    ))
    db.commit()


def _fetch_by_dong(rows_by_dong):
    """법정동별로 다른 행을 돌려주는 가짜 조회 — 없는 동은 빈 결과."""
    return patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=lambda cortar, year: rows_by_dong.get(cortar, []),
    )


def _rows(year_rows):
    return {(r.complex_no, r.stdr_year) for r in year_rows}


# ── 1. 정상 ──

def test_renamed_complex_gets_new_year_by_stored_code(db, monkeypatch):
    """우리 '더레이크원' ↔ 정부 '율정마을13단지' — 작년 저장 번호로 새 해 값을 받는다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "132662", "더레이크원")
    _add_stored_row(db, "132662")
    rows = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)

    with _fetch_by_dong({_DONG_B: rows}):
        collect_official_prices(stdr_year=_NEW_YEAR)

    new_rows = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).all()
    assert len(new_rows) == 1
    assert new_rows[0].complex_no == "132662"
    assert new_rows[0].aphus_code == _GOV_CODE
    assert new_rows[0].aphus_nm == _GOV_NAME
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert job.processed_items == 1


def test_renamed_complex_drops_out_of_residual_list_in_same_year(db, monkeypatch):
    """같은 해 재수집 — 번호로 이어져 '짝을 못 찾은 단지' 사유에서 빠지고 재조회도 안 한다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "132662", "더레이크원")
    _add_stored_row(db, "132662", stdr_year=_PREV_YEAR)
    rows = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)

    with _fetch_by_dong({_DONG_B: rows}) as mock_fetch:
        collect_official_prices(stdr_year=_PREV_YEAR)

    assert mock_fetch.call_count == 1, "본루프에서 이어졌으면 재수집 조회가 없어야 한다"
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    assert "짝을 못 찾은" not in (job.error_message or "")
    saved = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.complex_no == "132662").one()
    assert saved.collected_at is not None


# ── 2. 다른 동 ──

def test_stored_code_found_only_in_other_dong_is_not_used(db, monkeypatch):
    """저장 번호의 그룹이 다른 동(먼저 조회된 동)에만 있으면 잇지 않는다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "132662", "더레이크원", cortar_no=_DONG_B)
    _add_stored_row(db, "132662")
    # 다른 동에 있는 아무 단지 — 이 동이 먼저 조회되고 그 결과에 같은 번호의 그룹이 들어 있다.
    _add_complex(db, "OTHER", "다른동단지", cortar_no=_DONG_A)
    rows_a = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)
    rows_b = make_rows_for_complex(aphus_code="99999999", aphus_nm="엉뚱한단지", ho_count=10)

    with _fetch_by_dong({_DONG_A: rows_a, _DONG_B: rows_b}):
        collect_official_prices(stdr_year=_NEW_YEAR)

    assert db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).count() == 0


# ── 3. 우선권 ──

def test_stored_code_does_not_steal_group_taken_by_exact_name(db, monkeypatch):
    """같은 그룹을 이름 1차가 이미 가져갔으면 번호 잇기는 빼앗지 않는다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "NAME", _GOV_NAME)          # 이름이 정부 이름과 그대로 같은 단지
    _add_complex(db, "132662", "더레이크원")      # 번호만 같은 단지
    _add_stored_row(db, "132662")
    rows = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)

    with _fetch_by_dong({_DONG_B: rows}):
        collect_official_prices(stdr_year=_NEW_YEAR)

    new_rows = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).all()
    assert {r.complex_no for r in new_rows} == {"NAME"}


def test_group_taken_by_secondary_name_is_not_taken_again_by_code(db, monkeypatch):
    """이름 2차(부분포함)가 가져간 그룹은 번호 잇기가 다시 못 집는다 — 이중 배정 금지.

    번호는 마지막 수단(이름 1차 → 2차 → 번호)이라 2차가 먼저 가져가고, 번호 단지는 비어 둔다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "26891", "새이름단지")
    _add_stored_row(db, "26891", aphus_code="20135328")
    # '천안청수한양수자인' 은 정부 '한양수자인' 을 부분포함으로 집을 수 있는 이름이다.
    _add_complex(db, "PARTIAL", "천안청수한양수자인")
    rows = make_rows_for_complex(aphus_code="20135328", aphus_nm="한양수자인", ho_count=10)

    with _fetch_by_dong({_DONG_B: rows}):
        collect_official_prices(stdr_year=_NEW_YEAR)

    new_rows = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).all()
    assert {r.complex_no for r in new_rows} == {"PARTIAL"}


def test_secondary_name_match_runs_before_stored_code(db, monkeypatch, caplog):
    """이름 2차로 붙을 단지는 저장 번호가 있어도 2차로 붙는다 — 번호로 이은 수 0.

    순서가 번호 → 2차였다면 지난달 2차로 붙은 단지(10-15 회차 4,471곳)가 이번엔 번호로 먼저
    이어져 2차의 안전장치를 건너뛴다(세션 468 맹점 검사).
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "26891", "천안청수한양수자인")
    _add_stored_row(db, "26891", aphus_code="20135328")
    rows = make_rows_for_complex(aphus_code="20135328", aphus_nm="한양수자인", ho_count=10)

    with caplog.at_level("INFO", logger="crawler.service_official_price"):
        with _fetch_by_dong({_DONG_B: rows}):
            collect_official_prices(stdr_year=_NEW_YEAR)

    saved = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).one()
    assert saved.complex_no == "26891"
    messages = [r.getMessage() for r in caplog.records]
    done = [m for m in messages if "완료: 단지" in m]
    assert done and "이름 2차 매칭 1개" in done[0] and "저장 번호로 이음 0개" in done[0]
    assert not any(m.startswith("[official_price] 저장 번호로 이음:") for m in messages)


def test_code_link_logs_one_line_per_complex(db, monkeypatch, caplog):
    """번호로 이은 단지마다 우리말 한 줄 — 우리 이름 ↔ 정부 이름 (번호)."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "132662", "더레이크원")
    _add_stored_row(db, "132662")
    rows = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)

    with caplog.at_level("INFO", logger="crawler.service_official_price"):
        with _fetch_by_dong({_DONG_B: rows}):
            collect_official_prices(stdr_year=_NEW_YEAR)

    lines = [r.getMessage() for r in caplog.records if "저장 번호로 이음:" in r.getMessage()]
    assert lines == [
        f"[official_price] 저장 번호로 이음: 132662 더레이크원 ↔ {_GOV_NAME} (번호 {_GOV_CODE})"
    ]


# ── 4. 세대수 게이트 ──

def test_stored_code_still_needs_household_gate(db, monkeypatch):
    """번호가 맞아도 호 수가 세대수 ±5% 밖이면 저장하지 않는다(게이트를 끄지 않는다)."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "132662", "더레이크원", households=10)
    _add_stored_row(db, "132662")
    rows = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=7)

    with _fetch_by_dong({_DONG_B: rows}):
        collect_official_prices(stdr_year=_NEW_YEAR)

    assert db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).count() == 0


# ── 5. 저장 번호 없음·모호 ──

def test_complex_without_stored_code_behaves_as_before(db, monkeypatch):
    """신규 단지(저장 번호 없음)는 이름이 다르면 지금처럼 매칭되지 않는다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "NEW", "더레이크원")
    rows = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)

    with _fetch_by_dong({_DONG_B: rows}):
        collect_official_prices(stdr_year=_NEW_YEAR)

    assert db.query(ComplexOfficialPrice).count() == 0


def test_two_complexes_holding_same_stored_code_are_both_skipped(db, monkeypatch):
    """같은 동에서 두 단지가 같은 저장 번호를 쥐면 어느 쪽도 고르지 않는다(임의 선택 금지)."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "X1", "가단지")
    _add_complex(db, "X2", "나단지")
    _add_stored_row(db, "X1")
    _add_stored_row(db, "X2")
    rows = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)

    with _fetch_by_dong({_DONG_B: rows}):
        collect_official_prices(stdr_year=_NEW_YEAR)

    assert db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).count() == 0


def test_load_stored_codes_uses_latest_year_and_drops_ambiguous(db):
    """가장 최근 기준연도의 번호만 쓰고, 그 해 번호가 둘이면 넣지 않는다."""
    _add_stored_row(db, "OLD_NEW", aphus_code="OLD", stdr_year="2025")
    _add_stored_row(db, "OLD_NEW", aphus_code="NEW", stdr_year="2026")
    _add_stored_row(db, "AMBIG", aphus_code="P", stdr_year="2026", area="59.00")
    _add_stored_row(db, "AMBIG", aphus_code="Q", stdr_year="2026", area="84.43")

    assert _load_stored_aphus_codes(db) == {"OLD_NEW": "NEW"}


# ── 6. 재수집·리 확장 ──

def test_repass_links_renamed_complex_by_stored_code(db, monkeypatch):
    """본루프는 드리프트로 게이트 탈락, 재수집 합집합에서 번호로 이어진다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "132662", "더레이크원")
    _add_stored_row(db, "132662", stdr_year=_PREV_YEAR)
    drifted = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=8)
    complete = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[drifted, complete, complete, complete],
    ) as mock_fetch:
        collect_official_prices(stdr_year=_PREV_YEAR)

    # 번호 잇기는 회차가 다 끝난 뒤 최종 합집합에서 — 이름으로는 안 붙으니 상한 3회를 다 뜬다.
    assert mock_fetch.call_count == 1 + 3
    saved = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.complex_no == "132662").one()
    assert saved.ho_count == 10, "재수집 합집합 값으로 갱신돼야 한다"
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert "짝을 못 찾은" not in (job.error_message or "")


def test_repass_exact_name_does_not_take_group_linked_by_code_in_main_loop(db, monkeypatch):
    """한 그룹이 두 단지에 저장되지 않는다 — 본루프 번호 잇기 ↔ 재수집 이름 1차.

    검사관 재현(세션 468): A(개명, 작년 번호 G, 세대 8)·X(정부 이름 그대로, 올해 행 번호 OTHER,
    세대 10). 본루프 조회분 호 8개, 재수집분 호 10개. 양보 규칙 전에는 A 가 번호로 G 를 가져가고
    재수집에서 X 도 G 를 집어 둘 다 저장됐다.
    기대 {X}: 본루프에서 이름이 정확히 같은 미매칭 X 가 있어 A 가 양보 → 재수집에서 이름 주인 X 가 가져간다.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "A", "더레이크원", households=8)
    _add_stored_row(db, "A", aphus_code="G", stdr_year=_PREV_YEAR)
    _add_complex(db, "X", _GOV_NAME, households=10)
    _add_stored_row(db, "X", aphus_code="OTHER", stdr_year=_NEW_YEAR)
    main_rows = make_rows_for_complex(aphus_code="G", aphus_nm=_GOV_NAME, ho_count=8)
    repass_rows = make_rows_for_complex(aphus_code="G", aphus_nm=_GOV_NAME, ho_count=10)

    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[main_rows, repass_rows, repass_rows, repass_rows],
    ):
        collect_official_prices(stdr_year=_NEW_YEAR)

    owners = {
        r.complex_no for r in db.query(ComplexOfficialPrice).filter(
            ComplexOfficialPrice.stdr_year == _NEW_YEAR, ComplexOfficialPrice.aphus_code == "G",
        ).all()
    }
    assert owners == {"X"}, "A 는 양보하고 이름 주인 X 하나만 G 를 가져야 한다"


def test_repass_code_link_yields_to_exact_name_across_attempts(db, monkeypatch):
    """재수집 회차 사이 — 1회차 번호 잇기가 이름 주인에게 양보해 G 의 주인은 하나뿐이다.

    검사관 변이 c 시나리오: A(개명, 올해 번호 G, 세대 8)·X(정부 이름 그대로, 올해 번호 OTHER,
    세대 10). 본루프 호 5개 → 둘 다 탈락, 재수집 1회차 호 8개, 2회차 호 10개.
    기대 {X}: 2회차에 X 가 이름 1차로 가져가고, 번호 잇기(회차가 끝난 뒤 마지막 수단)엔 G 가 이미 claimed.
    """
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "A", "더레이크원", households=8)
    _add_stored_row(db, "A", aphus_code="G", stdr_year=_NEW_YEAR)
    _add_complex(db, "X", _GOV_NAME, households=10)
    _add_stored_row(db, "X", aphus_code="OTHER", stdr_year=_NEW_YEAR)
    sizes = [5, 8, 10, 10]
    batches = [make_rows_for_complex(aphus_code="G", aphus_nm=_GOV_NAME, ho_count=n) for n in sizes]

    run_started = utcnow() - timedelta(minutes=1)  # 시드 행은 30일 전 — '이번에 저장된' 것만 본다
    with patch("crawler.vworld_price_api.fetch_official_prices", side_effect=batches):
        collect_official_prices(stdr_year=_NEW_YEAR)

    owners = {
        r.complex_no for r in db.query(ComplexOfficialPrice).filter(
            ComplexOfficialPrice.stdr_year == _NEW_YEAR, ComplexOfficialPrice.aphus_code == "G",
        ).all()
        if r.collected_at.replace(tzinfo=None) >= run_started.replace(tzinfo=None)
    }
    assert owners == {"X"}


def test_code_link_yields_when_same_name_unmatched_complex_exists(db, monkeypatch):
    """같은 동에 그 그룹과 이름이 정확히 같은 미매칭 단지가 있으면 번호로 잇지 않는다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "132662", "더레이크원", households=10)
    _add_stored_row(db, "132662")
    # 정부 이름 그대로인 단지 — 세대수가 안 맞아 이번 회차엔 이름 1차를 놓친다.
    _add_complex(db, "SAME", _GOV_NAME, households=20)
    rows = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)

    with _fetch_by_dong({_DONG_B: rows}):
        collect_official_prices(stdr_year=_NEW_YEAR)

    assert db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).count() == 0


def test_code_link_proceeds_when_other_unmatched_names_differ(db, monkeypatch):
    """다른 미매칭 단지가 있어도 이름이 그 그룹과 다르면 지금처럼 번호로 잇는다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "132662", "더레이크원", households=10)
    _add_stored_row(db, "132662")
    _add_complex(db, "DIFF", "전혀다른이름", households=20)
    rows = make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)

    with _fetch_by_dong({_DONG_B: rows}):
        collect_official_prices(stdr_year=_NEW_YEAR)

    new_rows = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).all()
    assert {r.complex_no for r in new_rows} == {"132662"}


def test_stored_code_lookup_failure_keeps_the_run_going(db, monkeypatch, caplog):
    """저장 번호 조회가 실패해도 회차는 계속 — 번호 잇기만 빠지고 이름 매칭은 그대로."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "132662", "더레이크원")
    _add_stored_row(db, "132662")
    _add_complex(db, "NAME", "은마아파트")
    rows = (
        make_rows_for_complex(aphus_code=_GOV_CODE, aphus_nm=_GOV_NAME, ho_count=10)
        + make_rows_for_complex(aphus_code="EUNMA", aphus_nm="은마", ho_count=10)
    )

    def _boom(_db):
        raise RuntimeError("조회 실패 재현")

    monkeypatch.setattr("crawler.service_official_price._load_stored_aphus_codes", _boom)
    with _fetch_by_dong({_DONG_B: rows}):
        collect_official_prices(stdr_year=_NEW_YEAR)

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "official_price").one()
    assert job.status == "completed"
    new_rows = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).all()
    assert {r.complex_no for r in new_rows} == {"NAME"}, "번호 잇기 0, 이름 매칭은 그대로"
    assert any("저장 번호" in r.getMessage() for r in caplog.records)


@pytest.fixture
def ri_map_patch(monkeypatch):
    import crawler.cortar_ri_map as ri_map

    monkeypatch.setattr(ri_map, "RI_CODE_MAP", {"9999999900": ["21", "22"]})
    return ri_map


def test_ri_expansion_links_renamed_complex_by_stored_code(db, ri_map_patch, monkeypatch):
    """읍/면 단지도 같은 규칙 — 그 리의 색인 안에서 번호로 잇는다."""
    monkeypatch.setenv("OFFICIAL_PRICE_ENABLED", "true")
    _add_complex(db, "RI", "새이름리단지", cortar_no="9999999900")
    _add_stored_row(db, "RI", aphus_code="RIGOV")
    rows_22 = make_rows_for_complex(aphus_code="RIGOV", aphus_nm="옛이름리단지", ho_count=10)

    # 호출 순서: 본루프(읍/면 0건) → 리 21(0건) → 리 22
    with patch(
        "crawler.vworld_price_api.fetch_official_prices",
        side_effect=[[], [], rows_22],
    ):
        collect_official_prices(stdr_year=_NEW_YEAR)

    new_rows = db.query(ComplexOfficialPrice).filter(
        ComplexOfficialPrice.stdr_year == _NEW_YEAR).all()
    assert {r.complex_no for r in new_rows} == {"RI"}
