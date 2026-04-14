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

    @patch("crawler.env_common.date")
    def test_10일_토요일이면_skip(self, mock_date):
        mock_date.today.return_value = MagicMock(day=10, weekday=MagicMock(return_value=5))
        from crawler.env_service import _is_skip_day

        assert _is_skip_day() is True

    @patch("crawler.env_common.date")
    def test_10일_월요일이면_정상(self, mock_date):
        mock_date.today.return_value = MagicMock(day=10, weekday=MagicMock(return_value=0))
        from crawler.env_service import _is_skip_day

        assert _is_skip_day() is False


# ── _upsert_station 배치 중복 안전성 테스트 ──


class TestUpsertStationBatch:
    """동일 station_name 반복 호출 시 UniqueViolation 방어

    회귀 테스트: 이전 구현(db.merge + SELECT 체크)은 flush 전 동일 pk 중복 INSERT를
    감지 못해 commit 시점에 UniqueViolation으로 배치 전체가 롤백되는 버그 있었음.
    """

    def test_같은_측정소_반복_호출_안전(self, db):
        from crawler.env_air import _upsert_station
        from db.mb_models import AirQualityStation

        # 같은 station_name을 3번 연속 호출 — 실제 배치에서 같은 측정소가 여러 단지에 매핑될 때
        _upsert_station(db, "성산읍", "제주 서귀포시 성산읍")
        _upsert_station(db, "성산읍", "제주 서귀포시 성산읍")
        _upsert_station(db, "성산읍", "제주 서귀포시 성산읍 갱신")
        db.commit()

        rows = db.query(AirQualityStation).filter_by(station_name="성산읍").all()
        assert len(rows) == 1
        assert rows[0].address == "제주 서귀포시 성산읍 갱신"  # 마지막 값으로 업데이트

    def test_다수_측정소_혼합_안전(self, db):
        from crawler.env_air import _upsert_station
        from db.mb_models import AirQualityStation

        # 실제 배치 시나리오: 여러 단지가 여러 측정소에 매핑, 일부는 반복
        for sname in ["동홍동", "남원읍", "동홍동", "성산읍", "남원읍", "동홍동"]:
            _upsert_station(db, sname, f"제주 {sname}")
        db.commit()

        assert db.query(AirQualityStation).count() == 3
        for expected in ("동홍동", "남원읍", "성산읍"):
            assert db.query(AirQualityStation).filter_by(station_name=expected).one()


# ── BasePublicDataAPI 전역 카운터 테스트 ──


# ── 범죄통계 키 정규화 테스트 ──


class TestBuildPopulationMap:
    """_build_population_map 다중 키 형식 생성 테스트"""

    def test_축약_지역명을_정식명으로_확장(self):
        """서울 → 서울특별시 키도 함께 생성"""
        from crawler.env_service import _build_population_map

        pop_rows = [("서울", "강남구", 500000)]
        result = _build_population_map(pop_rows)
        assert result["서울_강남구"] == 500000
        assert result["서울특별시_강남구"] == 500000

    def test_경기_축약명_확장(self):
        """경기 → 경기도 (DB 축약명 'ㅎ경기'가 API '경기도'와 매칭)"""
        from crawler.env_service import _build_population_map

        pop_rows = [("경기", "수원시", 1200000)]
        result = _build_population_map(pop_rows)
        assert result["경기_수원시"] == 1200000
        assert result["경기도_수원시"] == 1200000

    def test_구_접미사_없는_gu에_접미사_추가(self):
        """강남 → 강남구/강남시/강남군 변형 생성"""
        from crawler.env_service import _build_population_map

        pop_rows = [("서울", "강남", 500000)]
        result = _build_population_map(pop_rows)
        assert result["서울_강남"] == 500000
        assert result["서울_강남구"] == 500000
        assert result["서울특별시_강남"] == 500000
        assert result["서울특별시_강남구"] == 500000

    def test_정식명_region은_중복_없이_처리(self):
        """경기도 같은 이미 정식명은 중복 생성 안 함"""
        from crawler.env_service import _build_population_map

        pop_rows = [("경기도", "수원시", 1200000)]
        result = _build_population_map(pop_rows)
        assert result["경기도_수원시"] == 1200000

    def test_gu_없는_세종시(self):
        """세종 → 세종특별자치시 (gu 없음)"""
        from crawler.env_service import _build_population_map

        pop_rows = [("세종", None, 380000)]
        result = _build_population_map(pop_rows)
        assert result["세종"] == 380000
        assert result["세종특별자치시"] == 380000


class TestBuildScoreLookup:
    """_build_score_lookup 역방향 키 매핑 테스트"""

    def test_정식명에서_축약형_역매핑(self):
        """서울특별시_강남구 → 서울_강남구, 서울_강남 도 조회 가능"""
        from crawler.env_service import _build_score_lookup

        scored = {
            "서울특별시_강남구": {"crime_score": 85, "crime_grade": "A"},
        }
        lookup = _build_score_lookup(scored)
        assert lookup["서울특별시_강남구"]["crime_score"] == 85
        assert lookup["서울_강남구"]["crime_score"] == 85
        assert lookup["서울_강남"]["crime_score"] == 85

    def test_경기도에서_경기_축약(self):
        """경기도_수원시 → 경기_수원시, 경기_수원 도 조회 가능"""
        from crawler.env_service import _build_score_lookup

        scored = {
            "경기도_수원시": {"crime_score": 70, "crime_grade": "B"},
        }
        lookup = _build_score_lookup(scored)
        assert lookup["경기도_수원시"]["crime_score"] == 70
        assert lookup["경기_수원시"]["crime_score"] == 70
        assert lookup["경기도_수원"]["crime_score"] == 70
        assert lookup["경기_수원"]["crime_score"] == 70

    def test_강원특별자치도_역매핑(self):
        """강원특별자치도_강릉시 → 강원_강릉시 도 조회 가능"""
        from crawler.env_service import _build_score_lookup

        scored = {
            "강원특별자치도_강릉시": {"crime_score": 60, "crime_grade": "B"},
        }
        lookup = _build_score_lookup(scored)
        assert lookup["강원특별자치도_강릉시"]["crime_score"] == 60
        assert lookup["강원_강릉시"]["crime_score"] == 60
        assert lookup["강원도_강릉시"]["crime_score"] == 60


class TestLookupScore:
    """_lookup_score 폴백 조회 테스트"""

    def test_정확한_키_매칭(self):
        from crawler.env_service import _lookup_score

        lookup = {"경기_수원시": {"crime_score": 70, "crime_grade": "B"}}
        result = _lookup_score(lookup, "경기", "수원시")
        assert result["crime_score"] == 70

    def test_하위구_폴백_상위시(self):
        """수원시 영통구 → 수원시로 폴백"""
        from crawler.env_service import _lookup_score

        lookup = {"경기_수원시": {"crime_score": 70, "crime_grade": "B"}}
        result = _lookup_score(lookup, "경기", "수원시 영통구")
        assert result["crime_score"] == 70

    def test_특수_gu_폴백_region(self):
        """행정중심복합도시 → 세종으로 폴백"""
        from crawler.env_service import _lookup_score

        lookup = {"세종": {"crime_score": 65, "crime_grade": "B"}}
        result = _lookup_score(lookup, "세종", "행정중심복합도시")
        assert result["crime_score"] == 65

    def test_구만_저장된_경우_상위시_폴백(self):
        """기흥구 → 용인시로 매핑"""
        from crawler.env_service import _lookup_score

        lookup = {"경기_용인시": {"crime_score": 72, "crime_grade": "B"}}
        result = _lookup_score(lookup, "경기", "기흥구")
        assert result["crime_score"] == 72

    def test_시군_접미사_교체(self):
        """홍천시 → 홍천군으로 폴백"""
        from crawler.env_service import _lookup_score

        lookup = {"강원_홍천군": {"crime_score": 80, "crime_grade": "A"}}
        result = _lookup_score(lookup, "강원", "홍천시")
        assert result["crime_score"] == 80

    def test_region만_폴백(self):
        """세종 + 특수 gu → 세종 region-only"""
        from crawler.env_service import _lookup_score

        lookup = {"세종": {"crime_score": 65, "crime_grade": "B"}}
        result = _lookup_score(lookup, "세종", "행정중심복합도시")
        assert result["crime_score"] == 65

    def test_매칭_불가_None(self):
        from crawler.env_service import _lookup_score

        result = _lookup_score({}, "없는지역", "없는구")
        assert result is None

    def test_gu_없는_경우(self):
        from crawler.env_service import _lookup_score

        lookup = {"세종": {"crime_score": 65, "crime_grade": "B"}}
        result = _lookup_score(lookup, "세종", None)
        assert result["crime_score"] == 65


class TestComputeMedianScore:
    """_compute_median_score 중앙값 폴백 테스트"""

    def test_중앙값_산출(self):
        from crawler.env_service import _compute_median_score

        scored = {
            "a": {"crime_score": 90, "crime_grade": "A"},
            "b": {"crime_score": 50, "crime_grade": "C"},
            "c": {"crime_score": 30, "crime_grade": "D"},
        }
        result = _compute_median_score(scored)
        assert result["crime_score"] == 50
        assert result["crime_grade"] == "C"

    def test_빈_scored(self):
        from crawler.env_service import _compute_median_score

        assert _compute_median_score({}) is None


class TestGlobalDailyLimit:
    """전역 일일 호출 한도 테스트"""

    def test_한도_초과_시_False(self):
        from unittest.mock import patch

        import crawler.public_data_base as pdb

        # DB 카운터가 한도 초과 반환하도록 mock
        with patch("crawler.quota_db.increment_api_quota", return_value=False):
            assert pdb.check_global_daily_limit() is False
