"""지역 API 라우터 테스트
실행: python -m pytest tests/test_regions_router.py -v
"""


def test_get_all_regions(client):
    """전체 시도 목록 반환 (dict 형태)"""
    res = client.get("/api/regions")
    assert res.status_code == 200
    data = res.json()
    # KOREA_REGIONS는 dict: {시도: {시군구: [동...]}}
    assert isinstance(data, dict)
    assert "서울특별시" in data


def test_get_sigungu(client):
    """시도별 시군구 목록 반환"""
    res = client.get("/api/regions/서울특별시")
    assert res.status_code == 200
    data = res.json()
    assert "sigungu_list" in data
    assert len(data["sigungu_list"]) > 0


def test_get_dong(client):
    """시군구별 동 목록 반환"""
    # 먼저 서울의 시군구 조회
    res = client.get("/api/regions/서울특별시")
    sigungu_list = res.json()["sigungu_list"]
    first_sigungu = sigungu_list[0]
    res2 = client.get(f"/api/regions/서울특별시/{first_sigungu}")
    assert res2.status_code == 200
    assert "dong_list" in res2.json()


def test_invalid_sido_404(client):
    """존재하지 않는 시도 → 404"""
    res = client.get("/api/regions/존재하지않는시도")
    assert res.status_code == 404
