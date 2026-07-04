"""compute_freshness 순수 함수 + 캐시 래퍼 테스트 — 라우터에서 추출된 신선도 계산
실행: python -m pytest tests/test_freshness_compute.py -v
"""

from routers.admin import freshness as fr
from routers.admin.freshness import (
    compute_freshness,
    get_freshness_cached,
    invalidate_freshness_cache,
)


def test_compute_freshness_returns_items_and_generated_at(db):
    """정상: compute_freshness 가 items 리스트 + generated_at 반환"""
    result = compute_freshness(db)
    assert "items" in result
    assert "generated_at" in result
    assert isinstance(result["items"], list)
    assert len(result["items"]) == 8


def test_compute_freshness_empty_db_status_unknown(db):
    """엣지: 빈 DB 면 last_updated None → status unknown"""
    result = compute_freshness(db)
    for item in result["items"]:
        assert item["status"] == "unknown"
        assert "key" in item and "label" in item


def test_freshness_cache_hit_skips_compute(db, monkeypatch):
    """정상: 첫 호출 miss→compute, 둘째 호출 hit→compute 미실행 (DB 안 침)"""
    calls = {"n": 0}
    real = compute_freshness

    def counting(db_):
        calls["n"] += 1
        return real(db_)

    monkeypatch.setattr(fr, "compute_freshness", counting)

    r1 = get_freshness_cached(db)
    r2 = get_freshness_cached(db)
    assert calls["n"] == 1  # 둘째는 캐시 적중 → compute 1회만
    assert r1 == r2


def test_invalidate_freshness_cache_forces_recompute(db, monkeypatch):
    """에러/무효화: invalidate 후 다음 호출은 fresh compute (수집 직후 화면 반영)"""
    calls = {"n": 0}
    real = compute_freshness

    def counting(db_):
        calls["n"] += 1
        return real(db_)

    monkeypatch.setattr(fr, "compute_freshness", counting)

    get_freshness_cached(db)  # 1회 compute + 캐시
    invalidate_freshness_cache()  # 무효화
    get_freshness_cached(db)  # 캐시 비었으니 다시 compute
    assert calls["n"] == 2


# ── 세션 342: _approx_count reltuples 근사 (대형 테이블 count timeout 방지) ──


def test_approx_count_sqlite_falls_back_to_exact(db):
    """SQLite(테스트)는 reltuples 가 없으므로 정확 count 로 폴백해야 한다.
    (prod PostgreSQL 에서만 reltuples 근사, 그 외 dialect 는 exact.)"""
    from sqlalchemy import func, select

    from db.models import Article
    from routers.admin.freshness import _approx_count

    # articles 3건 삽입
    for i in range(3):
        db.add(Article(article_no=f"A{i}", complex_no="1", trade_type_name="매매"))
    db.commit()

    exact_stmt = select(func.count(Article.article_no))
    # SQLite 폴백 = 정확 count 3
    assert _approx_count(db, "articles", exact_stmt) == 3


def test_compute_freshness_articles_count_present(db):
    """compute_freshness 가 articles count 를 (근사든 정확이든) 정수로 반환한다."""
    from db.models import Article

    for i in range(5):
        db.add(Article(article_no=f"B{i}", complex_no="1", trade_type_name="매매"))
    db.commit()

    result = compute_freshness(db)
    art = next(it for it in result["items"] if it["key"] == "articles")
    assert isinstance(art["count"], int)
    assert art["count"] == 5  # SQLite 폴백이라 정확
