"""세션 481 공개 전환 PR 1 — 비로그인 응답에서 네이버 재료 칸 걷어내기 · 로그인 게이트 · 승인 게이트.

사장님 결정(2026-10-26): 정보·자료는 비로그인에게도 공개, 네이버 매물·호가·그래프·매물 상세는 로그인 뒤,
네이버를 부르는 행동(새로 받기·수집·엑셀)과 프런트 호출처 없는 /api/articles/{no}/detail 은 승인 중개사.
실행: python -m pytest tests/test_public_complex_s481.py -q
"""
import pytest

from db.models import Article, Complex
from routers.public_fields import NAVER_FIELDS, strip_naver_fields, strip_naver_list
from tests.conftest import make_auth_headers

NO = "S481"

# 비로그인 단지 상세 응답의 키 — 정본 스냅샷(칸을 더하거나 빼면 이 목록을 같이 고친다)
ANON_DETAIL_KEYS = {
    # 단지 사실(결정 1 — 공개)
    "complex_no", "complex_name", "cortar_no", "real_estate_type_code", "real_estate_type_name",
    "latitude", "longitude", "total_household_count", "high_floor", "low_floor", "use_approve_ymd",
    "total_dong_count", "min_supply_area_m2", "max_supply_area_m2", "cortar_address", "sido", "sigungu",
    "dong", "heat_method_type", "total_parking_count", "construction_company", "floor_area_ratio",
    "building_coverage_ratio", "address", "road_address", "heat_fuel_type", "parking_count_by_household",
    "management_office_tel", "has_pool",
    # 정부 실거래 파생
    "nearby_median_price", "recent_trades_6m", "rep_area_m2", "price_basis",
    "area_prices", "area_price_source", "area_price_range_source", "legacy_range",
    # 부동산원 지역 값
    "region_jeonse_ratio", "region_jeonse_period", "region_name", "region_jeonse_source",
}


def _add_complex(db, no=NO, name="공개단지", rep=59):
    db.add(Complex(complex_no=no, complex_name=name, sido="서울", sigungu="강남", rep_area_m2=rep))
    db.commit()


def _add_article(db, no="SA1", complex_no=NO):
    db.add(Article(article_no=no, complex_no=complex_no, trade_type_name="매매", is_active=True,
                   numeric_price=50000))
    db.commit()


@pytest.fixture
def _detail(monkeypatch):
    """필터 옵션 조회는 PostgreSQL unnest 라 SQLite 에서 못 돈다 — 비우고, 모듈 전역 캐시를 지운다."""
    import db.queries as q
    from routers.complexes import _cache

    monkeypatch.setattr(q, "get_filter_options", lambda db, complex_no: {"dongs": ["101동"]})
    _cache.delete_by_prefix(f"complex_detail:{NO}")
    yield
    _cache.delete_by_prefix(f"complex_detail:{NO}")


# ── 순수 함수 ──────────────────────────────────────────────────────────────


def test_걷어내기는_원본을_바꾸지_않고_9칸만_뺀다():
    src = {k: 1 for k in NAVER_FIELDS} | {"complex_no": "1", "rep_area_m2": None, "area_prices": []}
    before = dict(src)
    out = strip_naver_fields(src)
    assert src == before                       # 캐시 안 객체는 그대로
    assert set(out) == {"complex_no", "rep_area_m2", "area_prices"}
    assert len(NAVER_FIELDS) == 9


def test_걷어내기_출처_글자는_전세가율_꼬리_없이():
    out = strip_naver_fields({"rep_area_m2": 59, "area_price_source": "x", "area_price_range_source": "y"})
    assert out["area_price_source"] == "정부 실거래 최근 6개월, 전용 59㎡ 대는 소수점을 버린 같은 크기끼리"
    assert out["area_price_range_source"] == (
        "정부 실거래 최근 6개월 최저~최고(중개거래 기준), 전용 59㎡ 대는 소수점을 버린 같은 크기끼리"
    )
    assert "전세가율" not in out["area_price_source"] + out["area_price_range_source"]


def test_출처_글자_로그인용은_바이트_동일():
    from db.area_price_queries import area_price_range_source, area_price_source

    assert area_price_source(59) == area_price_source(59, include_jeonse=True) == (
        "정부 실거래 최근 6개월, 전용 59㎡ 대는 소수점을 버린 같은 크기끼리"
        " · 전세가율 = 네이버 전세 시세(같은 면적) ÷ 정부 실거래 중위"
    )
    assert area_price_range_source(59) == (
        "정부 실거래 최근 6개월 최저~최고(중개거래 기준), 전용 59㎡ 대는 소수점을 버린 같은 크기끼리"
        " · 전세가율 = 네이버 전세 시세(같은 면적, 최신 주) ÷ 정부 실거래 최저~최고"
    )
    assert area_price_source(None, include_jeonse=False) is None


def test_목록_걷어내기는_각_단지에_적용하고_원본_그대로():
    src = {"complexes": [{"complex_no": "1", "article_count": 3, "jeonse_rate": 70.0}], "total": 1, "source": "naver"}
    out = strip_naver_list(src)
    assert out == {"complexes": [{"complex_no": "1"}], "total": 1, "source": "naver"}
    assert src["complexes"][0]["article_count"] == 3


# ── 단지 상세 ────────────────────────────────────────────────────────────────


def test_단지상세_비로그인_키_스냅샷(client, db, _detail):
    _add_complex(db)
    res = client.get(f"/api/complexes/{NO}")
    assert res.status_code == 200
    body = res.json()
    assert set(body) == ANON_DETAIL_KEYS
    assert not (set(body) & NAVER_FIELDS)
    assert "전세가율" not in (body["area_price_source"] or "")


def test_단지상세_로그인은_전체_칸_그대로_미승인도(client, db, _detail):
    _add_complex(db)
    pending = make_auth_headers(db, user_id="pending-481", status="pending")
    body = client.get(f"/api/complexes/{NO}", headers=pending).json()
    assert set(body) == ANON_DETAIL_KEYS | NAVER_FIELDS
    assert body["filter_options"] == {"dongs": ["101동"]}
    assert body["area_price_source"].endswith("÷ 정부 실거래 중위")


def test_단지상세_비로그인이_먼저_와도_캐시가_로그인_응답을_줄이지_않는다(client, db, approved_headers, _detail):
    _add_complex(db)
    anon = client.get(f"/api/complexes/{NO}").json()
    auth = client.get(f"/api/complexes/{NO}", headers=approved_headers).json()
    anon2 = client.get(f"/api/complexes/{NO}").json()
    assert "article_count" not in anon and "article_count" in auth
    assert anon2 == anon


# ── 매물·호가·그래프 = 로그인 게이트 ─────────────────────────────────────────


@pytest.mark.parametrize("path", ["articles", "price-stats", "price-history", "pyeong-details"])
def test_네이버_재료_엔드포인트_비로그인_401(client, db, path):
    _add_complex(db)
    assert client.get(f"/api/complexes/{NO}/{path}").status_code == 401


@pytest.mark.parametrize("path", ["articles", "price-stats", "price-history"])
def test_네이버_재료_엔드포인트_미승인_로그인_200(client, db, path):
    _add_complex(db)
    _add_article(db)
    pending = make_auth_headers(db, user_id="pending-481", status="pending")
    assert client.get(f"/api/complexes/{NO}/{path}", headers=pending).status_code == 200


@pytest.mark.parametrize("path", ["articles", "price-stats", "price-history"])
def test_네이버_재료_엔드포인트_승인_200(client, db, approved_headers, path):
    _add_complex(db)
    assert client.get(f"/api/complexes/{NO}/{path}", headers=approved_headers).status_code == 200


def test_필터옵션_비로그인_401_로그인_200(client, db, monkeypatch):
    import db.queries as q
    from routers.complexes import _cache

    monkeypatch.setattr(q, "get_filter_options", lambda db, complex_no: {"dongs": []})
    _cache.delete_by_prefix(f"filter_options:{NO}")
    _add_complex(db)
    pending = make_auth_headers(db, user_id="pending-481", status="pending")
    assert client.get(f"/api/complexes/{NO}/filter-options").status_code == 401
    assert client.get(f"/api/complexes/{NO}/filter-options", headers=pending).status_code == 200
    _cache.delete_by_prefix(f"filter_options:{NO}")


@pytest.fixture
def _enrich_calls(monkeypatch):
    """평형표 빈 단지의 즉석 네이버 호출(enrich_complex_detail) 기록 — 실제 네이버 호출 0."""
    import services.enricher as enricher
    from routers import complexes as complexes_router
    from routers.complexes import _cache

    calls: list[str] = []
    monkeypatch.setattr(enricher, "enrich_complex_detail", lambda _db, no, throttle=None: calls.append(no) or False)
    monkeypatch.setattr(complexes_router, "get_shared_throttle", lambda *a, **k: type("T", (), {"wait": lambda self: None})())
    _cache.delete_by_prefix(f"pyeong_details:{NO}")
    yield calls
    _cache.delete_by_prefix(f"pyeong_details:{NO}")


def test_평형상세_미승인은_네이버_호출_0_승인은_1(client, db, approved_headers, _enrich_calls):
    _add_complex(db)
    pending = make_auth_headers(db, user_id="pending-481", status="pending")
    res = client.get(f"/api/complexes/{NO}/pyeong-details", headers=pending)
    assert res.status_code == 200 and res.json() == {"pyeong_details": []}
    assert _enrich_calls == []
    # 미승인의 빈 결과가 캐시되지 않아 승인 중개사 요청은 즉석 호출을 일으킨다
    assert client.get(f"/api/complexes/{NO}/pyeong-details", headers=approved_headers).status_code == 200
    assert _enrich_calls == [NO]


# ── 목록·검색 4곳 ────────────────────────────────────────────────────────────


def test_단지검색_비로그인은_매물수_전세가율_크롤시각_없음(client, db, approved_headers):
    _add_complex(db, name="공개검색단지")
    _add_article(db)
    anon = client.get("/api/complexes/search?q=공개검색단지").json()["complexes"][0]
    auth = client.get("/api/complexes/search?q=공개검색단지", headers=approved_headers).json()["complexes"][0]
    assert not (set(anon) & NAVER_FIELDS) and anon["complex_name"] == "공개검색단지"
    assert auth["article_count"] == 1 and "jeonse_rate" in auth


def test_지역목록_비로그인_걷어냄_캐시는_로그인_그대로(client, db, approved_headers):
    from routers.complexes import _cache

    _add_complex(db)
    _add_article(db)
    _cache.delete_by_prefix("region:서울:강남")
    url = "/api/complexes/region?sido=서울&sigungu=강남"
    anon = client.get(url).json()["complexes"][0]
    auth = client.get(url, headers=approved_headers).json()["complexes"][0]     # 캐시 hit
    anon2 = client.get(url).json()["complexes"][0]                              # 캐시 hit
    _cache.delete_by_prefix("region:서울:강남")
    assert "article_count" not in anon and auth["article_count"] == 1
    assert anon2 == anon


@pytest.mark.parametrize("url,key", [
    ("/api/live/search?q=캐시단지481", "search:캐시단지481:"),
    ("/api/live/region?sido=서울&sigungu=강남481", "region:서울:강남481:None:"),
])
def test_실시간_검색_비로그인_응답만_걷어냄(client, db, approved_headers, url, key):
    """캐시 hit 경로로 본다(네이버 호출 0) — 호출 로직은 그대로, 응답만 걷어낸다."""
    from routers.live._shared import _cache
    from routers.live.search import _parse_allowed_types

    full_key = key + ",".join(sorted(_parse_allowed_types(None)))
    cached = {"complexes": [{"complex_no": "1", "complex_name": "캐시단지", "article_count": 5,
                             "trade_type_counts": {"매매": 5}, "jeonse_rate": 70.0,
                             "last_crawled_at": "2026-10-26T00:00:00"}], "total": 1}
    _cache.set(full_key, cached)
    try:
        anon = client.get(url).json()
        auth = client.get(url, headers=approved_headers).json()
    finally:
        _cache.delete_by_prefix(full_key)
    assert anon["complexes"] == [{"complex_no": "1", "complex_name": "캐시단지"}]
    assert auth == cached
    assert cached["complexes"][0]["article_count"] == 5   # 캐시 안 객체 그대로


# ── 주인 없는 실시간 상세 = 승인 게이트 ───────────────────────────────────────


def test_매물_실시간_상세_비로그인_401_네이버_호출_0(client, monkeypatch):
    from shared.naver_api import NaverEstateAPI

    calls = []
    monkeypatch.setattr(NaverEstateAPI, "get_article_detail", lambda no: calls.append(no) or {"articleNo": no})
    assert client.get("/api/articles/A481/detail").status_code == 401
    assert calls == []


def test_매물_실시간_상세_미승인_403_승인_200(client, db, approved_headers, monkeypatch):
    from shared.naver_api import NaverEstateAPI

    monkeypatch.setattr(NaverEstateAPI, "get_article_detail", lambda no: {"articleNo": no})
    pending = make_auth_headers(db, user_id="pending-481", status="pending")
    assert client.get("/api/articles/A481/detail", headers=pending).status_code == 403
    res = client.get("/api/articles/A481/detail", headers=approved_headers)
    assert res.status_code == 200 and res.json() == {"articleNo": "A481"}


# ── 보완 F1: 매물 원문이 나가던 옛 길 4곳 = 로그인 게이트 ──────────────────────


@pytest.mark.parametrize("url", [
    "/api/articles/price-changes",
    "/api/articles/SA1",
    "/api/articles/SA1/price-history",
    "/api/live/article/SA1/detail",
])
def test_매물_원문_옛길_비로그인_401_로그인_200(client, db, url, monkeypatch):
    from shared.naver_api import NaverEstateAPI

    monkeypatch.setattr(NaverEstateAPI, "get_article_detail", lambda no: {"error": "막힘"})
    _add_complex(db)
    _add_article(db)
    pending = make_auth_headers(db, user_id="pending-481", status="pending")
    assert client.get(url).status_code == 401
    assert client.get(url, headers=pending).status_code == 200


def test_가격변동_limit_상한_200(client, db, approved_headers):
    assert client.get("/api/articles/price-changes?limit=200", headers=approved_headers).status_code == 200
    assert client.get("/api/articles/price-changes?limit=201", headers=approved_headers).status_code == 422


def test_실시간_상세_DB에_없는_번호는_네이버_호출_0(client, approved_headers, monkeypatch):
    from shared.naver_api import NaverEstateAPI

    calls = []
    monkeypatch.setattr(NaverEstateAPI, "get_article_detail", lambda no: calls.append(no) or {"articleNo": no})
    assert client.get("/api/live/article/NOPE481/detail").status_code == 401            # 비로그인
    assert client.get("/api/live/article/NOPE481/detail", headers=approved_headers).status_code == 404
    assert calls == []


# ── 보완 F2: 옛 값 단지는 정부 세 값도 비로그인에서 뺀다 ──────────────────────────


def test_옛값_단지_비로그인은_세_값_빼고_price_basis_None():
    src = {"complex_no": "1", "rep_area_m2": None, "price_basis": "legacy_mixed", "nearby_median_price": 18000,
           "recent_trades_6m": 4, "legacy_range": {"lower": 1, "upper": 2, "month": "202401"}, "area_prices": []}
    out = strip_naver_fields(src)
    assert out == {"complex_no": "1", "rep_area_m2": None, "price_basis": None, "area_prices": []}
    assert src["nearby_median_price"] == 18000   # 원본 그대로


def test_대표면적_단지는_정부_세_값_그대로():
    src = {"rep_area_m2": 59, "price_basis": "rep_area", "nearby_median_price": 17200, "recent_trades_6m": 3,
           "legacy_range": None}
    assert strip_naver_fields(src) == src


def test_옛값_단지_API_비로그인_세_키_없음_로그인_전부(client, db, approved_headers, _detail):
    db.add(Complex(complex_no=NO, complex_name="옛값단지", sido="서울", sigungu="강남",
                   nearby_median_price=18000, recent_trades_6m=4))
    db.commit()
    anon = client.get(f"/api/complexes/{NO}").json()
    auth = client.get(f"/api/complexes/{NO}", headers=approved_headers).json()
    assert not ({"nearby_median_price", "recent_trades_6m", "legacy_range"} & set(anon))
    assert anon["price_basis"] is None
    assert auth["price_basis"] == "legacy_mixed" and auth["nearby_median_price"] == 18000
    assert {"nearby_median_price", "recent_trades_6m", "legacy_range"} <= set(auth)


# ── 보완 F5: /api/users/me 의 is_approved_broker = BE 승인 게이트와 같은 판정 ─────


def test_me_is_approved_broker_승인_미승인_만료_관리자목록(client, db, monkeypatch):
    from datetime import datetime, timedelta, timezone

    import deps
    from db.models import UserProfile

    assert client.get("/api/users/me", headers=make_auth_headers(db, user_id="me-ok-481")).json()["is_approved_broker"] is True
    pending = make_auth_headers(db, user_id="me-pending-481", status="pending")
    assert client.get("/api/users/me", headers=pending).json()["is_approved_broker"] is False
    expired = make_auth_headers(db, user_id="me-expired-481")
    db.query(UserProfile).filter(UserProfile.user_id == "me-expired-481").update(
        {"approved_until": datetime.now(timezone.utc) - timedelta(days=1)})
    db.commit()
    deps._user_cache.delete("profile:me-expired-481")   # 프로필 캐시(5분)에 옛 값이 남지 않게
    assert client.get("/api/users/me", headers=expired).json()["is_approved_broker"] is False
    monkeypatch.setattr(deps, "ADMIN_USER_IDS", {"me-listed-481"})
    listed = make_auth_headers(db, user_id="me-listed-481", status="pending")
    assert client.get("/api/users/me", headers=listed).json()["is_approved_broker"] is True


# ── 보완 F11: 토큰이 있는데 검증 실패면 401(조용히 비로그인 응답 금지) ──────────────


def test_깨진_토큰은_401_토큰_없음은_200(client, db, _detail):
    _add_complex(db)
    bad = {"Authorization": "Bearer not-a-valid-token"}
    assert client.get(f"/api/complexes/{NO}", headers=bad).status_code == 401
    assert client.get("/api/complexes/search?q=공개단지", headers=bad).status_code == 401
    assert client.get(f"/api/complexes/{NO}").status_code == 200
