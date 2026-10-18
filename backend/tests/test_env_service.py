"""환경 데이터 수집 서비스 + API 클래스 테스트

응급의료 수집 관련 단위 테스트(대기질 시험은 실시간 수집 폐지 #675 뒤 삭제).
실제 API 호출 없이 로직만 검증.
"""

# ── 응급의료 유틸 테스트 ──


class TestHaversine:
    """Haversine 거리 계산 테스트"""

    def test_같은_좌표_거리_0(self):
        from crawler.emergency_api import haversine

        assert haversine(37.5, 127.0, 37.5, 127.0) == 0.0

    def test_위도_1도_약_111km(self):
        from crawler.emergency_api import haversine

        dist = haversine(37.0, 127.0, 38.0, 127.0)
        assert 110000 < dist < 112000

    def test_서울_부산_약_330km(self):
        from crawler.emergency_api import haversine

        dist = haversine(37.5665, 126.978, 35.1796, 129.0756)
        assert 300000 < dist < 400000


class TestFindNearest:
    """find_nearest 반경 내 응급의료기관 집계 테스트"""

    def test_반경_내_기관_카운트(self):
        from crawler.emergency_api import EmergencyAPI

        facilities = [
            {"name": "A병원", "lat": 37.5665, "lng": 126.978, "beds": 10, "level": "지역응급의료센터", "addr": "서울"},
            {"name": "B병원", "lat": 37.567, "lng": 126.979, "beds": 20, "level": "권역응급의료센터", "addr": "서울"},
            {"name": "C병원", "lat": 38.0, "lng": 127.0, "beds": 5, "level": "지역응급의료기관", "addr": "경기"},
        ]
        result = EmergencyAPI.find_nearest(37.5665, 126.978, facilities, radius_m=3000)
        assert result["count"] == 2  # A, B만 반경 내
        assert result["nearest_dist"] is not None
        assert result["nearest_dist"] < 100  # A병원은 거의 같은 위치

    def test_반경_밖이면_빈_결과(self):
        from crawler.emergency_api import EmergencyAPI

        facilities = [
            {"name": "먼병원", "lat": 38.0, "lng": 127.0, "beds": 5, "level": "", "addr": "경기"},
        ]
        result = EmergencyAPI.find_nearest(37.0, 127.0, facilities, radius_m=1000)
        assert result["count"] == 0
        assert result["nearest_dist"] is None


# ── BasePublicDataAPI 전역 카운터 테스트 ──


class TestGlobalDailyLimit:
    """전역 일일 호출 한도 테스트"""

    def test_한도_초과_시_False(self):
        from unittest.mock import patch

        import crawler.public_data_base as pdb

        # DB 카운터가 한도 초과 반환하도록 mock
        with patch("crawler.quota_db.increment_api_quota", return_value=False):
            assert pdb.check_global_daily_limit() is False
