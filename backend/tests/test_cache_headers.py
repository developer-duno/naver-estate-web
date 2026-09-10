"""security_headers_middleware 의 Cache-Control 분기 회귀 가드 (세션 395)

진행 상태 폴링 엔드포인트(crawl-status·collect-status)는 `/api/live/` 접두어를 공유하는 탓에
실시간 검색 결과용 `private, max-age={동적 TTL}`(야간 10800초)을 함께 뒤집어쓰고 있었다.
그 결과 브라우저가 첫 폴링 응답을 최대 3시간 캐시해 이후 폴링을 전부 캐시로 답했고,
크롤이 끝나도 화면이 "크롤 중"에 멈췄다(라이브 재현: 브라우저 44회 요청 중 서버 도착 1회).

⚠ 뮤테이션 검증 완료 — main.py 의 crawl-status/collect-status 분기를 제거하면
아래 test_crawl_status_no_store·test_collect_status_no_store 가 실패한다(세션 395 실측).
"""

from unittest.mock import patch

import jwt

from db.models import Complex, UserProfile

# test_live_router.py 와 동일한 패치 대상 — /api/live/search 회귀 테스트가 실제 네이버를
# 때리지 않게 반드시 모킹한다 (infra.md §IP 차단 방지: 같은 집 서버 IP 라 CI 실호출 금지).
SEARCH_PATCH = "routers.live.search.NaverEstateAPI.search_by_keyword"

# ── 관리자 인증 헬퍼 (test_admin_recrawl.py 패턴 답습) ──
# 세션 396 사후검증에서 드러난 함정: 이 파일의 기존 테스트들은 **비인증 401 응답**에
# 헤더를 단언하고 있었다. 미들웨어가 상태코드와 무관하게 헤더를 붙였기 때문에 통과했을 뿐,
# "성공 응답의 캐시 정책"은 한 번도 검증된 적이 없었다. 오류 응답을 캐시에서 제외한 뒤로는
# 인증을 통과시켜 200 을 받아야 정책을 검증할 수 있다.
JWT_SECRET = "test-secret-key-for-testing-only"


def _admin_headers(db):
    """admin 권한 프로필 + HS256 토큰 — 관리자 GET 을 200 으로 통과시킨다."""
    uid = "cache-hdr-admin"
    if not db.query(UserProfile).filter(UserProfile.user_id == uid).first():
        db.add(UserProfile(user_id=uid, email=f"{uid}@test.com", role="admin", status="approved"))
        db.commit()
    token = jwt.encode(
        {"sub": uid, "aud": "authenticated", "email": f"{uid}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def _seed_complex(db, complex_no="102102"):
    """단지 1건 — 단지 상세/하위 경로가 404 대신 200 을 주게 한다."""
    if not db.query(Complex).filter(Complex.complex_no == complex_no).first():
        db.add(Complex(complex_no=complex_no, complex_name="캐시헤더테스트단지"))
        db.commit()
    return complex_no



def test_crawl_status_no_store(client):
    """크롤 진행 상태 폴링 → Cache-Control: no-store (브라우저 캐시 금지)"""
    res = client.get("/api/live/102102/articles/crawl-status")
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-store"


def test_collect_status_no_store(client):
    """실거래가 수집 진행 상태 폴링 → Cache-Control: no-store"""
    res = client.get("/api/live/102102/price-history/collect-status")
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-store"


def test_regions_cache_unchanged(client):
    """회귀: /api/regions 는 기존 24시간 public 캐시 유지"""
    res = client.get("/api/regions")
    assert res.headers["Cache-Control"] == "public, max-age=86400"


def test_default_api_cache_unchanged(client):
    """회귀: 그 밖의 /api/ GET 은 기본 30초 캐시 유지"""
    res = client.get("/api/stats")
    assert res.headers["Cache-Control"] == "private, max-age=30"


@patch(SEARCH_PATCH)
def test_live_non_status_cache_unchanged(mock_search, client, db):
    """회귀: 상태 조회가 아닌 /api/live/ GET 은 동적 TTL(private, max-age=) 유지.

    네이버 API 는 모킹 — 실호출이 나가면 집 서버 IP 차단 위험 + CI flaky (세션 395 리뷰 반영).
    ⚠ 세션 396 사후검증 이후 오류 응답(4xx/5xx)에는 Cache-Control 을 붙이지 않으므로,
    이 테스트는 **성공 응답(200)** 을 받아야 정책을 검증할 수 있다(옛 docstring 의
    "상태코드와 무관하게 단언 가능" 은 그 변경으로 더 이상 참이 아니다).
    """
    # ⚠ 빈 결과는 라우터가 502 를 낸다("네이버 검색 실패 + 저장된 데이터도 없습니다").
    #   오류 응답에는 이제 Cache-Control 이 안 붙으므로 최소 1건을 돌려주는 mock 이어야 한다.
    mock_search.return_value = {
        "complexes": [
            {
                "complexNo": "102102",
                "complexName": "캐시헤더테스트단지",
                "cortarAddress": "서울시 테스트구",
                "realEstateTypeCode": "APT",
            }
        ],
        "isMoreData": False,
    }

    res = client.get("/api/live/search?q=테스트캐시헤더")

    # mock 을 실제로 지나갔는지 = 실 네이버 호출이 0 이었다는 증거
    mock_search.assert_called()
    assert res.status_code == 200, res.text[:200]
    cache_control = res.headers["Cache-Control"]
    assert cache_control.startswith("private, max-age="), cache_control
    assert cache_control != "no-store"


def test_admin_recrawl_progress_no_store(client, db):
    """관리자 재크롤 진행률(FE 3초 폴링) → no-store (세션 395 맹점 검증)"""
    res = client.get("/api/admin/recrawl/progress", headers=_admin_headers(db))
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-store"


# ─── 세션 396: 단지·매물 목록 no-cache + 관리자 API 전부 no-store ───────────────
#
# §5-N: 크롤 완료 직후 FE 가 /api/complexes/{no}·{no}/articles 를 재조회해도 브라우저
# HTTP 캐시(3600s/30s)가 답해 배지·건수가 옛값이었다(9/9 01:53 단지 15111 실측).
# 클라 캐시는 React Query staleTime 이 이미 담당하므로 HTTP 캐시는 정합성 구멍만 만든다.
#
# ⚠ 아래 테스트들은 404/401 상태에서 헤더만 단언한다 — Cache-Control 은 미들웨어가 붙이므로
#   본문·상태코드와 무관하다(위 test_admin_recrawl_progress_no_store 패턴 답습).
#   실측(세션 396): /api/complexes/102102 → 404, 나머지 5개 → 401. 헤더는 6개 모두 부착 확인.


def test_complex_detail_no_cache(client):
    """단지 상세 1건 → Cache-Control: no-cache (매번 재검증 — 세션 396 §5-N)

    ⚠ 이 라우터는 PostgreSQL 전용 `unnest(tags)` 를 써서 SQLite 테스트 DB 로는 200 을
    만들 수 없다(dialect 한계). 그래서 라우터 대신 **미들웨어 분기 자체**를 직접 호출해
    경로 매칭을 검증한다 — 성공 응답을 가정한 상태로 정책만 확인하는 것이 목적이다.
    """
    import asyncio

    from fastapi import Request, Response

    from main import security_headers_middleware

    async def _probe(path):
        scope = {
            "type": "http",
            "method": "GET",
            "path": path,
            "headers": [],
            "query_string": b"",
        }

        async def _call_next(_req):
            return Response(content=b"{}", status_code=200, media_type="application/json")

        return await security_headers_middleware(Request(scope), _call_next)

    res = asyncio.run(_probe("/api/complexes/102102"))
    assert res.headers["Cache-Control"] == "no-cache"

    # 하위 경로는 여전히 1시간 (no-cache 범위가 1단만인지 확인)
    res_sub = asyncio.run(_probe("/api/complexes/102102/price-stats"))
    assert res_sub.headers["Cache-Control"] == "private, max-age=3600"


def test_complex_articles_no_cache(client, db):
    """매물 목록 → no-cache (크롤 완료 직후 재조회가 옛값을 받던 §5-N)"""
    no = _seed_complex(db)
    res = client.get(f"/api/complexes/{no}/articles?page=1", headers=_admin_headers(db))
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-cache"


def test_complex_subresource_cache_unchanged(client, db):
    """회귀: 단지 하위 경로(price-stats·subway)는 기존 1시간 캐시 유지 — no-cache 범위는 2종뿐"""
    no = _seed_complex(db)
    headers = _admin_headers(db)
    for sub in ("price-stats", "subway"):
        res = client.get(f"/api/complexes/{no}/{sub}", headers=headers)
        assert res.status_code == 200, sub
        assert res.headers["Cache-Control"] == "private, max-age=3600", sub


def test_admin_recrawl_status_no_store(client, db):
    """관리자 재크롤 안전도(FE 30초 폴링) → no-store (세션 396)"""
    res = client.get("/api/admin/recrawl/status", headers=_admin_headers(db))
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-store"


def test_admin_scheduler_status_no_store(client, db):
    """관리자 스케줄러 상태(FE 60초 폴링) → no-store (세션 396)"""
    res = client.get("/api/admin/scheduler-status", headers=_admin_headers(db))
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-store"


def test_admin_quota_status_no_store(client, db):
    """관리자 쿼터 상태(FE 60초 폴링) → no-store (세션 396)"""
    res = client.get("/api/admin/quota-status", headers=_admin_headers(db))
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-store"


# ── 세션 396 사후검증: 오류 응답(4xx/5xx)은 캐시 대상에서 제외 ──
# 배경: 인증 게이트 엔드포인트(price-stats·pyeong-details·price-history)가 비승인 사용자에게
# 주는 401 이 `private, max-age=3600` 으로 캐시돼, 중개사 승인 직후에도 최대 1시간 잠긴 화면이
# 유지됐다(라이브 실측 2026-09-10: 세 엔드포인트 모두 401 + max-age=3600).
# 뮤테이션 검증: main.py 의 `response.status_code < 400` 조건을 제거하면 아래 3건이 실패한다.


def test_error_response_not_cached_401(client):
    """401(인증 게이트 거부)에는 Cache-Control 을 붙이지 않는다 — 승인 즉시 반영"""
    res = client.get("/api/complexes/102102/price-stats")
    assert res.status_code == 401
    assert "Cache-Control" not in res.headers


def test_error_response_not_cached_404(client):
    """404(미매칭 단지 등)도 캐시하지 않는다 — 수집 후 즉시 반영"""
    res = client.get("/api/complexes/99999999/kapt")
    assert res.status_code >= 400
    assert "Cache-Control" not in res.headers


def test_success_response_still_cached(client):
    """대조군: 성공 응답(200)은 기존 엔드포인트별 정책을 그대로 받는다"""
    res = client.get("/api/regions")
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "public, max-age=86400"
