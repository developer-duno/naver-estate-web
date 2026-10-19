"""면적별 시세(B27) 회귀 — 세션 474 PR 5 (사장님 결정 D1 새 표 · D2 정수 ㎡ 내림 · D3 대표 면적 · D4 핵심만).

픽스처 = 단지 6139(자연, 대전 유성 궁동) 운영 실측(2026-10-19)을 그대로 옮긴 것:
  평형 42.48㎡(12세대) · 59.98(116) · 84.36 · 84.85 · 84.93 · 84.96 · 84.97(각 13~15세대)
  정부 거래 2026-04 84.94㎡ 22,000 · 05 59.99㎡ 18,000 · 06 59.99㎡ 15,700·17,200
  → 대표 묶음 59 · 59 중위 17,200(3건) · 84 = 22,000(1건) · 42 없음.
달은 오늘 기준 최근 6개월 안에 들도록 M04·M05·M06 으로 옮겨 쓴다(실제 달 이름은 주석 대응).
"""

import re
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from crawler.area_group import area_group_of, parse_households, pick_representative
from crawler.service_public import _recent_months
from db.models import (
    Complex,
    ComplexAreaTradeStat,
    ComplexPriceHistory,
    ComplexPyeongDetail,
)
from utils import utcnow

M04, M05, M06 = _recent_months(date.today(), 4)[:3]  # 6139 의 2026-04 · 05 · 06 자리

# (pyeong_no, 전용면적, 세대수) — 6139 평형표
PYEONG_6139 = [
    (1, "42.48", "12"),
    (2, "59.98", "116"),
    (3, "84.36", "15"),
    (4, "84.85", "13"),
    (5, "84.93", "14"),
    (6, "84.96", "13"),
    (7, "84.97", "15"),
]


def _trade(umd, apt, amount, area, cancelled=False):
    return {
        "umdNm": umd, "aptNm": apt, "dealAmount": amount,
        "excluUseAr": area, "cdealType": "O" if cancelled else " ",
    }


TRADES_6139 = {
    M04: [_trade("궁동", "자연", "22,000", "84.94")],
    M05: [_trade("궁동", "자연", "18,000", "59.99")],
    M06: [_trade("궁동", "자연", "15,700", "59.99"), _trade("궁동", "자연", "17,200", "59.99")],
}


def _add_6139(db, *, rep=None, with_pyeong=True):
    db.add(Complex(
        complex_no="6139", complex_name="자연", cortar_no="3020012300",
        cortar_address="대전광역시 유성구 궁동", real_estate_type_code="APT",
        total_household_count=228, rep_area_m2=rep,
    ))
    if with_pyeong:
        for pno, area, hh in PYEONG_6139:
            db.add(ComplexPyeongDetail(
                complex_no="6139", pyeong_no=pno, exclusive_area=area, household_count_by_pyeong=hh,
            ))
    db.commit()


def _add_gov_area_rows(db, recorded_at=None):
    """6139 면적별 정부 표 — 수집기가 쓰는 함수 그대로."""
    from crawler.service_common import _upsert_area_stats

    _upsert_area_stats(db, "6139", M04, 84, [22000])
    _upsert_area_stats(db, "6139", M05, 59, [18000])
    _upsert_area_stats(db, "6139", M06, 59, [17200, 15700])
    if recorded_at is not None:
        db.query(ComplexAreaTradeStat).update({ComplexAreaTradeStat.recorded_at: recorded_at})
    db.commit()


def _add_legacy_gov_rows(db):
    """옛 정부 달 평균 줄(area_no '' · 6자리) — 면적이 섞인 값. 새 계산·그래프는 이것을 쓰면 안 된다."""
    for month, avg, low, high in ((M04, 22000, 22000, 22000), (M05, 18000, 18000, 18000), (M06, 16450, 15700, 17200)):
        db.add(ComplexPriceHistory(
            complex_no="6139", trade_type="A1", area_no="", base_month=month,
            price_avg=avg, price_lower=low, price_upper=high,
        ))
    db.commit()


def _area_rows(db, complex_no="6139"):
    db.expire_all()
    return {
        (r.base_month, r.area_m2): r
        for r in db.query(ComplexAreaTradeStat).filter(ComplexAreaTradeStat.complex_no == complex_no)
    }


# ── I2 면적 묶음 ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("value, expected", [
    ("84.94", 84), ("84.00", 84), ("84.99", 84), ("59.98", 59), (59.99, 59), (84, 84), (" 84.5 ", 84),
    ("", None), (None, None), ("abc", None), (0, None), ("0", None), (-3.2, None), (0.5, None), (True, None),
])
def test_area_group_of_경계(value, expected):
    assert area_group_of(value) == expected


def test_세대수_문자열_읽기():
    assert parse_households("116") == 116
    assert parse_households("1,116세대") == 1116
    assert parse_households("") == 0
    assert parse_households(None) == 0


def _table(rows):
    return [(pno, area_group_of(area), parse_households(hh)) for pno, area, hh in rows]


def test_대표면적_6139는_세대수_최다_59():
    assert pick_representative(_table(PYEONG_6139), {84: 1, 59: 3}) == 59
    # 거래가 84 쪽만 있어도 대표는 세대수로 정한다(84 묶음 합 70 < 59 묶음 116)
    assert pick_representative(_table(PYEONG_6139), {84: 9}) == 59


def test_대표면적_세대수_동률이면_거래수_그다음_작은_면적():
    table = [(1, 59, 100), (2, 84, 100)]
    assert pick_representative(table, {59: 1, 84: 2}) == 84
    assert pick_representative(table, {59: 2, 84: 2}) == 59
    assert pick_representative(table, None) == 59


def test_대표면적_평형표_없으면_거래수_최다_동률이면_작은_면적():
    assert pick_representative([], {59: 1, 84: 3}) == 84
    assert pick_representative(None, {59: 2, 84: 2}) == 59
    assert pick_representative([(1, None, 50)], {84: 1}) == 84  # 면적을 못 읽는 평형표 = 없는 것과 같다
    assert pick_representative([], {}) is None


def test_representative_area_DB(db):
    from crawler.area_group import pyeong_area_groups, representative_area

    _add_6139(db)
    assert representative_area(db, "6139", {84: 5}) == 59
    assert pyeong_area_groups(db, "6139") == {1: 42, 2: 59, 3: 84, 4: 84, 5: 84, 6: 84, 7: 84}
    assert representative_area(db, "없는단지", {84: 2, 59: 1}) == 84


# ── I3 수집기 ────────────────────────────────────────────────────────────────


def test_aggregate_by_area_해제_면적없음_제외(db):
    from crawler.public_trade_match import SigunguMatcher

    _add_6139(db)
    matcher = SigunguMatcher.from_db(db, "30200")
    trades = TRADES_6139[M06] + [
        _trade("궁동", "자연", "99,000", "59.99", cancelled=True),   # 해제 → 둘 다 제외
        _trade("궁동", "자연", "30,000", ""),                        # 면적 없음 → 묶음에서만 제외
        _trade("궁동", "다른단지", "40,000", "59.99"),               # 짝 없음
        _trade("궁동", "자연", "0", "59.99"),                         # 가격 0
    ]
    assert matcher.aggregate_by_area(trades) == {"6139": {59: [15700, 17200]}}
    assert matcher.aggregate(trades) == {"6139": [15700, 17200, 30000]}  # 옛 달 평균 줄엔 면적 없는 거래도 그대로
    assert matcher.aggregate_by_area(TRADES_6139[M04]) == {"6139": {84: [22000]}}


def test_upsert_area_stats_중위_정렬_JSON(db):
    from crawler.service_common import _upsert_area_stats

    _upsert_area_stats(db, "6139", M06, 59, [17200, 15700])
    db.commit()
    row = _area_rows(db)[(M06, 59)]
    assert (row.trade_count, row.price_median, row.price_min, row.price_max) == (2, 16450, 15700, 17200)
    assert row.prices == [15700, 17200]

    _upsert_area_stats(db, "6139", M06, 59, [18000])  # 같은 열쇠 = 덮어쓰기
    db.commit()
    rows = _area_rows(db)
    assert len(rows) == 1
    assert (rows[(M06, 59)].trade_count, rows[(M06, 59)].price_median, rows[(M06, 59)].prices) == (1, 18000, [18000])


def _run_weekly(trades_by_month, months=(M04, M05, M06)):
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()
    from crawler.service_public import collect_public_trade_data

    def _fake(sigungu_cd, deal_ymd):
        return list(trades_by_month.get(deal_ymd, [])) if sigungu_cd == "30200" else []

    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}), \
         patch("crawler.service_public._recent_months", return_value=list(months)), \
         patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake):
        collect_public_trade_data(batch_size=10, scheduler_job_id="collect_public_trades")


def test_주간수집_면적별_저장_옛줄은_그대로(db):
    _add_6139(db)
    _run_weekly(TRADES_6139)

    rows = _area_rows(db)
    assert set(rows) == {(M04, 84), (M05, 59), (M06, 59)}
    assert (rows[(M06, 59)].price_median, rows[(M06, 59)].trade_count) == (16450, 2)
    # 옛 달 평균 줄도 지금처럼 그대로 쓴다(미분양이 계속 읽음)
    legacy = {
        r.base_month: r.price_avg
        for r in db.query(ComplexPriceHistory).filter(ComplexPriceHistory.area_no == "")
    }
    assert legacy == {M04: 22000, M05: 18000, M06: 16450}


def test_주간수집_안_쓰인_면적줄은_같은_기준으로_지운다(db):
    _add_6139(db)
    old = utcnow() - timedelta(days=10)
    db.add_all([
        ComplexAreaTradeStat(complex_no="6139", base_month=M06, area_m2=84, trade_count=1,
                             price_median=1, price_min=1, price_max=1, prices=[1], recorded_at=old),  # 거래 온 달·안 쓰임 → 삭제
        ComplexAreaTradeStat(complex_no="6139", base_month="201001", area_m2=84, trade_count=1,
                             price_median=2, price_min=2, price_max=2, prices=[2], recorded_at=old),  # 달 목록 밖 → 유지
    ])
    db.commit()

    _run_weekly(TRADES_6139)

    rows = _area_rows(db)
    assert (M06, 84) not in rows
    assert ("201001", 84) in rows
    assert (M06, 59) in rows


def test_주간수집_지울줄이_절반을_넘으면_면적줄도_건너뛴다(db):
    _add_6139(db)
    old = utcnow() - timedelta(days=10)
    db.add_all([
        ComplexAreaTradeStat(complex_no="6139", base_month=M06, area_m2=a, trade_count=1,
                             price_median=1, price_min=1, price_max=1, prices=[1], recorded_at=old)
        for a in (42, 84, 85, 86)
    ])
    db.commit()

    _run_weekly(TRADES_6139)

    rows = _area_rows(db)
    # 지울 줄 4 × 2 > 보유 7(새 3 + 옛 4) → 옛 달 평균 줄 정리와 같은 차단기로 건너뛴다
    assert {(M06, 42), (M06, 84), (M06, 85), (M06, 86)} <= set(rows)


def test_소급도_면적별_저장하고_안_쓰인_줄을_지운다(db):
    from crawler.public_data_api import PublicDataAPI
    from crawler.service_public import backfill_price_history

    _add_6139(db)
    old = utcnow() - timedelta(days=10)
    db.add(ComplexAreaTradeStat(complex_no="6139", base_month=M04, area_m2=59, trade_count=1,
                                price_median=5, price_min=5, price_max=5, prices=[5], recorded_at=old))
    db.commit()
    PublicDataAPI.reset()

    def _fake(sigungu_cd, deal_ymd):
        return list(TRADES_6139.get(deal_ymd, []))

    with patch("crawler.service_public._recent_months", return_value=[M04, M05, M06]), \
         patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake):
        backfill_price_history("6139", months_back=3)

    rows = _area_rows(db)
    assert set(rows) == {(M04, 84), (M05, 59), (M06, 59)}  # 옛 (M04, 59) 는 이번에 안 쓰여 지워짐
    assert rows[(M04, 84)].prices == [22000]


# ── I4 가치지표 ──────────────────────────────────────────────────────────────


def _metric_values(db, complex_no="6139"):
    db.expire_all()
    c = db.get(Complex, complex_no)
    return (c.rep_area_m2, c.nearby_median_price, c.jeonse_rate, c.recent_trades_6m)


def test_가치지표_6139_대표면적_59_값(db):
    from crawler.service_metrics import collect_complex_metrics

    _add_6139(db)
    _add_gov_area_rows(db)
    _add_legacy_gov_rows(db)  # 섞인 옛 줄(중위 18,000 을 만들던 재료)은 안 쓴다
    # 네이버 주간 전세 = 42㎡ 평형(1) 줄 — 옛 계산은 이것을 섞인 매매값으로 나눠 53.6% 를 냈다
    db.add(ComplexPriceHistory(complex_no="6139", trade_type="B1", area_no="1",
                               base_month=f"{M05}19", price_avg=9650))
    db.commit()

    collect_complex_metrics(batch_size=0)

    assert _metric_values(db) == (59, 17200, None, 3)  # 59㎡ 전세 시세 없음 → 전세가율 빈 값


def test_가치지표_전세가율은_같은_묶음_네이버_전세_나누기_정부_중위(db):
    from crawler.service_metrics import collect_complex_metrics

    _add_6139(db)
    _add_gov_area_rows(db)
    for day, price in (("05", 12000), ("12", 13000)):  # 59.98㎡ 평형 2 = 59 묶음 · 8자리 주간
        db.add(ComplexPriceHistory(complex_no="6139", trade_type="B1", area_no="2",
                                   base_month=f"{M06}{day}", price_avg=price))
    db.add(ComplexPriceHistory(complex_no="6139", trade_type="B1", area_no="1",
                               base_month=f"{M06}05", price_avg=9650))  # 42 묶음 — 59 전세가율에 안 섞임
    db.commit()

    collect_complex_metrics(batch_size=0)

    assert _metric_values(db) == (59, 17200, 72.7, 3)  # 12,500 ÷ 17,200


def test_가치지표_매매_재료는_정부_표만_빈줄_네이버A1_제외(db):
    """보완 ①: 매매 재료 = 면적별 정부 표만. 옛 '' 줄도, 네이버 A1 평형번호 줄(8자리)도 섞지 않는다.

    뮤테이션 표적 ① A1 줄을 건너뛰는 `continue` 를 빼면 네이버 A1 줄(평형 5 → 84)이 재료로 흘러 b1 이 비지 않는다.
    ② `if not area_no: continue` 를 빼면 빈 area_no 전세 줄이 평형 찾기로 흘러 unmapped 가 1 이 된다.
    둘 다 값(중위)만 보면 못 잡아 재료 묶음·unmapped 를 직접 단언한다."""
    from crawler.metrics_helpers import _cutoff_month
    from crawler.service_metrics import _load_recent_prices

    _add_6139(db)
    _add_gov_area_rows(db)
    _add_legacy_gov_rows(db)
    # 네이버 A1 평형 줄(84.93㎡ 평형 5 → 84 묶음) — 호가 기반 시세라 매매 재료가 아니다
    db.add(ComplexPriceHistory(complex_no="6139", trade_type="A1", area_no="5",
                               base_month=f"{M06}05", price_avg=23000))
    # 면적 모르는 전세 줄 — 전세 재료에서도 빠진다
    db.add(ComplexPriceHistory(complex_no="6139", trade_type="B1", area_no="",
                               base_month=f"{M06}05", price_avg=9000))
    db.commit()

    m = _load_recent_prices(db, _cutoff_month(6))
    assert m.unmapped == 0
    assert m.a1["6139"] == {84: [22000], 59: [18000, 15700, 17200]}
    assert m.b1 == {}
    assert "6139" in m.seen and m.gov_rows == 3


def test_가치지표_재료_없는_후보는_네_칸을_비운다(db):
    """옛 빈 area_no 줄만 있는 단지 = 후보(최근 매매 평균가 줄 있음)이지만 면적 재료 0 → 옛 섞인 값으로 안 돌아간다."""
    from crawler.service_metrics import collect_complex_metrics

    _add_6139(db)
    _add_gov_area_rows(db)  # 이 단지는 정상 — 회차가 '면적별 0줄' 안전장치로 멈추지 않게
    db.add(Complex(complex_no="7001", complex_name="옛줄만", cortar_no="3020012300",
                   cortar_address="대전광역시 유성구 궁동", real_estate_type_code="APT",
                   nearby_median_price=50000, jeonse_rate=60.0, recent_trades_6m=4, rep_area_m2=None))
    db.add(ComplexPriceHistory(complex_no="7001", trade_type="A1", area_no="", base_month=M06, price_avg=50000))
    db.commit()

    collect_complex_metrics(batch_size=0)

    assert _metric_values(db, "7001") == (None, None, None, None)
    assert _metric_values(db) == (59, 17200, None, 3)


def test_가치지표_대표면적에_매매가_없으면_빈값_0건(db):
    from crawler.service_common import _upsert_area_stats
    from crawler.service_metrics import collect_complex_metrics

    _add_6139(db)
    _upsert_area_stats(db, "6139", M06, 84, [22000, 23000])  # 84 거래만 — 대표(59)는 0건
    db.commit()

    collect_complex_metrics(batch_size=0)

    assert _metric_values(db) == (59, None, None, 0)


def test_가치지표_면적별_표가_비면_아무것도_안_쓰고_failed(db):
    """운영 첫 주간 수집 전(새 표 0줄) — 네이버 평형 줄만으로 거의 모든 단지를 비우지 않게 멈춘다."""
    from crawler.service_metrics import collect_complex_metrics
    from db.models import CrawlJob

    _add_6139(db)
    db.query(Complex).filter(Complex.complex_no == "6139").update(
        {Complex.nearby_median_price: 18000, Complex.jeonse_rate: 53.6, Complex.recent_trades_6m: 3})
    _add_legacy_gov_rows(db)
    db.add(ComplexPriceHistory(complex_no="6139", trade_type="A1", area_no="2",
                               base_month=f"{M06}05", price_avg=17000))
    db.commit()

    collect_complex_metrics(batch_size=0)

    assert _metric_values(db) == (None, 18000, 53.6, 3)
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "complex_metric").order_by(CrawlJob.id.desc()).first()
    assert job.status == "failed"
    assert "면적별 정부 실거래" in job.error_message


# ── I5 직렬화 ────────────────────────────────────────────────────────────────


def _art(trade_type, price, area2):
    return SimpleNamespace(trade_type_name=trade_type, numeric_price=price, area2_m2=area2)


def test_매물_전세가율_분모는_같은_면적_묶음():
    from routers.estate_serializers import _calc_jeonse_ratio

    stats = {59: 17200, 84: 22000}
    assert _calc_jeonse_ratio(_art("전세", 15000, 84.0), None, stats) == 68.2   # 84 매물 → 84 분모
    assert _calc_jeonse_ratio(_art("전세", 15000, 59.0), None, stats) == 87.2   # 59 매물 → 59 분모
    assert _calc_jeonse_ratio(_art("전세", 9000, 42.0), None, stats) is None    # 42 묶음 값 없음
    assert _calc_jeonse_ratio(_art("전세", 15000, None), None, stats) is None
    assert _calc_jeonse_ratio(_art("전세", 15000, 84.0), SimpleNamespace(nearby_median_price=17200), None) is None
    assert _calc_jeonse_ratio(_art("매매", 15000, 84.0), None, stats) is None


@pytest.fixture
def _no_filter_options(monkeypatch):
    """단지 상세의 필터 옵션 조회는 PostgreSQL unnest 를 써 SQLite 에서 못 돈다 — 이 시험과 무관하니 비운다."""
    import db.queries as q
    from routers.complexes import _cache

    monkeypatch.setattr(q, "get_filter_options", lambda db, complex_no: {})
    _cache.delete_by_prefix("complex_detail:6139")  # 단지 상세 캐시는 모듈 전역 — 앞 시험 응답이 남지 않게
    yield
    _cache.delete_by_prefix("complex_detail:6139")


def test_단지상세_응답에_대표면적과_면적별_시세(client, db, _no_filter_options):
    _add_6139(db, rep=59)
    _add_gov_area_rows(db)

    body = client.get("/api/complexes/6139").json()

    assert body["rep_area_m2"] == 59
    # 평형표 모든 묶음 · 대표 먼저 · 나머지 거래 수 순 · 거래 없는 42 는 null (보완 ①)
    assert body["area_prices"] == [
        {"area_m2": 59, "households": 116, "price_median": 17200, "trade_count": 3},
        {"area_m2": 84, "households": 70, "price_median": 22000, "trade_count": 1},
        {"area_m2": 42, "households": 12, "price_median": None, "trade_count": None},
    ]
    assert body["area_price_source"] == (
        "정부 실거래 최근 6개월, 전용 59㎡ 대는 소수점을 버린 같은 크기끼리"
        " · 전세가율 = 네이버 전세 시세(같은 면적) ÷ 정부 실거래 중위"
    )


def test_단지상세_값이_없으면_빈_목록(client, db, _no_filter_options):
    _add_6139(db, rep=None, with_pyeong=False)
    body = client.get("/api/complexes/6139").json()
    assert body["rep_area_m2"] is None
    assert body["area_prices"] == []
    assert body["area_price_source"] is None


def test_평형표_없으면_새_표_묶음만(db):
    from db.area_price_queries import complex_area_fields

    _add_6139(db, rep=59, with_pyeong=False)
    _add_gov_area_rows(db)
    out = complex_area_fields(db, db.get(Complex, "6139"))
    assert [(r["area_m2"], r["households"], r["trade_count"]) for r in out["area_prices"]] == [(59, None, 3), (84, None, 1)]


def test_목록_검색_응답엔_면적별_시세를_싣지_않는다(client, db):
    _add_6139(db, rep=59)
    _add_gov_area_rows(db)
    body = client.get("/api/complexes/search?q=자연").json()
    row = body["complexes"][0]
    assert row["rep_area_m2"] == 59  # 칸 하나 — 조회가 안 늘어난다
    assert "area_prices" not in row


def test_매물상세_전세가율은_면적별_중위로(db):
    from db.models import Article
    from routers.live.crawl import _article_detail_dict

    _add_6139(db, rep=59)
    _add_gov_area_rows(db)
    art = Article(article_no="A1", complex_no="6139", trade_type_name="전세", numeric_price=15000, area2_m2=84.0)
    out = _article_detail_dict(db, art, db.get(Complex, "6139"))
    assert out["article_jeonse_ratio"] == 68.2


# ── I6 그래프 ────────────────────────────────────────────────────────────────


def test_그래프_기본선은_대표_묶음만(db):
    from db.price_queries import get_complex_price_history, get_price_history_area, price_history_basis

    _add_6139(db, rep=59)
    _add_gov_area_rows(db)
    _add_legacy_gov_rows(db)
    # 대표 묶음 평형(2)의 네이버 줄 — 매매(A1)는 기본선에 안 섞이고, 전세(B1)는 네이버 시세 계열로 나온다
    db.add(ComplexPriceHistory(complex_no="6139", trade_type="A1", area_no="2",
                               base_month=f"{M06}05", price_avg=30000, price_lower=30000, price_upper=30000))
    db.add(ComplexPriceHistory(complex_no="6139", trade_type="B1", area_no="2",
                               base_month=f"{M06}05", price_avg=12000, price_lower=12000, price_upper=12000))
    db.commit()

    rows = get_complex_price_history(db, "6139")
    a1 = [(r["month"], r["price_avg"], r["price_lower"], r["price_upper"], r["series"])
          for r in rows if r["trade_type"] == "A1"]
    assert a1 == [  # M04 의 84㎡ 22,000 · 네이버 매매 30,000 · 옛 '' 줄은 없다(같은 달 줄이 덮이지 않게 목록으로)
        (M05, 18000, 18000, 18000, "정부 실거래"),
        (M06, 16450, 15700, 17200, "정부 실거래"),
    ]
    assert [(r["month"], r["price_avg"], r["series"]) for r in rows if r["trade_type"] == "B1"] == [
        (M06, 12000, "네이버 시세"),
    ]
    assert get_price_history_area(db, "6139") == 59
    assert price_history_basis(59) == "전용 59㎡ 대 정부 실거래 중위 · 전세는 네이버 시세"
    assert price_history_basis(84, "5") == "전용 84㎡ 대 정부 실거래 중위 · 네이버 시세는 이 평형 값을 따로"


def test_그래프_평형을_고르면_그_평형_묶음과_그_평형_줄(db):
    from db.price_queries import get_complex_price_history, get_price_history_area

    _add_6139(db, rep=59)
    _add_gov_area_rows(db)
    db.add(ComplexPriceHistory(complex_no="6139", trade_type="A1", area_no="5",
                               base_month=f"{M04}05", price_avg=24000, price_lower=23000, price_upper=25000))
    db.add(ComplexPriceHistory(complex_no="6139", trade_type="B1", area_no="5",
                               base_month=f"{M04}05", price_avg=15000, price_lower=15000, price_upper=15000))
    db.commit()

    rows = get_complex_price_history(db, "6139", area_no="5")
    got = sorted((r["trade_type"], r["month"], r["price_avg"], r["series"]) for r in rows)
    assert got == [  # 같은 달 정부·네이버를 합치지 않고 계열을 나눈다(보완 ①)
        ("A1", M04, 22000, "정부 실거래"),
        ("A1", M04, 24000, "네이버 시세"),
        ("B1", M04, 15000, "네이버 시세"),
    ]
    assert get_price_history_area(db, "6139", "5") == 84


def test_그래프_대표면적을_모르면_옛_동작(db):
    from db.price_queries import get_complex_price_history, get_price_history_area

    _add_6139(db, rep=None)
    _add_legacy_gov_rows(db)
    rows = get_complex_price_history(db, "6139")
    assert {r["month"]: r["price_avg"] for r in rows} == {M04: 22000, M05: 18000, M06: 16450}
    assert get_price_history_area(db, "6139") is None


def test_가격추이_API_응답에_면적과_기준(client, db, approved_headers):
    _add_6139(db, rep=59)
    _add_gov_area_rows(db)
    body = client.get("/api/complexes/6139/price-history", headers=approved_headers).json()
    assert body["area_m2"] == 59
    assert body["basis"] == "전용 59㎡ 대 정부 실거래 중위 · 전세는 네이버 시세"
    assert [(i["base_month"], i["price_avg"], i["series"]) for i in body["items"]] == [
        (M05, 18000, "정부 실거래"), (M06, 16450, "정부 실거래"),
    ]


# ── I1 마이그 ────────────────────────────────────────────────────────────────

_V073 = Path(__file__).resolve().parent.parent / "db" / "migrations" / "V073__complex_area_trade_stats.sql"


def _executable(sql: str) -> str:
    return "\n".join(ln for ln in sql.splitlines() if not ln.lstrip().startswith("--"))


def test_V073_표_권한_자체점검():
    assert _V073.exists()
    sql = _V073.read_text(encoding="utf-8")
    ex = _executable(sql)
    assert "CREATE TABLE IF NOT EXISTS public.complex_area_trade_stats" in ex
    assert "PRIMARY KEY (complex_no, base_month, area_m2)" in ex
    assert re.search(r"prices\s+jsonb", ex)
    assert "ADD COLUMN IF NOT EXISTS rep_area_m2 integer" in ex
    assert "ENABLE ROW LEVEL SECURITY" in ex
    assert "REVOKE ALL ON public.complex_area_trade_stats FROM PUBLIC, anon, authenticated;" in ex
    assert "GRANT SELECT ON public.complex_area_trade_stats TO service_role;" in ex
    for words in ("RLS off", "policy exists", "service_role lacks SELECT", "complexes.rep_area_m2 missing"):
        assert f"complex_area_trade_stats self-check: {words}" in ex
    assert "DROP " not in ex  # 롤백문은 주석에만
    assert "DROP TABLE IF EXISTS public.complex_area_trade_stats" in sql


def test_모델이_마이그와_같은_칸():
    cols = ComplexAreaTradeStat.__table__.c
    assert [c.name for c in ComplexAreaTradeStat.__table__.primary_key] == ["complex_no", "base_month", "area_m2"]
    assert {"trade_count", "price_median", "price_min", "price_max", "prices", "recorded_at"} <= set(cols.keys())
    assert "rep_area_m2" in Complex.__table__.c
