"""관리자 데이터 신선도 엔드포인트 테스트

실행: python -m pytest tests/test_admin_freshness.py -v
"""
from datetime import datetime, timedelta, timezone

from jose import jwt

from db.mb_models import Infra
from db.models import Complex, UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub):
    return jwt.encode({"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"}, JWT_SECRET, algorithm="HS256")


def _make_admin(db, uid="a1"):
    db.add(UserProfile(user_id=uid, email=f"{uid}@test.com", role="admin", status="approved"))
    db.commit()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _get_item(items, key):
    return next(i for i in items if i["key"] == key)


# ── 인증 ──

def test_freshness_no_auth_401(client):
    """인증 없이 → 401"""
    assert client.get("/api/admin/data-freshness").status_code == 401


# ── 빈 DB ──

def test_freshness_empty_db_unknown(client, db):
    """빈 테이블 → count=0, last_updated=None, status='unknown'"""
    _make_admin(db)
    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    assert res.status_code == 200
    body = res.json()
    assert len(body["items"]) == 8
    for item in body["items"]:
        assert item["count"] == 0
        assert item["last_updated"] is None
        assert item["status"] == "unknown"


# ── 신호등 분기 ──

def test_freshness_status_thresholds(client, db):
    """green / yellow / red 분기 — 단지(주1회=604800초) 기준 시각 주입.

    green: now - 1일 (1.0×, ≤1.5x)
    yellow: now - 9일 (1.29x, ≤1.5x → green) ❌ → 9일은 1.286x 라 green.
            10.5일=1.5x 경계, 12일=1.71x → yellow 진입
    red: now - 22일 (3.14x → red)
    """
    _make_admin(db)
    now = datetime.now(timezone.utc)

    # 단지 1: green 후보 (1일 전)
    db.add(Complex(complex_no="C_GREEN", complex_name="green", last_crawled_at=now - timedelta(days=1)))
    # crime_stats infra 행: yellow 후보 (95일 전 = 1.06x of 90일 → green 실제로). 200일 전 = red
    db.add(Infra(apartment_id="A_RED", crime_score=10, crime_updated_at=now - timedelta(days=300)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    assert res.status_code == 200
    items = res.json()["items"]

    complexes = _get_item(items, "complexes")
    assert complexes["count"] == 1
    assert complexes["status"] == "green", f"1일 전이면 green: {complexes}"

    crime = _get_item(items, "crime_stats")
    assert crime["count"] == 1
    # 분기 작업(90일 주기)에서 300일 전 = 3.33x → red
    assert crime["status"] == "red", f"300일 전이면 red: {crime}"


def test_freshness_status_yellow_boundary(client, db):
    """노랑 경계: 단지 주기 7일 → 1.5x=10.5일 ~ 3x=21일 사이 = yellow"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(Complex(complex_no="C_Y", complex_name="y", last_crawled_at=now - timedelta(days=15)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    item = _get_item(res.json()["items"], "complexes")
    # 15일 / 7일 = 2.14x → yellow (1.5x ~ 3x)
    assert item["status"] == "yellow", item


# ── 응답 스키마 ──

def test_freshness_response_schema(client, db):
    """응답에 generated_at + 8 items 필수 필드 모두 포함"""
    _make_admin(db)
    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    assert res.status_code == 200
    body = res.json()
    assert "generated_at" in body
    keys = {item["key"] for item in body["items"]}
    expected_keys = {
        "complexes", "articles", "complex_price_history", "unsold",
        "air_quality", "childcare", "crime_stats", "public_trades",
    }
    assert keys == expected_keys
    for item in body["items"]:
        for field in ("key", "label", "count", "last_updated", "expected_interval_seconds", "status"):
            assert field in item, f"{field} missing in {item}"
        assert item["status"] in {"green", "yellow", "red", "unknown"}
