"""compute_freshness 순수 함수 테스트 — 라우터에서 추출된 신선도 계산
실행: python -m pytest tests/test_freshness_compute.py -v
"""

from routers.admin.freshness import compute_freshness


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
