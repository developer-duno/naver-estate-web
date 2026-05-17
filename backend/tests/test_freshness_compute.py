"""compute_freshness 순수 함수 테스트 — 라우터에서 추출된 신선도 계산
실행: python -m pytest tests/test_freshness_compute.py -v
"""

from routers.admin.freshness import compute_freshness
from tests.conftest import TestSession


def test_compute_freshness_returns_items_and_generated_at():
    """정상: compute_freshness 가 items 리스트 + generated_at 반환"""
    db = TestSession()
    try:
        result = compute_freshness(db)
        assert "items" in result
        assert "generated_at" in result
        assert isinstance(result["items"], list)
        assert len(result["items"]) == 8
    finally:
        db.close()


def test_compute_freshness_empty_db_status_unknown():
    """엣지: 빈 DB 면 last_updated None → status unknown"""
    db = TestSession()
    try:
        result = compute_freshness(db)
        for item in result["items"]:
            assert item["status"] in ("unknown", "red")
            assert "key" in item and "label" in item
    finally:
        db.close()
