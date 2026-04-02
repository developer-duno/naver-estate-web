"""환경 데이터 수집 서비스 + API 클래스 테스트

대기질(에어코리아) + 응급의료 수집 관련 단위 테스트.
실제 API 호출 없이 로직만 검증.
"""

from unittest.mock import MagicMock, patch

# ── 에어코리아 유틸 테스트 ──


class TestWgs84ToTm:
    """WGS84 → TM 좌표 변환 테스트"""

    def test_서울시청_변환(self):
        from crawler.air_quality_api import wgs84_to_tm

        tm_x, tm_y = wgs84_to_tm(37.5665, 126.978)
        # 서울시청 TM 좌표 대략 (198000, -48000) 근처
        assert 190000 < tm_x < 210000
        assert -60000 < tm_y < -30000

    def test_원점_근처_변환(self):
        """기준점(38N, 127E) 근처는 false easting 200000에 가까워야 함"""
        from crawler.air_quality_api import wgs84_to_tm

        tm_x, tm_y = wgs84_to_tm(38.0, 127.0)
        assert abs(tm_x - 200000) < 100
        assert abs(tm_y) < 100


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


# ── safe_float 테스트 ──


class TestSafeFloat:
    """에어코리아 측정값 float 변환 방어 테스트"""

    def test_정상_값(self):
        from crawler.air_quality_api import _safe_float

        assert _safe_float("42.5") == 42.5
        assert _safe_float(10) == 10.0

    def test_하이픈은_None(self):
        from crawler.air_quality_api import _safe_float

        assert _safe_float("-") is None

    def test_빈값은_None(self):
        from crawler.air_quality_api import _safe_float

        assert _safe_float("") is None
        assert _safe_float(None) is None


# ── 10일 토요일 skip 로직 테스트 ──


class TestSkipDay:
    """매월 10일 토요일 쿼터 보호 테스트"""

    @patch("crawler.env_service.date")
    def test_10일_토요일이면_skip(self, mock_date):
        mock_date.today.return_value = MagicMock(day=10, weekday=MagicMock(return_value=5))
        from crawler.env_service import _is_skip_day

        assert _is_skip_day() is True

    @patch("crawler.env_service.date")
    def test_10일_월요일이면_정상(self, mock_date):
        mock_date.today.return_value = MagicMock(day=10, weekday=MagicMock(return_value=0))
        from crawler.env_service import _is_skip_day

        assert _is_skip_day() is False


# ── BasePublicDataAPI 전역 카운터 테스트 ──


class TestGlobalDailyLimit:
    """전역 일일 호출 한도 테스트"""

    def test_한도_초과_시_False(self):
        import crawler.public_data_base as pdb

        pdb._global_daily_count = pdb.GLOBAL_DAILY_LIMIT
        pdb._global_daily_date = __import__("datetime").date.today().isoformat()
        assert pdb.check_global_daily_limit() is False
        # 정리
        pdb._global_daily_count = 0
