"""세션 479 B29 PR b1 — 시세 범위(최저~최고, 중개거래 기준)·거래 목록·전세가율 범위를 API 에 더한다.

옛 칸(price_median·jeonse_rate·article_jeonse_ratio)은 그대로 두고 새 칸만 더한다(설계 §5-2).
실측 6139 자연 59㎡: 최근 6개월 거래 3건(15,700 · 17,200 · 18,000, 전부 중개거래) — 달 자리는 b27 시험과 같은 M04~M06.
"""

import io
from types import SimpleNamespace

import pandas as pd
import pytest

from db.models import Article, Complex, ComplexPriceHistory
from tests.test_area_price_b27 import M04, M05, M06, _add_6139


def _d(month: str, day: int) -> str:
    return f"{month[:4]}-{month[4:]}-{day:02d}"


def _t(p, month=None, day=None, f=None, g="중개거래"):
    """저장 꼴 거래 하나 {"p","d","f","g"}."""
    return {"p": p, "d": _d(month, day) if month else None, "f": f, "g": g}


def _add_trade_rows(db, *, direct_m05=False):
    """6139 면적별 표 + 거래 목록 — 수집기가 쓰는 함수 그대로."""
    from crawler.service_common import _upsert_area_stats

    _upsert_area_stats(db, "6139", M06, 59, [17200, 15700], trades=[_t(17200, M06, 5, 8), _t(15700, M06, 26, 4)])
    _upsert_area_stats(db, "6139", M05, 59, [18000],
                       trades=[_t(18000, M05, 5, 7, "직거래" if direct_m05 else "중개거래")])
    _upsert_area_stats(db, "6139", M04, 84, [22000], trades=[_t(22000)])
    _upsert_area_stats(db, "6139", "202001", 59, [9000], trades=[_t(9000, "202001", 3, 2)])  # 6·24개월 밖
    db.commit()


EXPECTED_59 = [
    {"price": 15700, "date": _d(M06, 26), "floor": 4, "direct": False},
    {"price": 17200, "date": _d(M06, 5), "floor": 8, "direct": False},
    {"price": 18000, "date": _d(M05, 5), "floor": 7, "direct": False},
]


def _add_naver(db, trade_type, area_no, week, avg):
    db.add(ComplexPriceHistory(complex_no="6139", trade_type=trade_type, area_no=area_no, base_month=week,
                               price_avg=avg, price_lower=avg, price_upper=avg))


@pytest.fixture
def _detail_route(monkeypatch):
    """단지 상세의 필터 옵션 조회는 PostgreSQL unnest 라 SQLite 에서 못 돈다 — 비우고, 모듈 전역 캐시를 지운다."""
    import db.queries as q
    from routers.complexes import _cache, _price_history_cache

    monkeypatch.setattr(q, "get_filter_options", lambda db, complex_no: {})
    for cache, prefix in ((_cache, "complex_detail:6139"), (_price_history_cache, "price_history:6139")):
        cache.delete_by_prefix(prefix)
    yield
    for cache, prefix in ((_cache, "complex_detail:6139"), (_price_history_cache, "price_history:6139")):
        cache.delete_by_prefix(prefix)


# ── ⓐ B1 거래 목록 변환·방어·정렬 ─────────────────────────────────────────────


def test_api_trades_변환_방어_정렬():
    from db.area_price_queries import api_trades

    got = api_trades([
        {"p": 15700, "d": "2026-06-26", "f": 4, "g": "중개거래"},
        {"p": "15700", "d": "2026-06-27", "f": 4, "g": "중개거래"},   # 문자열 가격 → 버림
        {"p": True, "d": "2026-06-27"},                                # bool 가격 → 버림
        {"p": 0, "d": "2026-06-27"},                                   # 0 → 버림
        "깨진 원소",                                                   # dict 아님 → 버림
        {"p": 16000, "d": "2026-13-26", "f": True, "g": 5},            # 없는 달 · bool 층 · 문자열 아닌 g
        {"p": 17000, "d": "2026-06-00", "f": "abc", "g": "직거래"},     # 없는 날 · 못 읽는 층
        {"p": 18000, "d": "2026-06-05", "f": "3", "g": " 직거래 "},
        {"p": 19000, "d": "26-06-05", "f": None},                      # 꼴이 다른 날짜
    ])
    assert got == [
        {"price": 15700, "date": "2026-06-26", "floor": 4, "direct": False},
        {"price": 18000, "date": "2026-06-05", "floor": 3, "direct": True},
        # 날짜 없는 거래는 뒤 — 가격 내림차순
        {"price": 19000, "date": None, "floor": None, "direct": False},
        {"price": 17000, "date": None, "floor": None, "direct": True},
        {"price": 16000, "date": None, "floor": None, "direct": False},
    ]
    assert api_trades(None) == []


def test_recent_area_trades_최근6개월_묶음별_내림차순(db):
    from db.area_price_queries import recent_area_prices, recent_area_trades

    _add_6139(db, rep=59)
    _add_trade_rows(db)
    assert recent_area_trades(db, "6139") == {
        59: EXPECTED_59,
        84: [{"price": 22000, "date": None, "floor": None, "direct": False}],
    }
    prices = recent_area_prices(db, "6139")   # 옛 함수 뜻 그대로 — 6개월 안 전 거래 가격
    assert {area: sorted(p) for area, p in prices.items()} == {59: [15700, 17200, 18000], 84: [22000]}


# ── ⓑ B2 범위 = 중개거래 최저~최고 · 목록이 비면 prices 폴백 ───────────────────


def _api(price, direct=False):
    return {"price": price, "date": None, "floor": None, "direct": direct}


def test_area_ranges_직거래_제외_직거래만_None_빈목록_폴백():
    from db.area_price_queries import area_ranges

    prices = {59: [12000, 15700, 18000], 84: [22000, 24900], 42: [9000]}
    trades = {59: [_api(12000, True), _api(15700), _api(18000)], 42: [_api(9000, True)]}
    assert area_ranges(prices, trades) == {
        59: (15700, 18000),     # 직거래 12,000 은 범위에서 뺀다
        84: (22000, 24900),     # 목록이 빈 묶음 = prices 전 거래로 폴백
        42: None,               # 직거래만 = 범위 없음
    }
    assert area_ranges(prices) == {59: (12000, 18000), 84: (22000, 24900), 42: (9000, 9000)}


# ── ⓓ B4 단지 전세가율 범위 ──────────────────────────────────────────────────


@pytest.mark.parametrize("jeonse, expected", [
    (12000, (66.7, 76.4)),
    (16000, (None, None)),   # 전세 ≥ 최저 15,700 → 비움
    (15700, (None, None)),   # 같아도 비움(범위 전체가 100% 미만일 때만)
    (9650, (53.6, 61.5)),
])
def test_단지_전세가율_범위_세_예시(db, jeonse, expected):
    from db.area_price_queries import complex_area_fields

    _add_6139(db, rep=59)
    _add_trade_rows(db)
    _add_naver(db, "B1", "2", f"{M06}05", 30000)    # 옛 주 — 최신 주만 쓴다
    _add_naver(db, "B1", "2", f"{M06}12", jeonse)
    db.commit()
    out = complex_area_fields(db, db.get(Complex, "6139"))
    assert (out["jeonse_rate_min"], out["jeonse_rate_max"]) == expected


def _add_84_rep(db):
    from crawler.service_common import _upsert_area_stats

    _add_6139(db, rep=84)
    _upsert_area_stats(db, "6139", M06, 84, [24900, 22000], trades=[_t(24900, M06, 3, 9), _t(22000, M06, 9, 2)])
    db.commit()


def test_단지_전세가율_평형_여럿이면_세대수_최다_동률이면_작은번호(db):
    """84 묶음 평형 3(15세대)·4(13)·7(15) — 15세대 동률은 작은 번호 3."""
    from db.area_price_queries import complex_area_fields

    _add_84_rep(db)
    week = f"{M06}12"
    _add_naver(db, "B1", "3", week, 15000)
    _add_naver(db, "B1", "4", week, 20000)
    _add_naver(db, "B1", "7", week, 16000)
    db.commit()
    out = complex_area_fields(db, db.get(Complex, "6139"))
    assert (out["jeonse_rate_min"], out["jeonse_rate_max"]) == (60.2, 68.2)  # 15000 / 24900 · 15000 / 22000


def test_단지_전세가율_같은주_A1_동일값이면_버리고_다음_평형(db):
    from db.area_price_queries import complex_area_fields

    _add_84_rep(db)
    week = f"{M06}12"
    _add_naver(db, "B1", "3", week, 15000)
    _add_naver(db, "A1", "3", week, 15000)   # B1=A1 동일값 결함 → 평형 3 버림
    _add_naver(db, "B1", "7", week, 16000)
    db.commit()
    out = complex_area_fields(db, db.get(Complex, "6139"))
    assert (out["jeonse_rate_min"], out["jeonse_rate_max"]) == (64.3, 72.7)  # 16000 / 24900 · 16000 / 22000


def test_단지_전세가율_다_버려지거나_재료가_없으면_비움(db):
    from db.area_price_queries import complex_area_fields

    _add_84_rep(db)
    week = f"{M06}12"
    _add_naver(db, "B1", "3", week, 15000)
    _add_naver(db, "A1", "3", week, 15000)
    _add_naver(db, "B1", "2", week, 9000)    # 59 묶음 평형 — 84 대표에는 안 쓴다
    db.commit()
    out = complex_area_fields(db, db.get(Complex, "6139"))
    assert (out["jeonse_rate_min"], out["jeonse_rate_max"]) == (None, None)


def test_단지_전세가율_대표_범위가_직거래만이면_비움(db):
    from crawler.service_common import _upsert_area_stats
    from db.area_price_queries import complex_area_fields

    _add_6139(db, rep=59)
    _upsert_area_stats(db, "6139", M06, 59, [15700], trades=[_t(15700, M06, 26, 4, "직거래")])
    _add_naver(db, "B1", "2", f"{M06}12", 12000)
    db.commit()
    out = complex_area_fields(db, db.get(Complex, "6139"))
    assert out["area_prices"][0]["price_min"] is None
    assert (out["jeonse_rate_min"], out["jeonse_rate_max"]) == (None, None)


# ── ⓔ B5 옛 값 단지 legacy_range ───────────────────────────────────────────


def _add_legacy(db, area_no, month, lower, upper):
    db.add(ComplexPriceHistory(complex_no="6139", trade_type="A1", area_no=area_no, base_month=month,
                               price_avg=lower or upper, price_lower=lower, price_upper=upper))


def test_legacy_range_최신_섞인줄_빈줄은_건너뜀(db):
    from db.area_price_queries import complex_area_fields

    _add_6139(db, rep=None)
    c = db.get(Complex, "6139")
    c.nearby_median_price = 12000
    _add_legacy(db, None, "202401", 9000, 9500)
    _add_legacy(db, "", "202503", 11500, 12800)
    _add_legacy(db, "", "202504", None, None)        # 둘 다 빈 줄 → 건너뜀
    _add_legacy(db, "", "20250601", 13000, 13000)    # 8자리 주간 줄은 대상 아님
    _add_legacy(db, "2", "202506", 14000, 14000)     # 평형 줄은 대상 아님
    db.commit()
    out = complex_area_fields(db, c)
    assert out["legacy_range"] == {"lower": 11500, "upper": 12800, "month": "202503"}
    assert (out["jeonse_rate_min"], out["jeonse_rate_max"]) == (None, None)


def test_legacy_range_대표면적이_있거나_옛값이_없으면_None(db):
    from db.area_price_queries import complex_area_fields

    _add_6139(db, rep=59)
    c = db.get(Complex, "6139")
    c.nearby_median_price = 12000
    _add_legacy(db, "", "202503", 11500, 12800)
    db.commit()
    assert complex_area_fields(db, c)["legacy_range"] is None   # 대표 면적 있음
    c.rep_area_m2 = None
    c.nearby_median_price = None
    db.commit()
    assert complex_area_fields(db, c)["legacy_range"] is None   # 옛 값도 없음(price_basis None)


# ── ⓕ B6 매물 전세가율 범위 · 엑셀 두 열 ──────────────────────────────────────


def _art(trade_type, price, area2):
    return SimpleNamespace(trade_type_name=trade_type, numeric_price=price, area2_m2=area2)


def test_매물_전세가율_범위():
    from routers.estate_serializers import _calc_jeonse_ratio_range

    ranges = {59: (15700, 18000), 42: None}
    assert _calc_jeonse_ratio_range(_art("전세", 12000, 59.98), ranges) == (66.7, 76.4)
    assert _calc_jeonse_ratio_range(_art("전세", 16000, 59.98), ranges) is None    # 보증금 ≥ 최저
    assert _calc_jeonse_ratio_range(_art("전세", 9000, 42.48), ranges) is None     # 직거래만 묶음
    assert _calc_jeonse_ratio_range(_art("전세", 12000, 84.0), ranges) is None     # 그 묶음 범위 없음
    assert _calc_jeonse_ratio_range(_art("전세", 12000, None), ranges) is None
    assert _calc_jeonse_ratio_range(_art("매매", 12000, 59.98), ranges) is None
    assert _calc_jeonse_ratio_range(_art("전세", 12000, 59.98), None) is None


def test_매물상세_응답에_전세가율_범위_옛값도_그대로(db):
    from routers.live.crawl import _article_detail_dict

    _add_6139(db, rep=59)
    _add_trade_rows(db)
    art = Article(article_no="A1", complex_no="6139", trade_type_name="전세", numeric_price=12000, area2_m2=59.98)
    out = _article_detail_dict(db, art, db.get(Complex, "6139"))
    assert (out["article_jeonse_ratio_min"], out["article_jeonse_ratio_max"]) == (66.7, 76.4)
    assert out["article_jeonse_ratio"] == 69.8   # 옛 중위 분모(17,200) 값 그대로


def test_article_to_dict_분모를_안_넘기면_두칸_None():
    from routers.estate_serializers import article_to_dict

    out = article_to_dict(Article(article_no="X", complex_no="6139", trade_type_name="전세",
                                  numeric_price=12000, area2_m2=59.98))
    assert (out["article_jeonse_ratio_min"], out["article_jeonse_ratio_max"]) == (None, None)


def test_엑셀에_전세가율_최저_최고_두열(client, db, approved_headers):
    _add_6139(db, rep=59)
    _add_trade_rows(db)
    db.add(Article(article_no="J1", complex_no="6139", trade_type_name="전세", is_active=True,
                   numeric_price=12000, area2_m2=59.98, complex_name="자연"))
    db.add(Article(article_no="S1", complex_no="6139", trade_type_name="매매", is_active=True,
                   numeric_price=17000, area2_m2=59.98, complex_name="자연"))
    db.commit()
    res = client.post("/api/articles/export?complex_no=6139", headers=approved_headers)
    assert res.status_code == 200
    df = pd.read_excel(io.BytesIO(res.content)).set_index("매물번호")
    cols = ["전세가율(%, 같은 면적)", "전세가율 최저(%, 같은 면적)", "전세가율 최고(%, 같은 면적)"]
    assert list(df.columns[-3:]) == cols
    assert [float(df.loc["J1", c]) for c in cols] == [69.8, 66.7, 76.4]
    assert all(pd.isna(df.loc["S1", c]) for c in cols)   # 매매 매물 = 빈칸


# ── ⓖ B7 그래프 거래 점(trades) — 최근 2년 달만 ───────────────────────────────


def test_그래프_정부줄에_거래목록_2년밖과_네이버줄은_없음(db):
    from db.price_queries import get_complex_price_history

    _add_6139(db, rep=59)
    _add_trade_rows(db)
    _add_naver(db, "B1", "2", f"{M06}12", 12000)
    _add_naver(db, "A1", "2", "20200105", 9100)
    db.commit()

    base = {(r["month"], r["series"]): r for r in get_complex_price_history(db, "6139")}
    assert base[(M06, "정부 실거래")]["trades"] == EXPECTED_59[:2]
    assert base[(M05, "정부 실거래")]["trades"] == EXPECTED_59[2:]
    assert base[(M06, "네이버 시세")].get("trades") is None

    picked = {(r["month"], r["series"]): r for r in get_complex_price_history(db, "6139", area_no="2")}
    # 평형 선택은 줄(띠)은 기간 그대로 — 202001 줄은 나오지만 점은 2년 밖이라 비운다
    assert picked[("202001", "정부 실거래")]["price_avg"] == 9000
    assert picked[("202001", "정부 실거래")]["trades"] == []
    assert picked[(M06, "정부 실거래")]["trades"] == EXPECTED_59[:2]
    assert picked[("202001", "네이버 시세")].get("trades") is None


def test_가격추이_API_items_에_trades(client, db, approved_headers, _detail_route):
    _add_6139(db, rep=59)
    _add_trade_rows(db)
    _add_naver(db, "B1", "2", f"{M06}12", 12000)
    db.commit()
    body = client.get("/api/complexes/6139/price-history", headers=approved_headers).json()
    got = [(i["base_month"], i["series"], len(i["trades"])) for i in body["items"]]
    assert got == [(M05, "정부 실거래", 1), (M06, "정부 실거래", 2), (M06, "네이버 시세", 0)]
    assert body["items"][1]["trades"] == EXPECTED_59[:2]


# ── ⓗ 단지 상세 응답 ─────────────────────────────────────────────────────────


def test_단지상세_응답에_범위_거래목록_전세가율범위_옛값단지(client, db, _detail_route):
    _add_6139(db, rep=59)
    _add_trade_rows(db, direct_m05=True)   # 18,000 이 직거래 → 범위는 15,700~17,200
    _add_naver(db, "B1", "2", f"{M06}12", 12000)
    db.commit()

    body = client.get("/api/complexes/6139").json()
    rep = body["area_prices"][0]
    assert (rep["area_m2"], rep["price_median"], rep["trade_count"]) == (59, 17200, 3)   # 옛 칸 그대로
    assert (rep["price_min"], rep["price_max"]) == (15700, 17200)
    assert rep["trades"] == EXPECTED_59[:2] + [{**EXPECTED_59[2], "direct": True}]       # 직거래도 목록엔 보임
    assert body["area_prices"][2] == {
        "area_m2": 42, "households": 12, "price_median": None, "trade_count": None,
        "price_min": None, "price_max": None, "trades": [],
    }
    assert (body["jeonse_rate_min"], body["jeonse_rate_max"]) == (69.8, 76.4)   # 12000 / 17200 · 12000 / 15700
    assert body["legacy_range"] is None
    assert "jeonse_rate" in body   # 옛 칸 유지


# ── ⓘ B8 문구 — 두 정본 함수에 "중위" 0건 ─────────────────────────────────────


def test_정본_문구에_중위가_없다():
    from db.area_price_queries import area_price_source
    from db.price_queries import price_history_basis

    texts = [area_price_source(59), price_history_basis(59), price_history_basis(84, "5")]
    assert all("중위" not in t and "최저~최고" in t for t in texts)
    assert area_price_source(59) == (
        "정부 실거래 최근 6개월 최저~최고(중개거래 기준), 전용 59㎡ 대는 소수점을 버린 같은 크기끼리"
        " · 전세가율 = 네이버 전세 시세(같은 면적, 최신 주) ÷ 정부 실거래 최저~최고"
    )
