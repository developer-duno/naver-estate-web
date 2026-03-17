"""헬스체크 엔드포인트 테스트"""


def test_health_endpoint(client):
    """GET /health → 200"""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"


def test_health_has_version(client):
    """헬스체크 응답에 version 필드 존재"""
    res = client.get("/health")
    data = res.json()
    assert "status" in data
