"""관리자 데이터 신선도 엔드포인트 테스트

실행: python -m pytest tests/test_admin_freshness.py -v
"""
from datetime import datetime, timedelta, timezone

import jwt

from db.mb_models import Infra
from db.models import Article, Complex, CrawlJob, UserProfile
from routers.admin.freshness import invalidate_freshness_cache

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
        for field in (
            "key", "label", "count", "last_updated", "expected_interval_seconds",
            "status", "spinning", "last_job", "new_rows",
        ):
            assert field in item, f"{field} missing in {item}"
        assert item["status"] in {"green", "yellow", "red", "unknown"}


# ── 헛바퀴 감지 (작업 메타 + new_rows) ──

def _make_completed_job(db, sched_id: str, *, started_at, completed_at, processed: int, total: int):
    db.add(CrawlJob(
        job_type="test",
        scheduler_job_id=sched_id,
        status="completed",
        started_at=started_at,
        completed_at=completed_at,
        processed_items=processed,
        total_items=total,
    ))
    db.commit()


def test_freshness_spinning_zero_processed(client, db):
    """processed=0, total>0 → 헛바퀴 빨강 격상"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    # 어린이집 수집기가 막 끝났는데 0/100 처리
    _make_completed_job(
        db, "collect_childcare",
        started_at=now - timedelta(minutes=10), completed_at=now - timedelta(minutes=8),
        processed=0, total=100,
    )

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    items = res.json()["items"]
    childcare = _get_item(items, "childcare")
    assert childcare["spinning"] is True
    assert childcare["status"] == "red"
    assert childcare["last_job"]["processed_items"] == 0
    assert childcare["last_job"]["total_items"] == 100


def test_freshness_articles_new_rows_counted(client, db):
    """매물 크롤 작업 후 articles.created_at>=job_start 신규 행 수 카운트"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    job_start = now - timedelta(minutes=30)
    job_end = now - timedelta(minutes=10)
    _make_completed_job(
        db, "crawl_articles",
        started_at=job_start, completed_at=job_end,
        processed=50, total=50,
    )
    # 작업 시작 전 기존 매물 1건
    db.add(Article(article_no="OLD1", complex_no="C1", created_at=now - timedelta(hours=2), updated_at=now - timedelta(hours=2)))
    # 작업 시작 후 신규 2건
    db.add(Article(article_no="NEW1", complex_no="C1", created_at=job_start + timedelta(minutes=5), updated_at=job_start + timedelta(minutes=5)))
    db.add(Article(article_no="NEW2", complex_no="C1", created_at=job_start + timedelta(minutes=10), updated_at=job_start + timedelta(minutes=10)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    assert arts["new_rows"] == 2
    assert arts["spinning"] is False
    assert arts["last_job"]["processed_items"] == 50


def test_freshness_articles_spinning_no_new_rows(client, db):
    """매물 크롤 작업 돌았는데 new_rows=0 → 헛바퀴 빨강"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    job_start = now - timedelta(minutes=30)
    _make_completed_job(
        db, "crawl_articles",
        started_at=job_start, completed_at=now - timedelta(minutes=10),
        processed=10, total=10,
    )
    # 작업 시작 전 매물만 존재 → 신규 0건
    db.add(Article(article_no="OLD", complex_no="C1", created_at=now - timedelta(hours=2), updated_at=now - timedelta(hours=2)))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    assert arts["new_rows"] == 0
    assert arts["spinning"] is True
    assert arts["status"] == "red"


def test_freshness_no_job_meta_fields_null(client, db):
    """정기 job 없는 종목(미분양) → last_job=None, new_rows=None, spinning=False"""
    _make_admin(db)
    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    unsold = _get_item(res.json()["items"], "unsold")
    assert unsold["last_job"] is None
    assert unsold["new_rows"] is None
    assert unsold["spinning"] is False


# ── batch 합산 (세션 219 false alarm 회귀 가드) ──
# 한 batch = 같은 scheduler_job_id 가 마지막 60분 윈도우 안에 연속 실행된 잡들의 묶음.
# crawl_articles_batch 가 50단지를 한 번에 도는 동안 단지별로 CrawlJob row N 개가 생기는데,
# 마지막 1건만 보면 dead 단지(proc=0/total=0)가 우연히 마지막이면 화면이 "처리 0/0" 으로
# 보여 사용자가 "헛바퀴" 로 오해. 세션 219 텔레그램 false alarm 7건의 root cause.


def test_freshness_batch_aggregates_processed_and_total(client, db):
    """같은 batch (마지막 60분) 의 잡들은 processed/total 을 합산해 노출."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    batch_start = now - timedelta(minutes=30)
    # 3개 잡 = 정상(20/20) + 정상(15/15) + dead 단지(0/0) — 마지막이 0/0
    _make_completed_job(
        db, "crawl_articles",
        started_at=batch_start, completed_at=batch_start + timedelta(seconds=5),
        processed=20, total=20,
    )
    _make_completed_job(
        db, "crawl_articles",
        started_at=batch_start + timedelta(seconds=10),
        completed_at=batch_start + timedelta(seconds=15),
        processed=15, total=15,
    )
    _make_completed_job(
        db, "crawl_articles",
        started_at=batch_start + timedelta(seconds=20),
        completed_at=batch_start + timedelta(seconds=21),
        processed=0, total=0,
    )

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    assert arts["last_job"]["processed_items"] == 35, arts["last_job"]
    assert arts["last_job"]["total_items"] == 35, arts["last_job"]


def test_freshness_batch_zero_total_only_not_spinning(client, db):
    """batch 안에 0/0 잡만 있어도 헛바퀴 판정 X — 단지에 매물 0건은 정상.

    세션 219 false alarm 의 root cause. 50단지 중 모두 매물 0건 케이스에
    sum_total=0 → spinning 조건 (sum_total>0 AND sum_processed==0) 미충족.
    """
    _make_admin(db)
    now = datetime.now(timezone.utc)
    batch_start = now - timedelta(minutes=20)
    for i in range(3):
        _make_completed_job(
            db, "crawl_articles",
            started_at=batch_start + timedelta(seconds=i * 2),
            completed_at=batch_start + timedelta(seconds=i * 2 + 1),
            processed=0, total=0,
        )

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    assert arts["last_job"]["processed_items"] == 0
    assert arts["last_job"]["total_items"] == 0
    # 매물 1건 추가 (batch 시작 후) → new_rows=1 → spinning=False
    db.add(Article(
        article_no="N1", complex_no="C1",
        created_at=batch_start + timedelta(minutes=1),
        updated_at=batch_start + timedelta(minutes=1),
    ))
    db.commit()
    # data-freshness 5분 캐시(세션 260) — 실운영은 수집 후 invalidate 되므로 즉시 반영.
    # 테스트도 DB 변경 후 무효화해 둘째 GET 이 fresh compute 하도록.
    invalidate_freshness_cache()
    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    assert arts["new_rows"] == 1
    assert arts["spinning"] is False


def test_freshness_batch_new_rows_uses_batch_start(client, db):
    """new_rows 카운트는 batch 첫 잡의 started_at 기준 (마지막 잡 X)."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    batch_start = now - timedelta(minutes=40)
    last_job_start = now - timedelta(minutes=10)
    # 첫 잡 (batch 시작)
    _make_completed_job(
        db, "crawl_articles",
        started_at=batch_start, completed_at=batch_start + timedelta(seconds=5),
        processed=10, total=10,
    )
    # 마지막 잡 (batch 끝)
    _make_completed_job(
        db, "crawl_articles",
        started_at=last_job_start, completed_at=last_job_start + timedelta(seconds=5),
        processed=5, total=5,
    )
    # batch 시작 후, 마지막 잡 시작 전에 들어온 매물 1건 — batch 기준이면 카운트됨
    db.add(Article(
        article_no="MID", complex_no="C1",
        created_at=batch_start + timedelta(minutes=5),
        updated_at=batch_start + timedelta(minutes=5),
    ))
    db.commit()

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    # 마지막 잡만 기준이면 0, batch 첫 잡 기준이면 1
    assert arts["new_rows"] == 1, f"batch_start 기준이어야 함: {arts}"


def test_freshness_batch_window_separates_old_batch(client, db):
    """60분 윈도우 밖 잡은 다른 batch 로 취급 — 합산 안 됨."""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    # 오래된 batch (3시간 전, 윈도우 밖)
    _make_completed_job(
        db, "crawl_articles",
        started_at=now - timedelta(hours=3),
        completed_at=now - timedelta(hours=3) + timedelta(seconds=5),
        processed=999, total=999,
    )
    # 최근 batch (20분 전, 윈도우 안)
    _make_completed_job(
        db, "crawl_articles",
        started_at=now - timedelta(minutes=20),
        completed_at=now - timedelta(minutes=20) + timedelta(seconds=5),
        processed=5, total=5,
    )

    res = client.get("/api/admin/data-freshness", headers=_auth(_token("a1")))
    arts = _get_item(res.json()["items"], "articles")
    # 999 가 합산되면 버그. 최근 batch (5) 만 합산
    assert arts["last_job"]["processed_items"] == 5, arts["last_job"]
    assert arts["last_job"]["total_items"] == 5, arts["last_job"]
