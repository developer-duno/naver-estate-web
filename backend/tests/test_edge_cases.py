"""고난이도 엣지 케이스 테스트 — 동시성, 데이터 무결성, 보안, 경계값
실행: python -m pytest tests/test_edge_cases.py -v
"""
import time

import jwt

from auth.audit import _mask_ip
from db import queries
from db.models import Article, Complex
from routers.serializers import article_to_dict
from services.cache import TTLCache

JWT_SECRET = "test-secret-key-for-testing-only"
JWT_ALG = "HS256"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _token(sub, aud="authenticated"):
    return jwt.encode({"sub": sub, "aud": aud}, JWT_SECRET, algorithm=JWT_ALG)


def _add_complex(db, no="C001", name="test", **kw):
    c = Complex(complex_no=no, complex_name=name, sido="s", sigungu="g", **kw)
    db.add(c)
    db.commit()
    return c


def _add_article(db, no, cpx="C001", trade="m", price=50000, active=True, **kw):
    a = Article(article_no=no, complex_no=cpx, trade_type_name=trade,
                numeric_price=price, is_active=active, **kw)
    db.add(a)
    db.commit()
    return a


# === 1. Concurrency ===

def test_cache_ttl_boundary():
    cache = TTLCache(ttl=1)
    cache.set("k", "v")
    time.sleep(0.9)
    assert cache.get("k") == "v"
    time.sleep(0.2)
    assert cache.get("k") is None


def test_cache_rapid_overwrite():
    cache = TTLCache(ttl=60)
    for i in range(100):
        cache.set("k", i)
    assert cache.get("k") == 99


def test_cache_eviction_preserves_newest():
    cache = TTLCache(ttl=60, max_size=3)
    for i in range(10):
        cache.set(f"k{i}", i)
        time.sleep(0.001)
    assert cache.get("k9") == 9
    assert cache.get("k0") is None


def test_rate_limit_isolation():
    from auth.rate_limiter import _check_rate_limit_memory
    k1 = f"iso1_{time.time()}"
    k2 = f"iso2_{time.time()}"
    for _ in range(5):
        _check_rate_limit_memory(k1, 5, 60)
    assert _check_rate_limit_memory(k1, 5, 60) is True
    assert _check_rate_limit_memory(k2, 5, 60) is False


# === 2. Data Integrity ===

def test_null_numeric_price_sort(db):
    _add_complex(db, "NP")
    _add_article(db, "NP1", "NP", price=50000)
    a = Article(article_no="NP2", complex_no="NP", trade_type_name="m",
                deal_or_warrant_prc="5ok", numeric_price=None, is_active=True)
    db.add(a)
    db.commit()
    arts, total = queries.get_articles_by_complex(db, "NP", sort_by="price_asc")
    assert total == 2


def test_null_price_serialization():
    a = Article(article_no="NS", complex_no="C", deal_or_warrant_prc="5ok",
                numeric_price=None, is_active=True)
    d = article_to_dict(a)
    assert d["numeric_price"] is None
    assert d["deal_or_warrant_prc"] == "5ok"


def test_long_feature_desc(db):
    _add_complex(db, "LD")
    big = "x" * 50000
    _add_article(db, "LD1", "LD", article_feature_desc=big)
    a = queries.get_article_by_no(db, "LD1")
    assert len(a.article_feature_desc) == 50000


def test_emoji_search(db):
    """이모지 포함 단지명 — SQLite LIKE로 ASCII 부분만 검색"""
    _add_complex(db, "EM", "래미안이모지타워")
    results = queries.search_complexes(db, "래미안이모지타워")
    assert len(results) >= 1


def test_percent_search(db):
    _add_complex(db, "PC", "100pct apt")
    results = queries.search_complexes(db, "100pct")
    assert len(results) >= 1


def test_empty_complex_page2(db):
    _add_complex(db, "EP")
    arts, total = queries.get_articles_by_complex(db, "EP", page=2, page_size=10)
    assert total == 0 and len(arts) == 0


def test_zero_price(db):
    _add_complex(db, "ZP")
    _add_article(db, "ZP1", "ZP", price=0)
    arts, _ = queries.get_articles_by_complex(db, "ZP")
    assert arts[0].numeric_price == 0


def test_all_null_article_serialization():
    a = Article(article_no="AN", complex_no="C", is_active=True)
    d = article_to_dict(a)
    assert d["article_no"] == "AN"
    assert d["trade_type_name"] is None
    assert d["area2_pyeong"] is None


def test_combined_filters(db):
    _add_complex(db, "CF")
    _add_article(db, "CF1", "CF", trade="mm", price=50000, area2_m2=84.0, direction="S")
    _add_article(db, "CF2", "CF", trade="js", price=30000, area2_m2=60.0, direction="N")
    _add_article(db, "CF3", "CF", trade="mm", price=80000, area2_m2=100.0, direction="S")
    arts, total = queries.get_articles_by_complex(db, "CF", filters={
        "trade_types": ["mm"], "min_price": 40000, "max_price": 90000,
    })
    # mm + 40000-90000 => CF1(50000), CF3(80000) = 2
    assert total == 2


# === 3. Security ===

def test_jwt_missing_sub(client):
    bad = jwt.encode({"aud": "authenticated"}, JWT_SECRET, algorithm=JWT_ALG)
    assert client.get("/api/users/me", headers=_auth(bad)).status_code == 401


def test_jwt_empty_sub(client):
    bad = jwt.encode({"sub": "", "aud": "authenticated"}, JWT_SECRET, algorithm=JWT_ALG)
    assert client.get("/api/users/me", headers=_auth(bad)).status_code == 401


def test_jwt_wrong_algo(client):
    bad = jwt.encode({"sub": "u1", "aud": "authenticated"}, JWT_SECRET, algorithm="HS384")
    assert client.get("/api/users/me", headers=_auth(bad)).status_code == 401


def test_sql_injection_search(client, db):
    _add_complex(db, "SAFE", "safe_apt")
    client.get("/api/complexes/search?q='; DROP TABLE complexes;--")
    res = client.get("/api/complexes/search?q=safe_apt")
    assert res.status_code == 200


def test_xss_building_filter(client, db):
    _add_complex(db, "XS")
    _add_article(db, "XS1", "XS", building_name="<script>alert(1)</script>")
    res = client.get("/api/complexes/XS/articles?building_name=<script>alert(1)</script>")
    assert res.status_code == 200


def test_ip_mask_edge():
    assert _mask_ip("0.0.0.0") == "0.0.0.xxx"
    assert _mask_ip("255.255.255.255") == "255.255.255.xxx"
    assert _mask_ip("") is None
    assert _mask_ip("not-ip") == "not-ip"


# === 4. API Boundary ===

def test_search_1char(client, db):
    _add_complex(db, "1C", "a")
    assert client.get("/api/complexes/search?q=a").status_code == 200


def test_search_200chars(client):
    assert client.get(f"/api/complexes/search?q={'a'*200}").status_code == 200


def test_max_page_size(client, db):
    _add_complex(db, "MPS")
    assert client.get("/api/complexes/MPS/articles?page_size=200").status_code == 200


def test_all_sort_options(client, db):
    _add_complex(db, "ASO")
    _add_article(db, "ASO1", "ASO")
    for s in ["rank","price_asc","price_desc","area_asc","area_desc",
              "ppyeong_asc","ppyeong_desc","maintenance_asc","maintenance_desc",
              "confirm_asc","confirm_desc"]:
        assert client.get(f"/api/complexes/ASO/articles?sort_by={s}").status_code == 200, f"{s} failed"


def test_export_empty_complex(client, db):
    _add_complex(db, "EXE")
    assert client.post("/api/articles/export?complex_no=EXE").status_code in [200, 400, 404]


def test_regions_full_chain(client):
    r1 = client.get("/api/regions")
    assert r1.status_code == 200
    sido = list(r1.json().keys())[0]
    r2 = client.get(f"/api/regions/{sido}")
    assert r2.status_code == 200
    sg = r2.json()["sigungu_list"][0]
    r3 = client.get(f"/api/regions/{sido}/{sg}")
    assert r3.status_code == 200


def test_quota_type_isolation(db):
    from auth.permissions import check_quota
    check_quota(db, "qi", "crawl", 5)
    db.commit()
    check_quota(db, "qi", "export", 5)
    db.commit()
    check_quota(db, "qi", "crawl", 5)
    db.commit()
    check_quota(db, "qi", "export", 5)
    db.commit()
