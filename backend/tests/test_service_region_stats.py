"""동네 공식 통계 받기(collect_region_stats) 시험 (세션 473) — fetch 를 가짜로, DB = conftest SQLite.

지키는 것: upsert(같은 키 덮어쓰기) · 짝 안 된 경로 집계(error_message 가 아니라 결과 dict) · 우리 지역 중 값 못 받은 곳 ·
저장 0 → failed · 열쇠 없음·API 오류·표 0행 → failed + 우리말 사유(error-propagation 룰 5) · dry_run 은 DB 쓰기 0.
"""

from datetime import date
from decimal import Decimal

import pytest

from crawler import rone_api
from crawler.service_region_stats import (
    STAT_APT_SALE_MEDIAN,
    STAT_JEONSE_RATIO,
    STAT_RENT_CONVERSION,
    collect_region_stats,
    month_range,
)
from db.models import CrawlJob, RegionStats

TODAY = date(2026, 10, 16)


def _r(path: str, period: str, val, unit: str = "%") -> dict:
    return {"CLS_FULLNM": path, "WRTTIME_IDTFR_ID": period, "DTA_VAL": val, "UI_NM": unit}


def _fetch(tables: dict):
    """표 ID → 행 목록(또는 예외). 부른 순서를 남긴다."""
    calls: list[tuple] = []

    def fetch(statbl_id, start, end):
        calls.append((statbl_id, start, end))
        v = tables[statbl_id]
        if isinstance(v, Exception):
            raise v
        return v

    fetch.calls = calls
    return fetch


JEONSE = [
    _r("충남>천안시>동남구", "202608", 79.41),
    _r("충남>천안시>동남구", "202609", 79.5),
    _r("경기>경부1권>안양시>만안구", "202609", 65.03),
    _r("경기>경부1권>안양시", "202609", 64.0),   # 시 단위 — 짝 없음
]
CONV = [
    _r("전남광주>전남", "202609", 7.27),
    _r("서울>강북지역", "202609", 5.89),          # 권역 — 짝 없음
    _r("서울>강북지역", "202608", 5.9),
    _r("전국", "202609", 6.6),
]
# 중위 매매가격 표 — 원자료 단위 천원("512345" = 5억 1,234.5만원 → 저장 51234.5 만원)
MEDIAN = [
    _r("충남>천안시>동남구", "202609", "512345", "천원"),
    _r("경기>경부1권>안양시>만안구", "202609", "700000", "천원"),
]


def _job(db) -> CrawlJob:
    return db.query(CrawlJob).filter_by(job_type="region_stats").one()


def test_month_range():
    assert month_range(3, TODAY) == ("202607", "202610")
    assert month_range(0, TODAY) == ("202610", "202610")
    assert month_range(11, date(2026, 1, 5)) == ("202502", "202601")


def test_collect_upserts_and_counts_unmatched(db):
    fetch = _fetch({"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": MEDIAN})
    result = collect_region_stats(3, scheduler_job_id="collect_region_stats", today=TODAY, fetch=fetch)

    assert fetch.calls == [
        ("A_2024_00073", "202607", "202610"), ("A_2024_00155", "202607", "202610"),
        ("A_2024_00062", "202607", "202610"),
    ]
    assert result["status"] == "completed"
    assert result["received"] == 10
    assert result["saved"] == 7   # 천안 2 + 만안 1 + 전남 1 + 전국 1 + 중위 매매가격 2
    assert result["unmatched"] == {"경기>경부1권>안양시": 1, "서울>강북지역": 2}

    db.expire_all()
    row = db.get(RegionStats, ("44131", "202608", STAT_JEONSE_RATIO))
    assert float(row.value) == pytest.approx(79.41)
    assert "전국주택가격동향조사" in row.source
    assert db.get(RegionStats, ("46000", "202609", STAT_RENT_CONVERSION)) is not None
    job = _job(db)
    assert job.status == "completed"
    assert (job.total_items, job.processed_items) == (10, 7)
    # 완료여도 빈칸 사유 한 줄(F17) — 실패가 아니라 알림은 없다
    assert job.error_message.startswith("부동산원 값이 없어 빈칸인 우리 지역 ")
    assert "부동산원 지역 이름 2종은 못 맞춤" in job.error_message
    assert result["unknown_prefixes"] == {"count": 0, "sample": []}
    assert job.scheduler_job_id == "collect_region_stats"

    # 우리 지역 중 못 받은 곳 — 천안 동남구·만안구는 받았다
    u = result["uncovered_regions"]
    assert "44131" not in u[STAT_JEONSE_RATIO]["codes"]
    assert "41173" in u[STAT_JEONSE_RATIO]["codes"]          # 안양 동안구는 이번에 없음
    assert "46000" not in u[STAT_RENT_CONVERSION]["codes"]
    assert "11000" in u[STAT_RENT_CONVERSION]["codes"]         # 서울은 권역 행만 와서 못 받음
    assert "44131" not in u[STAT_APT_SALE_MEDIAN]["codes"]     # 중위 매매가격 = 전세가율과 같은 시군구 규칙
    assert "41173" in u[STAT_APT_SALE_MEDIAN]["codes"]

    # G2: 천원 → 만원(÷10)은 중위 매매가격만 — 다른 두 표 값(%)은 그대로
    assert db.get(RegionStats, ("44131", "202609", STAT_APT_SALE_MEDIAN)).value == Decimal("51234.5")
    assert db.get(RegionStats, ("41171", "202609", STAT_APT_SALE_MEDIAN)).value == Decimal("70000")
    assert float(db.get(RegionStats, ("44131", "202609", STAT_JEONSE_RATIO)).value) == pytest.approx(79.5)
    assert float(db.get(RegionStats, ("46000", "202609", STAT_RENT_CONVERSION)).value) == pytest.approx(7.27)
    assert "중위 매매가격" in db.get(RegionStats, ("44131", "202609", STAT_APT_SALE_MEDIAN)).source

    # 다시 돌리면 같은 키는 덮어쓴다(행이 늘지 않는다)
    fetch2 = _fetch({"A_2024_00073": [_r("충남>천안시>동남구", "202608", 80.0)], "A_2024_00155": CONV,
                     "A_2024_00062": MEDIAN})
    collect_region_stats(3, today=TODAY, fetch=fetch2)
    db.expire_all()
    assert float(db.get(RegionStats, ("44131", "202608", STAT_JEONSE_RATIO)).value) == pytest.approx(80.0)
    assert db.query(RegionStats).count() == 7


def test_all_unmatched_is_failed(db):
    fetch = _fetch({
        "A_2024_00073": [_r("서울>강북지역", "202609", 60.0)],
        "A_2024_00155": [_r("서울>강남지역", "202609", 5.0)],
        "A_2024_00062": [_r("서울>강북지역", "202609", "900000", "천원")],
    })
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    job = _job(db)
    assert job.status == "failed"
    assert job.error_message == "받은 행은 3개인데 지역 짝이 하나도 안 맞아요"
    assert db.query(RegionStats).count() == 0


def test_missing_key_is_failed_and_stops_after_first_table(db, monkeypatch):
    monkeypatch.delenv("RONE_API_KEY", raising=False)
    calls: list[str] = []
    real = rone_api.fetch_table

    def fetch(statbl_id, start, end):
        calls.append(statbl_id)
        return real(statbl_id, start, end, get=lambda url, params: pytest.fail("열쇠 없이 부르면 안 된다"))

    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    assert calls == ["A_2024_00073"]   # 둘째 표는 부르지도 않는다
    job = _job(db)
    assert job.status == "failed"
    assert job.error_message.startswith("부동산원 인증키가 없어요")


def test_api_error_on_one_table_is_failed_but_keeps_other(db):
    fetch = _fetch({
        "A_2024_00073": JEONSE,
        "A_2024_00155": rone_api.RoneApiError("부동산원 창구가 응답하지 못했어요(상태 번호 503)"),
        "A_2024_00062": MEDIAN,
    })
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    assert result["saved"] == 5   # 전세가율 3 + 중위 매매가격 2
    job = _job(db)
    assert job.status == "failed"
    assert job.error_message == "부동산원 창구가 응답하지 못했어요(상태 번호 503)"
    assert STAT_RENT_CONVERSION not in result["uncovered_regions"]   # 못 받은 표는 '덮지 못함' 계산에서 뺀다


def test_empty_table_is_failed_not_completed(db):
    """한 표가 0행(INFO-200)이면 '자료 없음'으로 끝내지 않는다(error-propagation 룰 5)."""
    fetch = _fetch({"A_2024_00073": JEONSE, "A_2024_00155": [], "A_2024_00062": MEDIAN})
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    assert "하나도 주지 않았어요" in _job(db).error_message


def test_dry_run_writes_nothing(db):
    fetch = _fetch({"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": MEDIAN})
    result = collect_region_stats(3, today=TODAY, fetch=fetch, dry_run=True)
    assert result["status"] == "dry_run"
    assert len(fetch.calls) == 3          # 호출 수는 같다(표 3개 × 1쪽)
    assert result["tables"][STAT_JEONSE_RATIO]["to_save"] == 3
    assert db.query(RegionStats).count() == 0
    assert db.query(CrawlJob).filter_by(job_type="region_stats").count() == 0


def test_run_script_prints_tables(capsys, monkeypatch):
    import scripts.run_region_stats as script

    fake = {
        "start": "202607", "end": "202610", "status": "dry_run", "error": None, "received": 1, "saved": 0,
        "unmatched": {}, "uncovered_regions": {STAT_JEONSE_RATIO: {"count": 1, "codes": ["41173"]}},
        "tables": {STAT_JEONSE_RATIO: {"statbl_id": "A_2024_00073", "received": 1, "to_save": 1, "saved": 0,
                                       "unmatched": {"서울>강북지역": 1}, "no_value": 0}},
    }
    monkeypatch.setattr("crawler.service_region_stats.collect_region_stats", lambda **kw: fake)
    assert script.main(["--months-back", "24", "--dry-run"]) == 0
    out = capsys.readouterr().out
    assert "받은 행 1" in out and "짝 안 됨: 서울>강북지역 ×1" in out and "41173" in out


# ── 보완 1 (세션 473 검사관 지적) ──

def test_sigungu_rows_all_unmatched_is_failed_even_if_nation_sido_saved(db):
    """F1: 시군구 표에서 전국·시도 줄만 맞고 시군구 줄은 하나도 안 맞으면 failed(시군구가 통째로 빈 회차)."""
    fetch = _fetch({
        "A_2024_00073": [
            _r("전국", "202609", 66.0),
            _r("충남", "202609", 70.0),
            _r("없는도>가시>나구", "202609", 60.0),      # 모르는 시도 = unknown(분모에 안 듦)
            _r("충남>없는시>가구", "202609", 60.0),
            _r("경기>경부1권>없는시>나구", "202609", 61.0),
        ],
        "A_2024_00155": CONV,
        "A_2024_00062": MEDIAN,
    })
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    # 세션 475 후속: 사유에 표 우리말 이름이 들어간다(시군구 표가 둘이라 어느 표인지)
    assert _job(db).error_message == (
        "부동산원 아파트 전세가율 표의 지역 이름 2개 중 0개만 우리 지역과 맞았어요 — 지역 표를 봐 주세요"
    )
    assert result["tables"][STAT_JEONSE_RATIO]["sigungu_paths"] == 2


def test_one_table_all_unmatched_is_failed_even_if_other_saved(db):
    """F16(검사관 A-4 탐침 재현): 전세가율 500행 짝 0 + 전환율 1행 저장 → failed(사유에 표 이름)."""
    fetch = _fetch({
        "A_2024_00073": [_r("서울>강북지역", "202609", 60.0)] * 500,
        "A_2024_00155": [_r("전남광주>전남", "202609", 7.27)],
        "A_2024_00062": MEDIAN,
    })
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    assert result["saved"] == 3   # 전환율 1 + 중위 매매가격 2
    assert _job(db).error_message == "부동산원 아파트 전세가율 표는 500행을 받았는데 지역 짝이 하나도 안 맞아요"


def test_unknown_prefixes_reported(db):
    """F5: 지역 표(region_codes.json)에 없는 운영 단지 코드를 결과에 센다 — 새 구가 생긴 신호."""
    from db.models import Complex

    db.add(Complex(complex_no="X1", complex_name="새구단지", cortar_no="4199910100"))
    db.add(Complex(complex_no="X2", complex_name="있는단지", cortar_no="4413110100"))
    db.commit()
    fetch = _fetch({"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": MEDIAN})
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["unknown_prefixes"] == {"count": 1, "sample": ["41999"]}


# ── 보완 2 (세션 475: 중위 매매가격 표 + F5 조회 순서) ──

def test_new_median_table_empty_is_failed_but_keeps_other_tables(db):
    """G1: 새 표만 0행이어도 기존 규칙대로 failed(자료 없음으로 끝내지 않음) — 다른 두 표는 저장된다."""
    fetch = _fetch({"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": []})
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    assert result["saved"] == 5
    assert "하나도 주지 않았어요" in _job(db).error_message
    assert "아파트 중위 매매가격 표가 202607~202610 자료를 하나도 주지 않았어요" in _job(db).error_message
    assert STAT_APT_SALE_MEDIAN not in result["uncovered_regions"]   # 못 받은 표는 계산에서 뺀다


def test_unit_conversion_only_for_median(db):
    """G2: 천원 → 만원(÷10)은 중위 매매가격만. 소수 값도 Decimal 그대로(반올림 없음)."""
    from crawler.service_region_stats import build_rows

    rows, _, _ = build_rows([_r("충남>천안시>동남구", "202609", "512345")], STAT_APT_SALE_MEDIAN, "출처")
    assert rows[("44131", "202609", STAT_APT_SALE_MEDIAN)]["value"] == Decimal("51234.5")
    rows, _, _ = build_rows([_r("충남>천안시>동남구", "202609", "79.41")], STAT_JEONSE_RATIO, "출처")
    assert rows[("44131", "202609", STAT_JEONSE_RATIO)]["value"] == Decimal("79.41")
    rows, _, _ = build_rows([_r("전남광주>전남", "202609", "7.27")], STAT_RENT_CONVERSION, "출처")
    assert rows[("46000", "202609", STAT_RENT_CONVERSION)]["value"] == Decimal("7.27")


def test_unknown_prefixes_failure_keeps_saved_result(db, monkeypatch):
    """G3: 단지 코드 확인 조회가 터져도 이미 받은 행·잡 결과(completed)는 저장대로다."""
    def boom(_db):
        raise RuntimeError("canceling statement due to statement timeout")

    monkeypatch.setattr("crawler.service_region_stats.unknown_prefixes", boom)
    fetch = _fetch({"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": MEDIAN})
    result = collect_region_stats(3, today=TODAY, fetch=fetch)   # 예외가 밖으로 나오면 안 된다
    assert result["status"] == "completed"
    assert result["unknown_prefixes"] is None
    db.expire_all()
    assert db.query(RegionStats).count() == 7
    job = _job(db)
    assert job.status == "completed"
    assert (job.total_items, job.processed_items) == (10, 7)


# ── 보완 3 (세션 475 검사관 🟡1·3·4) ──

def test_rollback_failure_after_commit_keeps_completed(db, monkeypatch):
    """B1: 단지 코드 조회가 터진 뒤 정리(rollback)까지 터져도, 이미 커밋된 completed 를 failed 로 덮지 않는다."""
    from sqlalchemy.orm import Session

    def boom_query(_db):
        raise RuntimeError("canceling statement due to statement timeout")

    def boom_rollback(self):
        raise RuntimeError("connection already closed")

    with monkeypatch.context() as m:
        m.setattr("crawler.service_region_stats.unknown_prefixes", boom_query)
        m.setattr(Session, "rollback", boom_rollback)
        fetch = _fetch({"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": MEDIAN})
        result = collect_region_stats(3, today=TODAY, fetch=fetch)   # 예외가 밖으로 나오면 안 된다
    assert result["status"] == "completed"
    assert result["unknown_prefixes"] is None
    db.expire_all()
    assert _job(db).status == "completed"
    assert db.query(RegionStats).count() == 7


def test_changed_unit_table_is_not_saved_but_others_are(db):
    """B2: 중위 매매가격 표의 단위가 천원이 아니면 그 표만 저장하지 않고 failed + 우리말 사유."""
    wrong = [{**r, "UI_NM": "만원"} for r in MEDIAN]
    fetch = _fetch({"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": wrong})
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    assert result["saved"] == 5   # 전세가율 3 + 전환율 2(안 맞는 단위 표만 빠짐)
    assert _job(db).error_message == "부동산원 아파트 중위 매매가격 표의 단위가 바뀌어(기대 '천원' · 받은 '만원') 저장하지 않았어요"
    assert db.query(RegionStats).filter_by(stat_code=STAT_APT_SALE_MEDIAN).count() == 0
    assert STAT_APT_SALE_MEDIAN not in result["uncovered_regions"]


def test_changed_unit_on_percent_table_is_not_saved(db):
    """B2: % 표도 같다 — 전세가율 표 단위가 바뀌면 그 표만 막는다."""
    odd = [{**r, "UI_NM": "배"} for r in JEONSE]
    fetch = _fetch({"A_2024_00073": odd, "A_2024_00155": CONV, "A_2024_00062": MEDIAN})
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    assert _job(db).error_message == "부동산원 아파트 전세가율 표의 단위가 바뀌어(기대 '%' · 받은 '배') 저장하지 않았어요"
    assert db.query(RegionStats).filter_by(stat_code=STAT_JEONSE_RATIO).count() == 0
    assert db.query(RegionStats).filter_by(stat_code=STAT_APT_SALE_MEDIAN).count() == 2


@pytest.mark.parametrize("statbl_id,words", [
    ("A_2024_00073", "아파트 전세가율"), ("A_2024_00155", "전월세전환율"), ("A_2024_00062", "아파트 중위 매매가격"),
])
def test_empty_table_reason_uses_korean_table_name(db, statbl_id, words):
    """B3: 0행 사유에 표 번호가 아니라 우리말 표 이름이 들어간다(세 표 공통)."""
    tables = {"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": MEDIAN, statbl_id: []}
    result = collect_region_stats(3, today=TODAY, fetch=_fetch(tables))
    assert result["status"] == "failed"
    msg = _job(db).error_message
    assert msg == f"부동산원 {words} 표가 202607~202610 자료를 하나도 주지 않았어요"
    assert "A_2024" not in msg and "00" not in msg.split("표가")[0]


def test_every_table_has_korean_name_and_expected_unit():
    """B3: 표를 하나 더하면 우리말 이름·기대 단위도 같이 — 빠지면 사유 만들 때 KeyError 로 터진다."""
    from crawler.service_region_stats import EXPECTED_UNIT, REGION_STAT_TABLES, SOURCE_OF, TABLE_WORDS

    for _, stat, _ in REGION_STAT_TABLES:
        assert stat in TABLE_WORDS and stat in EXPECTED_UNIT and stat in SOURCE_OF


def test_blank_unit_rows_count_as_mismatch(db):
    """🟡8: UI_NM 이 빈 행(또는 빠진 행)이 섞이면 단위 불일치로 보고 그 표를 저장하지 않는다(failed)."""
    blank = [{**MEDIAN[0], "UI_NM": ""}, {k: v for k, v in MEDIAN[1].items() if k != "UI_NM"}]
    fetch = _fetch({"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": blank})
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    assert _job(db).error_message == "부동산원 아파트 중위 매매가격 표의 단위가 바뀌어(기대 '천원' · 받은 '(없음)') 저장하지 않았어요"
    assert db.query(RegionStats).filter_by(stat_code=STAT_APT_SALE_MEDIAN).count() == 0
    assert result["saved"] == 5


# ── 후속 (세션 475: 시군구 표 둘 다 짝 비율 검사 · 버려지는 사유도 경고 로그) ──

# 시군구 3줄 중 1줄만 맞는 표(33% < 문턱 50%) — 저장은 1행 되므로 "저장 0" 사유와 겹치지 않는다
BROKEN_SIGUNGU = [
    ("충남>천안시>동남구", "202609"),
    ("충남>없는시>가구", "202609"),
    ("경기>경부1권>없는시>나구", "202609"),
]


@pytest.mark.parametrize("broken_id,words,unit", [
    ("A_2024_00062", "아파트 중위 매매가격", "천원"),
    ("A_2024_00073", "아파트 전세가율", "%"),
])
def test_sigungu_match_checked_on_each_sigungu_table(db, broken_id, words, unit):
    """F2: 시군구 표 둘(전세가율·중위 매매가격) 중 어느 한 표만 짝이 무너져도 failed + 그 표 이름 사유."""
    tables = {"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": MEDIAN}
    tables[broken_id] = [_r(p, m, "100", unit) for p, m in BROKEN_SIGUNGU]
    result = collect_region_stats(3, today=TODAY, fetch=_fetch(tables))
    assert result["status"] == "failed"
    assert _job(db).error_message == (
        f"부동산원 {words} 표의 지역 이름 3개 중 1개만 우리 지역과 맞았어요 — 지역 표를 봐 주세요"
    )


def test_conversion_table_is_not_sigungu_checked(db):
    """F2: 전환율 표는 시도·권역 표라 시군구 짝 검사에서 뺀다 — 시군구 줄이 없어도 completed."""
    fetch = _fetch({"A_2024_00073": JEONSE, "A_2024_00155": CONV, "A_2024_00062": MEDIAN})
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "completed"
    assert result["tables"][STAT_RENT_CONVERSION]["sigungu_paths"] == 0


def test_dropped_reasons_are_logged_unit_then_empty(db, caplog):
    """F3: 앞 표 단위 불일치 + 뒤 표 0행 → 기록은 첫 사유 그대로, 뒤 사유는 경고 로그(표 이름 + 사유) · 0행 로그도."""
    import logging

    caplog.set_level(logging.WARNING, logger="crawler.service_region_stats")
    odd = [{**r, "UI_NM": "배"} for r in JEONSE]
    fetch = _fetch({"A_2024_00073": odd, "A_2024_00155": CONV, "A_2024_00062": []})
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    assert _job(db).error_message == "부동산원 아파트 전세가율 표의 단위가 바뀌어(기대 '%' · 받은 '배') 저장하지 않았어요"
    msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    dropped = [m for m in msgs if "기록엔 첫 사유만" in m]
    assert dropped == [
        "동네 공식 통계: 기록엔 첫 사유만 남아 이 사유는 로그로만 — [아파트 중위 매매가격] "
        "부동산원 아파트 중위 매매가격 표가 202607~202610 자료를 하나도 주지 않았어요"
    ]
    assert any("A_2024_00062(아파트 중위 매매가격) 0행" in m for m in msgs)


def test_dropped_sigungu_reason_is_logged_when_both_tables_broken(db, caplog):
    """F2+F3: 시군구 표 둘 다 무너지면 기록 = 앞 표(전세가율) 사유, 중위 매매가격 사유는 경고 로그."""
    import logging

    caplog.set_level(logging.WARNING, logger="crawler.service_region_stats")
    fetch = _fetch({
        "A_2024_00073": [_r(p, m, 60.0) for p, m in BROKEN_SIGUNGU],
        "A_2024_00155": CONV,
        "A_2024_00062": [_r(p, m, "100", "천원") for p, m in BROKEN_SIGUNGU],
    })
    result = collect_region_stats(3, today=TODAY, fetch=fetch)
    assert result["status"] == "failed"
    assert "아파트 전세가율 표의 지역 이름 3개 중 1개만" in _job(db).error_message
    dropped = [r.getMessage() for r in caplog.records if "기록엔 첫 사유만" in r.getMessage()]
    assert len(dropped) == 1
    assert "[아파트 중위 매매가격]" in dropped[0] and "지역 이름 3개 중 1개만" in dropped[0]


# ── 수동 실행 종료 코드 (세션 480 — 세션 478 함정: completed + 빈칸 안내인데 종료 코드 1) ──

def _fake_result(status, error):
    return {
        "start": "202607", "end": "202610", "status": status, "error": error, "received": 1, "saved": 1,
        "unmatched": {}, "uncovered_regions": {}, "tables": {},
    }


def test_run_script_exit_zero_when_completed_with_gap_note(monkeypatch):
    """completed 인데 error 칸에 빈칸 안내(예: 군 71곳 빈칸)가 실려도 실패가 아니다 → 0."""
    import scripts.run_region_stats as script

    monkeypatch.setattr(
        "crawler.service_region_stats.collect_region_stats",
        lambda **kw: _fake_result("completed", "군 71곳은 값이 비어 있어요"),
    )
    assert script.main([]) == 0


def test_run_script_exit_one_when_failed_or_dry_run_problem(monkeypatch):
    """failed 는 1 · 시험 실행(dry_run)인데 실패 사유가 있으면 1(진짜 돌리면 failed 가 될 회차)."""
    import scripts.run_region_stats as script

    for status, error in (("failed", "부동산원 인증키가 없어요"), ("dry_run", "받은 행이 0개예요")):
        monkeypatch.setattr(
            "crawler.service_region_stats.collect_region_stats",
            lambda status=status, error=error, **kw: _fake_result(status, error),
        )
        assert script.main(["--dry-run"]) == 1, status
