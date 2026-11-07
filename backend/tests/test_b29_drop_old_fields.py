"""세션 497 B29 — 옛 응답 칸 3개(price_median·jeonse_rate·article_jeonse_ratio) 삭제 회귀 시험.

설계 s479 §2-3: 범위 칸(b2 #790, 2026-10-31)을 합친 지 1주 뒤 옛 한 값 칸을 응답에서 지운다(사장님 결정 2026-11-02 s494).
남는 것 = 범위 칸(price_min/max · jeonse_rate_min/max · article_jeonse_ratio_min/max). DB 열(complexes.jeonse_rate ·
complex_area_trade_stats.price_median)은 그대로 — 여기서는 응답만 본다.
픽스처는 test_area_price_range_b29.py 것을 그대로 쓴다(6139 자연 59㎡ — 최근 6개월 15,700 · 17,200 · 18,000).
"""

import pytest

from db.models import Article, Complex
from tests.test_area_price_range_b29 import (  # noqa: F401 — _detail_route 는 usefixtures 로 쓰인다
    M06,
    _add_6139,
    _add_naver,
    _add_trade_rows,
    _detail_route,
)


def _seed(db):
    _add_6139(db, rep=59)
    _add_trade_rows(db, direct_m05=True)   # 18,000 이 직거래 → 59 범위 15,700~17,200
    _add_naver(db, "B1", "2", f"{M06}12", 12000)
    db.commit()


@pytest.mark.usefixtures("_detail_route")
def test_단지상세_로그인_옛칸_없고_범위칸_있음(client, db, approved_headers):
    _seed(db)
    body = client.get("/api/complexes/6139", headers=approved_headers).json()
    assert "jeonse_rate" not in body
    assert (body["jeonse_rate_min"], body["jeonse_rate_max"]) == (69.8, 76.4)   # 12000 / 17200 · 12000 / 15700
    rep = body["area_prices"][0]
    assert rep["area_m2"] == 59
    assert "price_median" not in rep
    assert (rep["price_min"], rep["price_max"]) == (15700, 17200)
    assert all("price_median" not in row for row in body["area_prices"])


def test_매물상세_옛칸_없고_범위칸_있음(db):
    from routers.live.crawl import _article_detail_dict

    _add_6139(db, rep=59)
    _add_trade_rows(db)   # 59 = 15,700 · 17,200 · 18,000 전부 중개거래
    art = Article(article_no="A1", complex_no="6139", trade_type_name="전세", numeric_price=12000, area2_m2=59.98)
    out = _article_detail_dict(db, art, db.get(Complex, "6139"))
    assert "article_jeonse_ratio" not in out
    assert (out["article_jeonse_ratio_min"], out["article_jeonse_ratio_max"]) == (66.7, 76.4)


@pytest.mark.usefixtures("_detail_route")
def test_단지상세_비로그인_범위_전세가율도_걷어냄(client, db):
    _seed(db)
    body = client.get("/api/complexes/6139").json()
    assert "jeonse_rate" not in body
    assert "jeonse_rate_min" not in body and "jeonse_rate_max" not in body   # 네이버 재료 — 걷어내기 유지
    assert (body["area_prices"][0]["price_min"], body["area_prices"][0]["price_max"]) == (15700, 17200)


def test_단지검색_로그인_응답에도_옛칸_없음(client, db, approved_headers):
    _add_6139(db, rep=59)
    rows = client.get("/api/complexes/search?q=자연", headers=approved_headers).json()["complexes"]
    assert rows and rows[0]["complex_no"] == "6139"
    assert "jeonse_rate" not in rows[0]
    assert "last_crawled_at" in rows[0]   # 로그인 응답은 네이버 칸을 그대로 싣는다(걷어내지 않음)
